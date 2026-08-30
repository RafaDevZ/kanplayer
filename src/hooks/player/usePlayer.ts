import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import localforage from "localforage";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

export type AudioFile = {
  name: string;
  path: string;
};

export interface PlayerSyncProps {
  seekTime?: number;
  onDurationChange?: (duration: number) => void;
  onTimeChange?: (currentTime: number) => void;
}

export function usePlayer(
  initialAudio?: AudioFile,
  loadAudioList = true,
  sync?: PlayerSyncProps,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncRef = useRef(sync);
  const timelineRef = useRef<HTMLInputElement>(null);
  const timelineThumbRef = useRef<HTMLDivElement>(null);
  const playbackAnchorRef = useRef({ time: 0, timestamp: 0 });
  const [managerOpen, setManagerOpen] = useState(false);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<AudioFile | null>(
    initialAudio ?? null,
  );
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isVolumeLoaded, setIsVolumeLoaded] = useState(false);
  syncRef.current = sync;

  const updateTimelineVisual = (time: number, audioDuration: number) => {
    if (!Number.isFinite(time) || !Number.isFinite(audioDuration)) return;
    syncRef.current?.onTimeChange?.(time);

    const timeline = timelineRef.current;
    if (!timeline) return;
    const progress = audioDuration > 0 ? (time / audioDuration) * 100 : 0;
    timeline.value = time.toString();
    timeline.style.setProperty("--progress", `${progress}%`);
    timelineThumbRef.current?.style.setProperty("--progress", `${progress}%`);
  };

  const updatePlaybackAnchor = (time: number) => {
    if (Number.isFinite(time))
      playbackAnchorRef.current = { time, timestamp: performance.now() };
  };

  useEffect(() => {
    if (!loadAudioList) return;
    invoke<AudioFile[]>("list_downloads_audio")
      .then(setAudioFiles)
      .catch(() =>
        setLoadError(
          "Não foi possível carregar as músicas da pasta Downloads.",
        ),
      );
  }, [loadAudioList]);

  useEffect(() => {
    let isMounted = true;
    localforage
      .getItem<number>("kanplayer-volume")
      .then((savedVolume) => {
        if (
          isMounted &&
          typeof savedVolume === "number" &&
          savedVolume >= 0 &&
          savedVolume <= 1
        ) {
          setVolume(savedVolume);
        }
      })
      .finally(() => {
        if (isMounted) setIsVolumeLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeAudio && audioRef.current) audioRef.current.load();
  }, [activeAudio]);

  useEffect(() => {
    if (!initialAudio) return;
    audioRef.current?.pause();
    setDuration(0);
    setIsPlaying(false);
    updatePlaybackAnchor(0);
    updateTimelineVisual(0, 0);
    setActiveAudio(initialAudio);
  }, [initialAudio?.path]);

  useEffect(() => {
    // Não aplique o valor padrão enquanto a preferência persistida ainda
    // está sendo carregada; isso causava volume incorreto ao trocar de tela.
    if (isVolumeLoaded && audioRef.current) audioRef.current.volume = volume;
  }, [activeAudio?.path, isVolumeLoaded, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    const requestedTime = sync?.seekTime;
    if (
      !audio ||
      requestedTime === undefined ||
      !Number.isFinite(audio.duration)
    )
      return;
    const time = Math.max(0, Math.min(requestedTime, audio.duration));
    audio.currentTime = time;
    updatePlaybackAnchor(time);
    updateTimelineVisual(time, audio.duration);
  }, [sync?.seekTime]);

  useEffect(() => {
    if (!isPlaying) return;
    let animationFrameId: number;
    const animateTimeline = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const anchor = playbackAnchorRef.current;
        const elapsed = (performance.now() - anchor.timestamp) / 1000;
        updateTimelineVisual(
          Math.min(audio.duration, anchor.time + elapsed * audio.playbackRate),
          audio.duration,
        );
      }
      animationFrameId = requestAnimationFrame(animateTimeline);
    };
    animationFrameId = requestAnimationFrame(animateTimeline);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  useEffect(() => {
    if (isVolumeLoaded) void localforage.setItem("kanplayer-volume", volume);
  }, [isVolumeLoaded, volume]);

  const selectAudio = (audioFile: AudioFile) => {
    audioRef.current?.pause();
    setDuration(0);
    setIsPlaying(false);
    updatePlaybackAnchor(0);
    updateTimelineVisual(0, 0);
    setActiveAudio(audioFile);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !activeAudio) return;
    if (audio.paused) audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  };

  const handleTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const time = Number(event.target.value);
    if (!audio) return;
    audio.currentTime = time;
    updatePlaybackAnchor(time);
    updateTimelineVisual(time, audio.duration);
  };

  return {
    activeAudio,
    audioRef,
    audioFiles,
    audioProps: {
      ref: audioRef,
      crossOrigin: "anonymous" as const,
      src: activeAudio ? convertFileSrc(activeAudio.path) : undefined,
      onLoadedMetadata: (event: ChangeEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (isVolumeLoaded) audio.volume = volume;
        setDuration(audio.duration);
        syncRef.current?.onDurationChange?.(audio.duration);
        updatePlaybackAnchor(audio.currentTime);
        updateTimelineVisual(audio.currentTime, audio.duration);
      },
      onTimeUpdate: (event: ChangeEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        updatePlaybackAnchor(audio.currentTime);
        updateTimelineVisual(audio.currentTime, audio.duration);
      },
      onRateChange: (event: ChangeEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        updatePlaybackAnchor(audio.currentTime);
        updateTimelineVisual(audio.currentTime, audio.duration);
      },
      onPlay: () => {
        if (audioRef.current) {
          updatePlaybackAnchor(audioRef.current.currentTime);
          updateTimelineVisual(
            audioRef.current.currentTime,
            audioRef.current.duration,
          );
        }
        setIsPlaying(true);
      },
      onPause: () => {
        if (audioRef.current) {
          updatePlaybackAnchor(audioRef.current.currentTime);
          updateTimelineVisual(
            audioRef.current.currentTime,
            audioRef.current.duration,
          );
        }
        setIsPlaying(false);
      },
      onEnded: () => {
        setIsPlaying(false);
        updatePlaybackAnchor(0);
        updateTimelineVisual(0, duration);
      },
    },
    isPlaying,
    loadError,
    managerOpen,
    selectAudio,
    timeline: {
      disabled: !activeAudio || duration === 0,
      max: duration || 0,
      min: 0,
      onChange: handleTimelineChange,
      ref: timelineRef,
      thumbRef: timelineThumbRef,
      step: 0.01,
    },
    toggleManager: () => setManagerOpen((isOpen) => !isOpen),
    togglePlayback,
    volume: {
      max: 1,
      min: 0,
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setVolume(Number(event.target.value)),
      progress: volume * 100,
      step: 0.01,
      value: volume,
    },
  };
}
