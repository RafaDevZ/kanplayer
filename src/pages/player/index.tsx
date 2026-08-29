import { useEffect, type CSSProperties } from "react";
import { Icons } from "../../components/Icons";
import { usePlayer } from "../../hooks/player/usePlayer";
import * as PL from "./styles";

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
}

export default function Player({
  audio,
  showManager = true,
  seekTime,
  onDurationChange,
  onTimeChange,
  enableSpacebarShortcut = false,
}: PlayerProps) {
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
  } = usePlayer(audio, showManager, {
    seekTime,
    onDurationChange,
    onTimeChange,
  });

  useEffect(() => {
    if (!enableSpacebarShortcut) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableSpacebarShortcut, togglePlayback]);

  return (
    <PL.Body>
      <PL.PlayerAudio
        key={activeAudio?.path}
        preload="metadata"
        {...audioProps}
      />
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
            onClick={togglePlayback}
          >
            {isPlaying ? Icons.pauseIcon : Icons.playIcon}
          </PL.PlayerControlButton>
        </PL.PlayerControls>
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
