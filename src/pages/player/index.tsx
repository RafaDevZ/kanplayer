import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icons } from "../../components/Icons";
import { usePlayer } from "../../hooks/player/usePlayer";
import { connectVocalAnalysis, disconnectAudioAnalysis, disconnectVocalAnalysis, setAudioOutputMode, setVocalOutputVolume } from "../../hooks/player/audioAnalysis";
import * as PL from "./styles";

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

export interface PlayerProps {
  audio?: {
    name: string;
    path: string;
  };
  showManager?: boolean;
  seekTime?: number;
  onDurationChange?: (duration: number) => void;
  onTimeChange?: (currentTime: number) => void;
  enableSpacebarShortcut?: boolean;
  vocalExtraction?: {
    extracted: boolean;
    processing?: boolean;
    onExtract: () => void;
  };
  vocalAnalysisPath?: string;
}

export default function Player({
  audio,
  showManager = true,
  seekTime,
  onDurationChange,
  onTimeChange,
  enableSpacebarShortcut = false,
  vocalExtraction,
  vocalAnalysisPath,
}: PlayerProps) {
  const vocalAudioRef = useRef<HTMLAudioElement>(null);
  const {
    activeAudio,
    audioFiles,
    audioProps,
    isPlaying,
    loadError,
    managerOpen,
    selectAudio,
    timeline,
    toggleManager,
    togglePlayback,
    volume,
    currentTime,
    duration,
    audioRef,
  } = usePlayer(audio, showManager, {
    seekTime,
    onDurationChange,
    onTimeChange: (time) => {
      const vocalAudio = vocalAudioRef.current;
      if (vocalAudio && Math.abs(vocalAudio.currentTime - time) > 0.04) {
        vocalAudio.currentTime = time;
      }
      onTimeChange?.(time);
    },
  });
  const [audioOutputMode, setAudioOutputModeState] = useState<"music" | "vocal">("music");
  const syncAndPlayVocal = () => {
    const mainAudio = audioRef.current;
    const vocalAudio = vocalAudioRef.current;
    if (!mainAudio || !vocalAudio || !vocalAnalysisPath) return;
    vocalAudio.currentTime = mainAudio.currentTime;
    void vocalAudio.play().catch(() => undefined);
  };
  const handlePlaybackToggle = () => {
    // Inicia ambos dentro do mesmo gesto do usuário. Em WebView isso evita
    // que o play do áudio auxiliar seja bloqueado como autoplay.
    if (audioRef.current?.paused && vocalAnalysisPath) syncAndPlayVocal();
    togglePlayback();
  };
  const playbackToggleRef = useRef(handlePlaybackToggle);
  playbackToggleRef.current = handlePlaybackToggle;

  useEffect(() => {
    if (!vocalAnalysisPath && audioOutputMode === "vocal") setAudioOutputModeState("music");
  }, [audioOutputMode, vocalAnalysisPath]);

  useEffect(() => {
    setAudioOutputMode(audioOutputMode);
  }, [audioOutputMode, vocalAnalysisPath]);

  useEffect(() => {
    setVocalOutputVolume(volume.value);
  }, [volume.value]);

  useEffect(() => () => {
    // As refs DOM já podem estar nulas quando o cleanup passivo roda. Os
    // grafos são singletons, portanto libere explicitamente os grafos atuais.
    disconnectAudioAnalysis();
    disconnectVocalAnalysis();
  }, [audioRef]);

  useEffect(() => {
    const vocalAudio = vocalAudioRef.current;
    if (!vocalAudio || !vocalAnalysisPath) return;
    vocalAudio.load();
  }, [vocalAnalysisPath]);

  useEffect(() => {
    const mainAudio = audioRef.current;
    const vocalAudio = vocalAudioRef.current;
    if (!mainAudio || !vocalAudio || !vocalAnalysisPath) return;
    if (isPlaying) {
      vocalAudio.currentTime = mainAudio.currentTime;
      void vocalAudio.play();
    } else {
      vocalAudio.pause();
      vocalAudio.currentTime = mainAudio.currentTime;
    }
  }, [audioRef, isPlaying, vocalAnalysisPath]);

  useEffect(() => {
    if (!enableSpacebarShortcut) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      playbackToggleRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableSpacebarShortcut]);

  return (
    <PL.Body>
      <PL.PlayerAudio
        key={activeAudio?.path}
        preload="metadata"
        {...audioProps}
        onPlay={() => {
          audioProps.onPlay();
          syncAndPlayVocal();
        }}
      />
      {vocalAnalysisPath && (
        <PL.PlayerAudio
          ref={vocalAudioRef}
          preload="auto"
          crossOrigin="anonymous"
          src={convertFileSrc(vocalAnalysisPath)}
          onLoadedMetadata={(event) => {
            const vocalAudio = event.currentTarget;
            connectVocalAnalysis(vocalAudio);
            const mainAudio = audioRef.current;
            if (isPlaying && mainAudio) {
              vocalAudio.currentTime = mainAudio.currentTime;
              void vocalAudio.play();
            }
          }}
        />
      )}
      {showManager && (
        <PL.ListContainer $open={managerOpen}>
          <PL.TrackList>
            {loadError && <PL.ListMessage>{loadError}</PL.ListMessage>}
            {!loadError && audioFiles.length === 0 && (
              <PL.ListMessage>Nenhuma música encontrada.</PL.ListMessage>
            )}
            {audioFiles.map((audioFile) => (
              <PL.TrackItem
                key={audioFile.path}
                $active={audioFile.path === activeAudio?.path}
                title={audioFile.path}
                onClick={() => selectAudio(audioFile)}
              >
                {audioFile.name}
              </PL.TrackItem>
            ))}
          </PL.TrackList>
          <PL.ListContainerManager
            type="button"
            aria-label={
              managerOpen ? "Fechar lista de músicas" : "Abrir lista de músicas"
            }
            onClick={toggleManager}
          >
            {Icons.hamburguerIcon}
          </PL.ListContainerManager>
        </PL.ListContainer>
      )}
      <PL.TimelineContainer>
        <PL.TimelineTimeLabel $side="left">{formatTime(currentTime)}</PL.TimelineTimeLabel>
        <PL.TimelineSlider>
          <PL.TimelineThumbTrack>
            <PL.TimelineThumb ref={timeline.thumbRef} />
          </PL.TimelineThumbTrack>
          <PL.TimelineInput
            ref={timeline.ref}
            $hideThumb
            min={timeline.min}
            max={timeline.max}
            step={timeline.step}
            defaultValue={0}
            disabled={timeline.disabled}
            onChange={timeline.onChange}
          />
        </PL.TimelineSlider>
        <PL.TimelineTimeLabel $side="right">-{formatTime(Math.max(0, duration - currentTime))}</PL.TimelineTimeLabel>
      </PL.TimelineContainer>
      <PL.PlayerContainer>
        <PL.TrackName title={activeAudio?.name}>
          {activeAudio?.name}
        </PL.TrackName>
        <PL.PlayerControls>
          <PL.PlayerControlButton
            type="button"
            disabled={!activeAudio}
            aria-label={isPlaying ? "Pausar música" : "Tocar música"}
            onClick={handlePlaybackToggle}
          >
            {isPlaying ? Icons.pauseIcon : Icons.playIcon}
          </PL.PlayerControlButton>
          <PL.AudioModeControl>
            <span>Música</span>
            <PL.AudioModeToggle
              type="button"
              $active={audioOutputMode === "vocal"}
              disabled={!vocalAnalysisPath}
              aria-label="Saída de áudio: música ou somente vocal"
              aria-pressed={audioOutputMode === "vocal"}
              onClick={() => setAudioOutputModeState((mode) => {
                const nextMode = mode === "music" ? "vocal" : "music";
                setAudioOutputMode(nextMode);
                if (nextMode === "vocal" && isPlaying) syncAndPlayVocal();
                return nextMode;
              })}
            />
            <span>Vocal only</span>
          </PL.AudioModeControl>
        </PL.PlayerControls>
        {vocalExtraction && (
          <PL.VocalExtractionButton
            type="button"
            disabled={!activeAudio || vocalExtraction.extracted || vocalExtraction.processing}
            onClick={vocalExtraction.onExtract}
          >
            {vocalExtraction.extracted ? "Vocal extraído" : vocalExtraction.processing ? "Extraindo vocal..." : "Extrair vocal da música"}
          </PL.VocalExtractionButton>
        )}
        <PL.VolumeContainer>
          <PL.TimelineInput
            style={{ "--progress": `${volume.progress}%` } as CSSProperties}
            min={volume.min}
            max={volume.max}
            step={volume.step}
            value={volume.value}
            aria-label="Volume"
            onChange={volume.onChange}
          />
        </PL.VolumeContainer>
      </PL.PlayerContainer>
    </PL.Body>
  );
}
