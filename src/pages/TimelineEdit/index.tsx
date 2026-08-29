import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { HexColorPicker } from "react-colorful";
import * as TE from "./styles";
import { Icons } from "../../components/Icons";
import {
  Button,
  MaskedInput,
  TitledInput,
} from "../../components/DefaultComponents";
import Window from "../../components/Window";
import { useTimeline, useUpdateTimeline } from "../../queries/useTimelines";
import { useRitraceCancel, useRitraceRender } from "../../queries/useRitrace";
import {
  ritraceProgressSchema,
  type RitraceProgressProps,
} from "../../interfaces/Ritrace";
import Dropdown from "../../components/Dropdown";
import { DropdownOption } from "../../components/Dropdown/styles";
import Player from "../player";
import {
  timelineEventSchema,
  type TimelineEventProps,
} from "../../interfaces/TimelineEvent";
import { timelineSchema, type TimelineProps } from "../../interfaces/Timeline";
import {
  createTimelineStem,
  defaultTimelineStems,
} from "../../interfaces/TimelineStem";

const beatsPerBar = 4;
const barBoundaryToleranceSeconds = 0.001;

const getNiceInterval = (minimumInterval: number) => {
  if (minimumInterval <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(minimumInterval));
  const normalizedInterval = minimumInterval / magnitude;
  const factor = normalizedInterval <= 2 ? 2 : normalizedInterval <= 5 ? 5 : 10;
  return factor * magnitude;
};

const formatBpm = (bpm: number) =>
  Number.isInteger(bpm) ? String(bpm) : String(Number(bpm.toFixed(2)));

const firstBeatMask = "**:**.***";

const formatFirstBeatRaw = (seconds: number) => {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1_000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const remainingMilliseconds = totalMilliseconds % 60_000;
  const wholeSeconds = Math.floor(remainingMilliseconds / 1_000);
  const milliseconds = remainingMilliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}${String(wholeSeconds).padStart(2, "0")}${String(milliseconds).padStart(3, "0")}`;
};

const parseFirstBeatRaw = (raw: string) => {
  if (!/^\d{7}$/.test(raw)) return;
  const minutes = Number(raw.slice(0, 2));
  const seconds = Number(raw.slice(2, 4));
  const milliseconds = Number(raw.slice(4, 7));
  if (seconds >= 60) return;
  return minutes * 60 + seconds + milliseconds / 1_000;
};

const formatElapsedTime = (elapsedSeconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  return `Tempo decorrido: ${Math.floor(totalSeconds / 60)}:${String(
    totalSeconds % 60,
  ).padStart(2, "0")}`;
};

const snapOptions = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/32",
  "1/64",
  "1/4T",
  "1/8T",
  "1/16T",
  "1/32T",
  "1/2 bar",
  "1 bar",
  "2 bars",
  "4 bars",
  "none",
] as const;

type SnapValue = (typeof snapOptions)[number];

interface TimelineEditProps {
  trackPath: string;
  onBack: () => void;
}

export default function TimelineEdit({ trackPath, onBack }: TimelineEditProps) {
  const { data: savedTimeline, isLoading } = useTimeline(trackPath);
  const [timeline, setTimeline] = useState<TimelineProps>();
  const [snap, setSnap] = useState<SnapValue>("1/16");
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const [isRitraceWindowVisible, setIsRitraceWindowVisible] = useState(false);
  const [ritraceConfidence, setRitraceConfidence] = useState({
    kick: 30,
    snare: 25,
    hihat: 20,
  });
  const [ritraceProgress, setRitraceProgress] = useState<RitraceProgressProps>();
  const [ritraceJobId, setRitraceJobId] = useState<string>();
  const [isRitraceRenderComplete, setIsRitraceRenderComplete] =
    useState(false);
  const [ritraceClock, setRitraceClock] = useState(0);
  const [isPlayheadFollowEnabled, setIsPlayheadFollowEnabled] = useState(false);
  const [playerDurationSeconds, setPlayerDurationSeconds] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [visibleBars, setVisibleBars] = useState<number>(4);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [requestedPlayerTime, setRequestedPlayerTime] = useState<number>();
  const [draggedEvent, setDraggedEvent] = useState<TimelineEventProps>();
  const [draggedEventTimes, setDraggedEventTimes] = useState(
    new Map<number, number>(),
  );
  const [pendingEvent, setPendingEvent] = useState<TimelineEventProps>();
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [selectedStemIds, setSelectedStemIds] = useState<number[]>([]);
  const [colorPickerStemName, setColorPickerStemName] = useState<string>();
  const [bpmInputValue, setBpmInputValue] = useState("");
  const [firstBeatInputValue, setFirstBeatInputValue] = useState("");
  const [editingStem, setEditingStem] = useState<{
    id: number;
    name: string;
  }>();
  const timelineHistoryRef = useRef<{
    past: TimelineProps[];
    future: TimelineProps[];
  }>({ past: [], future: [] });
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  }>();
  const [stemSelectionBox, setStemSelectionBox] = useState<{
    startY: number;
    currentY: number;
  }>();
  const rulerViewportRef = useRef<HTMLDivElement>(null);
  const eventsViewportRef = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef = useRef<HTMLDivElement>(null);
  const eventsPlayheadRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const draggedEventRef = useRef<TimelineEventProps[]>([]);
  const draggedEventTimesRef = useRef(new Map<number, number>());
  const pendingEventRef = useRef<TimelineEventProps | undefined>(undefined);
  const eventMarkerRefs = useRef(new Map<number, HTMLSpanElement>());
  const layerPulseRefs = useRef(new Map<string, HTMLDivElement>());
  const stemRefs = useRef(new Map<number, HTMLDivElement>());
  const selectionStartRef = useRef<
    { clientX: number; clientY: number } | undefined
  >(undefined);
  const stemSelectionStartRef = useRef<number | undefined>(undefined);
  const dragPointerXRef = useRef(0);
  const playheadSecondsRef = useRef(0);
  const playheadFollowEnabledRef = useRef(false);
  const playheadReferenceXRef = useRef<number | undefined>(undefined);
  const nextLocalEventIdRef = useRef(-1);
  const nextLocalStemIdRef = useRef(-1000);
  const copiedEventsRef = useRef<TimelineEventProps[]>([]);
  const lastPasteStartSecondsRef = useRef<number | undefined>(undefined);
  const ritraceStartedAtRef = useRef<number | undefined>(undefined);
  const previousPlayerTimeRef = useRef<number | undefined>(undefined);
  const flashTimeoutsRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const pendingZoomAnchorRef = useRef<{ ratio: number; x: number } | null>(
    null,
  );
  const { refs: colorPickerRefs, floatingStyles: colorPickerStyles } =
    useFloating({
      open: colorPickerStemName !== undefined,
      placement: "right",
      strategy: "fixed",
      middleware: [offset(6), flip(), shift({ padding: 4 })],
      whileElementsMounted: autoUpdate,
    });
  const { mutate: saveTimeline, mutateAsync: updateTimelineAsync, isPending: isSavingTimeline } =
    useUpdateTimeline((updatedTimeline) => {
      setTimeline(updatedTimeline);
      setSelectedEventIds([]);
      setSelectedStemIds([]);
      timelineHistoryRef.current = { past: [], future: [] };
      nextLocalEventIdRef.current = -1;
    });
  const { mutateAsync: renderRitrace, isPending: isRenderingRitrace } =
    useRitraceRender();
  const { mutate: cancelRitrace, isPending: isCancellingRitrace } =
    useRitraceCancel();

  const handleRitraceRender = async () => {
    if (!timeline || isRenderingRitrace || isRitraceRenderComplete) return;
    const jobId = crypto.randomUUID();
    setRitraceJobId(jobId);
    let completed = false;
    ritraceStartedAtRef.current = Date.now();
    setRitraceProgress({
      jobId,
      stage: "Preparando RiTrace",
      percent: 0,
      elapsedSeconds: 0,
    });
    const unlisten = await listen<unknown>("ritrace-progress", (event) => {
      const progress = ritraceProgressSchema.safeParse(event.payload);
      if (progress.success && progress.data.jobId === jobId) {
        setRitraceProgress(progress.data);
      }
    });
    try {
      const result = await renderRitrace({
        jobId,
        audioPath: timeline.track.path,
        kickMinConfidence: ritraceConfidence.kick / 100,
        snareMinConfidence: ritraceConfidence.snare / 100,
        hihatMinConfidence: ritraceConfidence.hihat / 100,
      });
      const importedTimeline = timelineSchema.parse({
        ...timeline,
        bpm: result.bpm,
        firstBeatSeconds: result.firstBeatSeconds,
        beatIntervalSeconds: result.beatIntervalSeconds,
        stems: defaultTimelineStems,
        events: result.events.map((event) => ({
          ...event,
          id: 0,
        })),
      });
      await updateTimelineAsync(importedTimeline);
      setBpmInputValue(formatBpm(result.bpm));
      setFirstBeatInputValue(formatFirstBeatRaw(result.firstBeatSeconds));
      completed = true;
      setIsRitraceRenderComplete(true);
      setRitraceProgress({
        jobId,
        stage: "Concluído e salvo",
        percent: 100,
        elapsedSeconds: ritraceStartedAtRef.current
          ? (Date.now() - ritraceStartedAtRef.current) / 1_000
          : 0,
      });
    } finally {
      unlisten();
      ritraceStartedAtRef.current = undefined;
      setRitraceJobId(undefined);
      if (!completed) setRitraceProgress(undefined);
    }
  };

  const openRitraceWindow = () => {
    setRitraceProgress(undefined);
    setIsRitraceRenderComplete(false);
    setIsRitraceWindowVisible(true);
  };

  const closeRitraceWindow = () => {
    if (isRenderingRitrace) return;
    setRitraceProgress(undefined);
    setIsRitraceRenderComplete(false);
    setIsRitraceWindowVisible(false);
  };

  const handleCancelRitrace = () => {
    if (!ritraceJobId || isCancellingRitrace) return;
    setRitraceProgress((progress) =>
      progress ? { ...progress, stage: "Cancelando RiTrace" } : progress,
    );
    cancelRitrace(ritraceJobId);
  };

  useEffect(() => {
    if (!isRenderingRitrace) return;
    const interval = window.setInterval(() => setRitraceClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [isRenderingRitrace]);

  useEffect(() => {
    setVisibleBars(4);
    playheadSecondsRef.current = 0;
    setIsPlayheadFollowEnabled(false);
    playheadFollowEnabledRef.current = false;
    playheadReferenceXRef.current = undefined;
    setPlayerDurationSeconds(0);
    setRequestedPlayerTime(undefined);
    setBpmInputValue("");
    setFirstBeatInputValue("");
    previousPlayerTimeRef.current = undefined;
    nextLocalEventIdRef.current = -1;
    nextLocalStemIdRef.current = -1000;
    copiedEventsRef.current = [];
    lastPasteStartSecondsRef.current = undefined;
    flashTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    flashTimeoutsRef.current.clear();
    setSelectedEventIds([]);
    setSelectedStemIds([]);
    setColorPickerStemName(undefined);
    setEditingStem(undefined);
    timelineHistoryRef.current = { past: [], future: [] };
    setTimeline(undefined);
  }, [trackPath]);

  useEffect(() => {
    if (!savedTimeline) return;
    setTimeline(savedTimeline);
    setSnap(
      snapOptions.includes(savedTimeline.snap as SnapValue)
        ? (savedTimeline.snap as SnapValue)
        : "1/16",
    );
    setBpmInputValue(
      formatBpm(
        savedTimeline.bpm ??
          (savedTimeline.beatIntervalSeconds
            ? 60 / savedTimeline.beatIntervalSeconds
            : 120),
      ),
    );
    setFirstBeatInputValue(
      formatFirstBeatRaw(savedTimeline.firstBeatSeconds ?? 0),
    );
    setIsPlayheadFollowEnabled(savedTimeline.followPlayhead);
    playheadFollowEnabledRef.current = savedTimeline.followPlayhead;
    playheadReferenceXRef.current = undefined;
    setSelectedEventIds([]);
    setSelectedStemIds([]);
    setColorPickerStemName(undefined);
    setEditingStem(undefined);
    timelineHistoryRef.current = { past: [], future: [] };
    copiedEventsRef.current = [];
    lastPasteStartSecondsRef.current = undefined;
    nextLocalEventIdRef.current =
      Math.min(0, ...savedTimeline.events.map((event) => event.id)) - 1;
    nextLocalStemIdRef.current =
      Math.min(0, ...savedTimeline.stems.map((stem) => stem.id)) - 1;
  }, [savedTimeline?.id]);
  const events = timeline?.events ?? [];
  const stems = timeline?.stems ?? defaultTimelineStems;
  const stemColors = new Map(stems.map((stem) => [stem.name, stem.color]));
  const eventsByTime = useMemo(
    () =>
      [...events].sort(
        (first, second) => first.timeSeconds - second.timeSeconds,
      ),
    [events],
  );
  const layers = [
    ...new Set([...stems.map((stem) => stem.name), ...events.map((event) => event.stem)]),
  ];
  const selectedStem = stems.find((stem) => stem.name === colorPickerStemName);
  const currentBpm =
    timeline?.bpm ??
    (timeline?.beatIntervalSeconds ? 60 / timeline.beatIntervalSeconds : 120);
  const beatSeconds = 60 / currentBpm;
  const snapSeconds =
    snap === "none"
      ? 0
      : snap.includes("bar")
        ? beatSeconds *
          (snap.startsWith("1/2")
            ? 2
            : snap.startsWith("1 bar")
              ? 4
              : snap.startsWith("2")
                ? 8
                : 16)
        : snap.endsWith("T")
          ? (beatSeconds * 8) /
            (Number(snap.split("/")[1].replace("T", "")) * 3)
          : (beatSeconds * 4) / Number(snap.split("/")[1]);
  const barSeconds = beatSeconds * beatsPerBar;
  const firstBeatSeconds = timeline?.firstBeatSeconds ?? 0;
  const storedDurationSeconds = timeline?.track.durationSeconds ?? 0;
  const eventFallbackDurationSeconds = Math.max(
    0,
    ...events.map((event) => event.timeSeconds),
  );
  const trackSeconds =
    playerDurationSeconds > 0
      ? playerDurationSeconds
      : storedDurationSeconds > 0
        ? storedDurationSeconds
        : eventFallbackDurationSeconds;
  const timelineBars = Math.max(
    1,
    Math.ceil(
      Math.max(0, trackSeconds - firstBeatSeconds - barBoundaryToleranceSeconds) /
        barSeconds,
    ),
  );
  const timelineSeconds = firstBeatSeconds + timelineBars * barSeconds;
  const editableDurationSeconds =
    trackSeconds > 0 ? trackSeconds : timelineSeconds;
  const contentScale = Math.max(1, timelineBars / visibleBars);
  const timelineContentWidth = Math.max(
    1,
    timelineViewportWidth * contentScale,
  );
  const getTimelinePositionRatio = (timeSeconds: number) =>
    Math.max(0, Math.min(timeSeconds, timelineSeconds)) / timelineSeconds;
  const getTimelinePositionPixels = (timeSeconds: number) =>
    getTimelinePositionRatio(timeSeconds) * timelineContentWidth;
  const getTimelinePositionPercent = (timeSeconds: number) =>
    getTimelinePositionRatio(timeSeconds) * 100;
  const getTimelineTimeAtCanvasPosition = (position: number) =>
    Math.max(0, Math.min(position, timelineContentWidth)) /
    timelineContentWidth *
    timelineSeconds;
  const pixelsPerBar = getTimelinePositionPixels(barSeconds);
  const firstBeatPixels = getTimelinePositionPixels(firstBeatSeconds);
  const barGridInterval = getNiceInterval(4 / pixelsPerBar);
  const subdivisionSeconds =
    snapSeconds > 0 && snapSeconds < barSeconds
      ? snapSeconds
      : snapSeconds === 0
        ? beatSeconds
        : 0;
  const subdivisionPixels = pixelsPerBar * (subdivisionSeconds / barSeconds);
  const subdivisionGridPixels =
    subdivisionSeconds > 0 && subdivisionPixels >= 4
      ? subdivisionPixels
      : undefined;
  const labelInterval = getNiceInterval(36 / pixelsPerBar);
  const rulerLabels = Array.from({ length: timelineBars }, (_, index) => ({
    bar: index + 1,
    position: getTimelinePositionPercent(
      firstBeatSeconds + index * barSeconds,
    ),
  })).filter(({ bar }) => bar === 1 || bar % labelInterval === 0);
  const timelineGrid = useMemo(
    () => (
      <TE.TimelineGrid>
        {Array.from({ length: timelineBars }, (_, barIndex) => (
          <TE.TimelineGridBar
            key={barIndex}
            $left={firstBeatPixels + barIndex * pixelsPerBar}
            $width={pixelsPerBar}
            $showBarLine={barIndex % barGridInterval === 0}
            $subdivisionPixels={subdivisionGridPixels}
          />
        ))}
      </TE.TimelineGrid>
    ),
    [
      barGridInterval,
      firstBeatPixels,
      pixelsPerBar,
      subdivisionGridPixels,
      timelineBars,
    ],
  );

  const getPlayheadCanvasPosition = getTimelinePositionPixels;

  const updatePlayheadVisual = (timeSeconds: number) => {
    const clampedTime = Math.max(0, Math.min(timeSeconds, timelineSeconds));
    const canvasPosition = getPlayheadCanvasPosition(clampedTime);
    const viewport = eventsViewportRef.current;
    let nextScrollLeft: number | undefined;

    if (
      playheadFollowEnabledRef.current &&
      viewport &&
      playheadReferenceXRef.current !== undefined
    ) {
      const maxScrollLeft = Math.max(
        0,
        timelineContentWidth - viewport.clientWidth,
      );
      nextScrollLeft = Math.max(
        0,
        Math.min(canvasPosition - playheadReferenceXRef.current, maxScrollLeft),
      );
    }

    playheadSecondsRef.current = clampedTime;
    const transform = `translate3d(${canvasPosition}px, 0, 0)`;
    if (rulerPlayheadRef.current) {
      rulerPlayheadRef.current.style.transform = transform;
    }
    if (eventsPlayheadRef.current) {
      eventsPlayheadRef.current.style.transform = transform;
    }

    if (viewport && nextScrollLeft !== undefined) {
      if (Math.abs(viewport.scrollLeft - nextScrollLeft) > 0.001) {
        viewport.scrollLeft = nextScrollLeft;
      }
      if (
        rulerViewportRef.current &&
        Math.abs(rulerViewportRef.current.scrollLeft - nextScrollLeft) > 0.001
      ) {
        rulerViewportRef.current.scrollLeft = nextScrollLeft;
      }
    }
  };

  const updatePlayhead = (clientX: number) => {
    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    const { left, right } = viewport.getBoundingClientRect();
    const visibleClientX = Math.max(left, Math.min(clientX, right));
    const position = Math.max(
      0,
      Math.min(
        visibleClientX - left + viewport.scrollLeft,
        viewport.scrollWidth,
      ),
    );
    const nextTime = Math.min(
      getTimelineTimeAtCanvasPosition(position),
      editableDurationSeconds,
    );
    updatePlayheadVisual(nextTime);
    setRequestedPlayerTime(nextTime);
  };

  const getEventTimeAtPosition = (clientX: number) => {
    const viewport = eventsViewportRef.current;
    if (!viewport || !timeline) return;
    const { left } = viewport.getBoundingClientRect();
    const position = Math.max(
      0,
      Math.min(clientX - left + viewport.scrollLeft, viewport.scrollWidth),
    );
    const unsnappedTime = getTimelineTimeAtCanvasPosition(position);
    const snappedTime = snapSeconds
      ? firstBeatSeconds +
        Math.round((unsnappedTime - firstBeatSeconds) / snapSeconds) *
          snapSeconds
      : unsnappedTime;
    return Number(
      Math.max(0, Math.min(snappedTime, editableDurationSeconds)).toFixed(6),
    );
  };

  const commitTimelineChange = (nextTimeline: TimelineProps) => {
    if (!timeline) return;
    const { past } = timelineHistoryRef.current;
    timelineHistoryRef.current = {
      past: [...past.slice(-99), timeline],
      future: [],
    };
    setTimeline(nextTimeline);
  };

  const restoreHistory = (direction: "undo" | "redo") => {
    if (!timeline) return false;
    const { past, future } = timelineHistoryRef.current;
    const target = direction === "undo" ? past[past.length - 1] : future[0];
    if (!target) return false;
    timelineHistoryRef.current =
      direction === "undo"
        ? {
            past: past.slice(0, -1),
            future: [timeline, ...future].slice(0, 100),
          }
        : { past: [...past, timeline].slice(-100), future: future.slice(1) };
    setSelectedEventIds([]);
    setSelectedStemIds([]);
    setTimeline(target);
    return true;
  };

  const handleSave = () => {
    if (!timeline || isSavingTimeline) return;
    saveTimeline(
      timelineSchema.parse({
        ...timeline,
        snap,
        followPlayhead: isPlayheadFollowEnabled,
      }),
    );
  };

  const saveTimelineEvent = (timelineEvent: TimelineEventProps) => {
    if (!timeline) return;
    if (
      timeline.events.some(
        (existingEvent) =>
          existingEvent.stem === timelineEvent.stem &&
          Math.abs(existingEvent.timeSeconds - timelineEvent.timeSeconds) <
            0.000001,
      )
    )
      return;

    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        events: [...timeline.events, timelineEvent],
      }),
    );
  };

  const startEventCreation = (
    event: React.PointerEvent<HTMLDivElement>,
    stem: string,
  ) => {
    if (event.button !== 0) return;
    setSelectedEventIds([]);
    const timeSeconds = getEventTimeAtPosition(event.clientX);
    if (timeSeconds === undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const timelineEvent = timelineEventSchema.parse({
      id: nextLocalEventIdRef.current,
      stem,
      timeSeconds,
      origin: "manual",
    });
    nextLocalEventIdRef.current -= 1;
    pendingEventRef.current = timelineEvent;
    setPendingEvent(timelineEvent);
  };

  const movePendingEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const timelineEvent = pendingEventRef.current;
    const timeSeconds = getEventTimeAtPosition(event.clientX);
    if (!timelineEvent || timeSeconds === undefined) return;
    const movedEvent = { ...timelineEvent, timeSeconds };
    pendingEventRef.current = movedEvent;
    setPendingEvent(movedEvent);
  };

  const finishEventCreation = () => {
    const timelineEvent = pendingEventRef.current;
    pendingEventRef.current = undefined;
    setPendingEvent(undefined);
    if (timelineEvent) saveTimelineEvent(timelineEvent);
  };

  const cancelEventCreation = () => {
    pendingEventRef.current = undefined;
    setPendingEvent(undefined);
  };

  const getCanvasPosition = (clientX: number, clientY: number) => {
    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    const { left, top } = viewport.getBoundingClientRect();
    return {
      x: clientX - left + viewport.scrollLeft,
      y: clientY - top + viewport.scrollTop,
    };
  };

  const startSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const position = getCanvasPosition(event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setSelectedEventIds([]);
    setSelectionBox({
      startX: position.x,
      startY: position.y,
      currentX: position.x,
      currentY: position.y,
    });
  };

  const moveSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = selectionStartRef.current;
    const position = getCanvasPosition(event.clientX, event.clientY);
    if (!start || !position) return;
    setSelectionBox((currentBox) =>
      currentBox
        ? { ...currentBox, currentX: position.x, currentY: position.y }
        : currentBox,
    );

    const left = Math.min(start.clientX, event.clientX);
    const right = Math.max(start.clientX, event.clientX);
    const top = Math.min(start.clientY, event.clientY);
    const bottom = Math.max(start.clientY, event.clientY);
    setSelectedEventIds(
      events
        .filter((timelineEvent) => {
          const marker = eventMarkerRefs.current.get(timelineEvent.id);
          if (!marker) return false;
          const markerRect = marker.getBoundingClientRect();
          const centerX = markerRect.left + markerRect.width / 2;
          const centerY = markerRect.top + markerRect.height / 2;
          return (
            centerX >= left &&
            centerX <= right &&
            centerY >= top &&
            centerY <= bottom
          );
        })
        .map((timelineEvent) => timelineEvent.id),
    );
  };

  const finishSelection = () => {
    selectionStartRef.current = undefined;
    setSelectionBox(undefined);
  };

  const startStemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.ctrlKey) return;
    const layersContainer = layersRef.current;
    if (!layersContainer) return;
    const { top } = layersContainer.getBoundingClientRect();
    const startY = event.clientY - top + layersContainer.scrollTop;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stemSelectionStartRef.current = event.clientY;
    setSelectedStemIds([]);
    setStemSelectionBox({ startY, currentY: startY });
  };

  const moveStemSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const startY = stemSelectionStartRef.current;
    const layersContainer = layersRef.current;
    if (startY === undefined || !layersContainer) return;
    const { top } = layersContainer.getBoundingClientRect();
    const currentY = event.clientY - top + layersContainer.scrollTop;
    setStemSelectionBox((currentBox) =>
      currentBox ? { ...currentBox, currentY } : currentBox,
    );

    const topBoundary = Math.min(startY, event.clientY);
    const bottomBoundary = Math.max(startY, event.clientY);
    setSelectedStemIds(
      timeline?.stems
        .filter((stem) => {
          const stemElement = stemRefs.current.get(stem.id);
          if (!stemElement) return false;
          const stemRect = stemElement.getBoundingClientRect();
          const centerY = stemRect.top + stemRect.height / 2;
          return centerY >= topBoundary && centerY <= bottomBoundary;
        })
        .map((stem) => stem.id) ?? [],
    );
  };

  const finishStemSelection = () => {
    stemSelectionStartRef.current = undefined;
    setStemSelectionBox(undefined);
  };

  const handleLayersPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.ctrlKey) {
      startStemSelection(event);
      return;
    }
    if (event.target === event.currentTarget) setSelectedStemIds([]);
  };

  const startEventDrag = (
    event: React.PointerEvent<HTMLSpanElement>,
    timelineEvent: TimelineEventProps,
  ) => {
    if (event.button !== 0 || !timeline) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const draggedEvents = timeline.events.filter((eventToMove) =>
      selectedEventIds.includes(timelineEvent.id)
        ? selectedEventIds.includes(eventToMove.id)
        : eventToMove.id === timelineEvent.id,
    );
    if (!selectedEventIds.includes(timelineEvent.id)) {
      setSelectedEventIds([timelineEvent.id]);
    }
    draggedEventRef.current = draggedEvents;
    draggedEventTimesRef.current = new Map(
      draggedEvents.map((eventToMove) => [
        eventToMove.id,
        eventToMove.timeSeconds,
      ]),
    );
    setDraggedEvent(timelineEvent);
    setDraggedEventTimes(draggedEventTimesRef.current);
  };

  const moveEvent = (event: React.PointerEvent<HTMLSpanElement>) => {
    const draggedEvents = draggedEventRef.current;
    const timeSeconds = getEventTimeAtPosition(event.clientX);
    if (
      !draggedEvent ||
      draggedEvents.length === 0 ||
      timeSeconds === undefined
    )
      return;
    const minimumTime = Math.min(
      ...draggedEvents.map((eventToMove) => eventToMove.timeSeconds),
    );
    const maximumTime = Math.max(
      ...draggedEvents.map((eventToMove) => eventToMove.timeSeconds),
    );
    const delta = Math.max(
      -minimumTime,
      Math.min(
        timeSeconds - draggedEvent.timeSeconds,
        editableDurationSeconds - maximumTime,
      ),
    );
    const nextTimes = new Map(
      draggedEvents.map((eventToMove) => [
        eventToMove.id,
        Number((eventToMove.timeSeconds + delta).toFixed(6)),
      ]),
    );
    draggedEventTimesRef.current = nextTimes;
    setDraggedEventTimes(nextTimes);
  };

  const finishEventDrag = () => {
    const draggedEvents = draggedEventRef.current;
    const movedEvents = draggedEvents.map((eventToMove) => ({
      ...eventToMove,
      timeSeconds:
        draggedEventTimesRef.current.get(eventToMove.id) ??
        eventToMove.timeSeconds,
    }));
    draggedEventRef.current = [];
    draggedEventTimesRef.current = new Map();
    setDraggedEvent(undefined);
    setDraggedEventTimes(new Map());
    if (!timeline || movedEvents.length === 0) return;

    const updatedEvents = timeline.events.map((timelineEvent) => {
      const movedEvent = movedEvents.find(
        (eventToMove) => eventToMove.id === timelineEvent.id,
      );
      return movedEvent ?? timelineEvent;
    });
    const eventPositions = new Set<string>();
    const duplicatedEvent = updatedEvents.some((timelineEvent) => {
      const eventPosition = `${timelineEvent.stem}:${timelineEvent.timeSeconds}`;
      if (eventPositions.has(eventPosition)) return true;
      eventPositions.add(eventPosition);
      return false;
    });
    const hasMoved = movedEvents.some(
      (movedEvent) =>
        timeline.events.find(
          (timelineEvent) => timelineEvent.id === movedEvent.id,
        )?.timeSeconds !== movedEvent.timeSeconds,
    );
    if (duplicatedEvent || !hasMoved) return;

    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        events: updatedEvents,
      }),
    );
  };

  const cancelEventDrag = () => {
    draggedEventRef.current = [];
    draggedEventTimesRef.current = new Map();
    setDraggedEvent(undefined);
    setDraggedEventTimes(new Map());
  };

  const deleteTimelineSelection = (
    eventIds: number[],
    stemIds: number[],
  ) => {
    if (!timeline || (eventIds.length === 0 && stemIds.length === 0)) return;
    const eventIdsToDelete = new Set(eventIds);
    const stemIdsToDelete = new Set(stemIds);
    const stemNamesToDelete = new Set(
      timeline.stems
        .filter((stem) => stemIdsToDelete.has(stem.id))
        .map((stem) => stem.name),
    );
    const hasSelectionToDelete = timeline.events.some(
      (timelineEvent) =>
        eventIdsToDelete.has(timelineEvent.id) ||
        stemNamesToDelete.has(timelineEvent.stem),
    ) || timeline.stems.some((stem) => stemIdsToDelete.has(stem.id));
    if (!hasSelectionToDelete) return;

    setSelectedEventIds([]);
    setSelectedStemIds([]);
    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        events: timeline.events.filter(
          (timelineEvent) =>
            !eventIdsToDelete.has(timelineEvent.id) &&
            !stemNamesToDelete.has(timelineEvent.stem),
        ),
        stems: timeline.stems.filter((stem) => !stemIdsToDelete.has(stem.id)),
      }),
    );
  };

  const deleteTimelineEvents = (eventIds: number[]) =>
    deleteTimelineSelection(eventIds, []);

  const updateStemColor = (stemName: string, color: string) => {
    if (!timeline) return;
    setTimeline(
      timelineSchema.parse({
        ...timeline,
        stems: timeline.stems.map((stem) =>
          stem.name === stemName ? { ...stem, color } : stem,
        ),
      }),
    );
  };

  const updateBpm = (value: string) => {
    setBpmInputValue(value);
    const bpm = Number(value);
    if (!value || !Number.isFinite(bpm) || bpm <= 0) return;

    setTimeline((currentTimeline) =>
      currentTimeline
        ? timelineSchema.parse({
            ...currentTimeline,
            bpm,
            beatIntervalSeconds: 60 / bpm,
          })
        : currentTimeline,
    );
  };

  const resetBpmInput = () => setBpmInputValue(formatBpm(currentBpm));

  const updateFirstBeat = (raw: string) => {
    setFirstBeatInputValue(raw);
    const firstBeat = parseFirstBeatRaw(raw);
    if (firstBeat === undefined) return;
    setTimeline((currentTimeline) =>
      currentTimeline
        ? timelineSchema.parse({
            ...currentTimeline,
            firstBeatSeconds: firstBeat,
          })
        : currentTimeline,
    );
  };

  const renameStem = (stemId: number, nextName: string) => {
    if (!timeline) return;
    const stem = timeline.stems.find((timelineStem) => timelineStem.id === stemId);
    if (!stem) return;

    const name = nextName.trim();
    setEditingStem(undefined);
    if (!name || name === stem.name) return;
    if (
      timeline.stems.some(
        (timelineStem) =>
          timelineStem.id !== stemId &&
          timelineStem.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      return;

    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        stems: timeline.stems.map((timelineStem) =>
          timelineStem.id === stemId
            ? { ...timelineStem, name }
            : timelineStem,
        ),
        events: timeline.events.map((timelineEvent) =>
          timelineEvent.stem === stem.name
            ? { ...timelineEvent, stem: name }
            : timelineEvent,
        ),
      }),
    );
  };

  const addStem = () => {
    if (!timeline) return;
    let stemNumber = timeline.stems.length + 1;
    let name = `Stem ${stemNumber}`;
    const existingNames = new Set(
      timeline.stems.map((stem) => stem.name.toLocaleLowerCase()),
    );
    while (existingNames.has(name.toLocaleLowerCase())) {
      stemNumber += 1;
      name = `Stem ${stemNumber}`;
    }

    const newStem = {
      ...createTimelineStem(name, timeline.stems),
      id: nextLocalStemIdRef.current,
    };
    nextLocalStemIdRef.current -= 1;
    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        stems: [...timeline.stems, newStem],
      }),
    );
  };

  useEffect(() => {
    if (!colorPickerStemName) return;
    const closeColorPicker = (event: PointerEvent) => {
      const target = event.target as Node;
      const reference = colorPickerRefs.reference.current;
      if (
        (reference instanceof Element && reference.contains(target)) ||
        colorPickerRefs.floating.current?.contains(target)
      )
        return;
      setColorPickerStemName(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorPickerStemName(undefined);
    };
    document.addEventListener("pointerdown", closeColorPicker);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeColorPicker);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [
    colorPickerRefs.floating,
    colorPickerRefs.reference,
    colorPickerStemName,
  ]);

  const copySelectedEvents = () => {
    if (!timeline || selectedEventIds.length === 0) return false;
    const selectedEvents = timeline.events.filter((timelineEvent) =>
      selectedEventIds.includes(timelineEvent.id),
    );
    if (selectedEvents.length === 0) return false;
    copiedEventsRef.current = selectedEvents.map((timelineEvent) => ({
      ...timelineEvent,
    }));
    lastPasteStartSecondsRef.current = undefined;
    return true;
  };

  const pasteCopiedEvents = () => {
    if (!timeline || copiedEventsRef.current.length === 0) return false;

    const copiedEvents = copiedEventsRef.current;
    const copiedStartSeconds = Math.min(
      ...copiedEvents.map((timelineEvent) => timelineEvent.timeSeconds),
    );
    const copiedEndSeconds = Math.max(
      ...copiedEvents.map((timelineEvent) => timelineEvent.timeSeconds),
    );
    const copiedSpanSeconds = copiedEndSeconds - copiedStartSeconds;
    const maximumStartSeconds = Math.max(
      0,
      editableDurationSeconds - copiedSpanSeconds,
    );
    const pasteStepSeconds = snapSeconds || beatSeconds;
    const requestedStartSeconds =
      (lastPasteStartSecondsRef.current ?? copiedStartSeconds) +
      pasteStepSeconds;
    if (requestedStartSeconds > maximumStartSeconds) return false;
    const existingPositions = new Set(
      timeline.events.map(
        (timelineEvent) =>
          `${timelineEvent.stem}:${timelineEvent.timeSeconds.toFixed(6)}`,
      ),
    );
    const hasCollisionAt = (startSeconds: number) =>
      copiedEvents.some((timelineEvent) => {
        const timeSeconds = Number(
          (startSeconds + timelineEvent.timeSeconds - copiedStartSeconds).toFixed(
            6,
          ),
        );
        return existingPositions.has(`${timelineEvent.stem}:${timeSeconds.toFixed(6)}`);
      });

    let pasteStartSeconds = requestedStartSeconds;
    while (
      pasteStartSeconds <= maximumStartSeconds &&
      hasCollisionAt(pasteStartSeconds)
    ) {
      pasteStartSeconds += pasteStepSeconds;
    }
    if (pasteStartSeconds > maximumStartSeconds) return false;

    const pastedEvents = copiedEvents.map((timelineEvent) => {
      const pastedEvent = timelineEventSchema.parse({
        ...timelineEvent,
        id: nextLocalEventIdRef.current,
        timeSeconds: Number(
          (
            pasteStartSeconds +
            timelineEvent.timeSeconds -
            copiedStartSeconds
          ).toFixed(6),
        ),
      });
      nextLocalEventIdRef.current -= 1;
      return pastedEvent;
    });

    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        events: [...timeline.events, ...pastedEvents],
      }),
    );
    lastPasteStartSecondsRef.current = pasteStartSeconds;
    setSelectedEventIds(pastedEvents.map((timelineEvent) => timelineEvent.id));
    return true;
  };

  useEffect(() => {
    if (selectedEventIds.length === 0 && selectedStemIds.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !timeline) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;

      event.preventDefault();
      deleteTimelineSelection(selectedEventIds, selectedStemIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEventIds, selectedStemIds, timeline]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !timeline) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;

      const key = event.key.toLowerCase();
      if (key === "c" && !event.shiftKey) {
        if (copySelectedEvents()) event.preventDefault();
        return;
      }
      if (key === "v" && !event.shiftKey) {
        if (pasteCopiedEvents()) event.preventDefault();
        return;
      }
      const direction =
        key === "y" || (key === "z" && event.shiftKey)
          ? "redo"
          : key === "z"
            ? "undo"
            : undefined;
      if (!direction) return;
      if (restoreHistory(direction)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    beatSeconds,
    editableDurationSeconds,
    selectedEventIds,
    snapSeconds,
    timeline,
  ]);

  useLayoutEffect(() => {
    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    const updateViewportWidth = () =>
      setTimelineViewportWidth(viewport.clientWidth);
    updateViewportWidth();
    const resizeObserver = new ResizeObserver(updateViewportWidth);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    let animationFrameId: number;
    const onPointerMove = (event: PointerEvent) => {
      dragPointerXRef.current = event.clientX;
      updatePlayhead(event.clientX);
    };
    const onPointerUp = () => setIsDraggingPlayhead(false);
    const autoScroll = () => {
      const viewport = eventsViewportRef.current;
      if (viewport) {
        const { left, right } = viewport.getBoundingClientRect();
        const pointerX = dragPointerXRef.current;
        const overflow =
          pointerX < left
            ? pointerX - left
            : pointerX > right
              ? pointerX - right
              : 0;

        if (overflow !== 0) {
          const previousScrollLeft = viewport.scrollLeft;
          const speed =
            Math.sign(overflow) * Math.min(4, 1 + Math.abs(overflow) * 0.03);
          viewport.scrollLeft += speed;
          if (viewport.scrollLeft !== previousScrollLeft) {
            if (rulerViewportRef.current) {
              rulerViewportRef.current.scrollLeft = viewport.scrollLeft;
            }
            updatePlayhead(pointerX);
          }
        }
      }
      animationFrameId = requestAnimationFrame(autoScroll);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    animationFrameId = requestAnimationFrame(autoScroll);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isDraggingPlayhead]);

  const startPlayheadDrag = (event: React.PointerEvent<HTMLElement>) => {
    dragPointerXRef.current = event.clientX;
    updatePlayhead(event.clientX);
    setIsDraggingPlayhead(true);
  };

  const handleZoom = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    const { left, width } = viewport.getBoundingClientRect();
    const cursorX = Math.max(0, Math.min(event.clientX - left, width));
    pendingZoomAnchorRef.current = {
      ratio: (viewport.scrollLeft + cursorX) / viewport.scrollWidth,
      x: cursorX,
    };
    setVisibleBars((currentBars) =>
      Math.max(
        1,
        Math.min(currentBars * (event.deltaY < 0 ? 0.9 : 1.1), timelineBars),
      ),
    );
  };

  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current;
    const eventsViewport = eventsViewportRef.current;
    const rulerViewport = rulerViewportRef.current;
    if (!anchor || !eventsViewport || !rulerViewport) return;
    const scrollLeft = anchor.ratio * eventsViewport.scrollWidth - anchor.x;
    eventsViewport.scrollLeft = scrollLeft;
    rulerViewport.scrollLeft = eventsViewport.scrollLeft;
    pendingZoomAnchorRef.current = null;
  }, [visibleBars]);

  useLayoutEffect(() => {
    updatePlayheadVisual(playheadSecondsRef.current);
  }, [timelineContentWidth, timelineSeconds]);

  useLayoutEffect(() => {
    if (
      !isPlayheadFollowEnabled ||
      playheadReferenceXRef.current !== undefined
    )
      return;
    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    playheadReferenceXRef.current = Math.max(
      0,
      Math.min(
        getPlayheadCanvasPosition(playheadSecondsRef.current) -
          viewport.scrollLeft,
        viewport.clientWidth,
      ),
    );
    updatePlayheadVisual(playheadSecondsRef.current);
  }, [
    isPlayheadFollowEnabled,
    timeline?.id,
    timelineContentWidth,
    timelineSeconds,
  ]);

  const syncTimelineScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (
      rulerViewportRef.current &&
      Math.abs(
        rulerViewportRef.current.scrollLeft - event.currentTarget.scrollLeft,
      ) > 0.001
    ) {
      rulerViewportRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    if (
      layersRef.current &&
      layersRef.current.scrollTop !== event.currentTarget.scrollTop
    ) {
      layersRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const syncLayersScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (eventsViewportRef.current) {
      eventsViewportRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const togglePlayheadFollow = () => {
    if (isPlayheadFollowEnabled) {
      playheadFollowEnabledRef.current = false;
      playheadReferenceXRef.current = undefined;
      setIsPlayheadFollowEnabled(false);
      return;
    }

    const viewport = eventsViewportRef.current;
    if (!viewport) return;
    playheadReferenceXRef.current = Math.max(
      0,
      Math.min(
        getPlayheadCanvasPosition(playheadSecondsRef.current) -
          viewport.scrollLeft,
        viewport.clientWidth,
      ),
    );
    playheadFollowEnabledRef.current = true;
    setIsPlayheadFollowEnabled(true);
  };

  const syncPlayheadWithPlayer = (currentTime: number) => {
    const previousTime = previousPlayerTimeRef.current;
    const timeDelta =
      previousTime === undefined ? 0 : currentTime - previousTime;

    if (previousTime !== undefined && timeDelta > 0 && timeDelta <= 1.5) {
      let lowerBound = 0;
      let upperBound = eventsByTime.length;
      while (lowerBound < upperBound) {
        const middle = Math.floor((lowerBound + upperBound) / 2);
        if (eventsByTime[middle].timeSeconds <= previousTime) {
          lowerBound = middle + 1;
        } else {
          upperBound = middle;
        }
      }

      const passedLayers = new Set<string>();
      for (
        let eventIndex = lowerBound;
        eventIndex < eventsByTime.length &&
        eventsByTime[eventIndex].timeSeconds <= currentTime;
        eventIndex += 1
      ) {
        passedLayers.add(eventsByTime[eventIndex].stem);
      }

      passedLayers.forEach((layer) => {
        const pulse = layerPulseRefs.current.get(layer);
        if (pulse) pulse.style.opacity = "1";

        const previousTimeout = flashTimeoutsRef.current.get(layer);
        if (previousTimeout) clearTimeout(previousTimeout);
        const timeout = setTimeout(() => {
          const currentPulse = layerPulseRefs.current.get(layer);
          if (currentPulse) currentPulse.style.opacity = "0";
          flashTimeoutsRef.current.delete(layer);
        }, 55);
        flashTimeoutsRef.current.set(layer, timeout);
      });
    }

    previousPlayerTimeRef.current = currentTime;
    updatePlayheadVisual(currentTime);
  };

  useEffect(
    () => () => {
      flashTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      flashTimeoutsRef.current.clear();
    },
    [],
  );

  return (
    <>
      <Window
        isVisible={isRitraceWindowVisible}
        disableClose={isRenderingRitrace}
        onClose={closeRitraceWindow}
        title="Renderizar com RiTrace"
        width="400px"
        height="500px"
        icon={Icons.timelineIcon}
      >
        <TE.RitraceWindowBody>
          <TE.RitraceForm>
            <TitledInput
              title="Fidelidade mínima do kick"
              type="number"
              min="0"
              max="100"
              step="1"
              value={ritraceConfidence.kick}
              disabled={isRenderingRitrace}
              onChange={(event) => {
                const value = Math.min(100, Number(event.currentTarget.value));
                setRitraceConfidence((confidence) => ({
                  ...confidence,
                  kick: value,
                }));
              }}
            />
            <TitledInput
              title="Fidelidade mínima do snare"
              type="number"
              min="0"
              max="100"
              step="1"
              value={ritraceConfidence.snare}
              disabled={isRenderingRitrace}
              onChange={(event) => {
                const value = Math.min(100, Number(event.currentTarget.value));
                setRitraceConfidence((confidence) => ({
                  ...confidence,
                  snare: value,
                }));
              }}
            />
            <TitledInput
              title="Fidelidade mínima do hihat"
              type="number"
              min="0"
              max="100"
              step="1"
              value={ritraceConfidence.hihat}
              disabled={isRenderingRitrace}
              onChange={(event) => {
                const value = Math.min(100, Number(event.currentTarget.value));
                setRitraceConfidence((confidence) => ({
                  ...confidence,
                  hihat: value,
                }));
              }}
            />
          </TE.RitraceForm>
          <TE.RitraceOverwriteWarning>
            A importação vai sobrescrever todos os stems e eventos atuais desta
            timeline.
          </TE.RitraceOverwriteWarning>
          {ritraceProgress && (
            <TE.RitraceProgress>
              <strong>{ritraceProgress.stage}</strong>
              <span>{ritraceProgress.percent}%</span>
              <small>
                {formatElapsedTime(
                  Math.max(
                    ritraceProgress.elapsedSeconds,
                    ritraceStartedAtRef.current
                      ? (ritraceClock - ritraceStartedAtRef.current) / 1_000
                      : 0,
                  ),
                )}
              </small>
            </TE.RitraceProgress>
          )}
          <TE.RitraceActions>
            <Button
              type="button"
              disabled={!timeline}
              loading={isRenderingRitrace}
              onClick={
                isRitraceRenderComplete
                  ? closeRitraceWindow
                  : handleRitraceRender
              }
            >
              {isRitraceRenderComplete ? "Fechar" : "Renderizar"}
            </Button>
            {isRenderingRitrace && (
              <Button
                type="button"
                disabled={!ritraceJobId || isCancellingRitrace}
                loading={isCancellingRitrace}
                onClick={handleCancelRitrace}
              >
                Cancelar
              </Button>
            )}
          </TE.RitraceActions>
        </TE.RitraceWindowBody>
      </Window>
      <TE.Body data-loading={isLoading} data-timeline-id={timeline?.id}>
        <TE.Header>
        <TE.HeaderButton onClick={onBack}>{Icons.returnIcon}</TE.HeaderButton>
        {import.meta.env.DEV && (
          <TE.HeaderButton
            type="button"
            title="Recarregar página"
            aria-label="Recarregar página"
            onClick={() => window.location.reload()}
          >
            {Icons.reloadIcon}
          </TE.HeaderButton>
        )}
        <TE.HeaderButton
          type="button"
          title="Renderizar com RiTrace"
          aria-label="Renderizar com RiTrace"
          onClick={openRitraceWindow}
        >
          {Icons.timelineIcon}
        </TE.HeaderButton>
        <TE.HeaderSpacer />
        <TE.SaveButton
          type="button"
          disabled={!timeline || isSavingTimeline}
          onClick={handleSave}
        >
          {isSavingTimeline ? "Salvando..." : "Salvar"}
        </TE.SaveButton>
        </TE.Header>
        <TE.Container>
        <TE.LeftPanel />
        <TE.CenterPanel>
          <TE.CenterTop />
          <TE.CenterPlayer>
            <Player
              showManager={false}
              enableSpacebarShortcut
              seekTime={requestedPlayerTime}
              onDurationChange={setPlayerDurationSeconds}
              onTimeChange={syncPlayheadWithPlayer}
              audio={
                timeline
                  ? { name: timeline.track.name, path: timeline.track.path }
                  : undefined
              }
            />
          </TE.CenterPlayer>
          <TE.CenterBottom>
            <TE.TimelineHeader>
              <TE.WalkToggle
                type="button"
                $active={isPlayheadFollowEnabled}
                title="Acompanhar playhead"
                aria-label="Acompanhar playhead"
                aria-pressed={isPlayheadFollowEnabled}
                onClick={togglePlayheadFollow}
              >
                {Icons.walkArrow}
              </TE.WalkToggle>
              <TE.AddStemButton
                type="button"
                title="Adicionar stem"
                aria-label="Adicionar stem"
                onClick={addStem}
              >
                {Icons.addIcon}
              </TE.AddStemButton>
              <TE.TimelineHeaderSpacer />
              <TE.SnapControl>
                <Dropdown
                  title={`snap: ${snap === "none" ? "None" : snap}`}
                  width="100px"
                  isOpen={isSnapOpen}
                  onClick={() => setIsSnapOpen((open) => !open)}
                >
                  {snapOptions.map((option) => (
                    <DropdownOption
                      key={option}
                      onClick={() => {
                        setSnap(option);
                        setIsSnapOpen(false);
                      }}
                    >
                      {option === "none" ? "None" : option}
                    </DropdownOption>
                  ))}
                </Dropdown>
                <TE.BpmLabel>BPM:</TE.BpmLabel>
                <TE.BpmInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={bpmInputValue}
                  aria-label="BPM da timeline"
                  onChange={(event) => updateBpm(event.currentTarget.value)}
                  onBlur={() => {
                    if (
                      !bpmInputValue ||
                      !Number.isFinite(Number(bpmInputValue)) ||
                      Number(bpmInputValue) <= 0
                    ) {
                      resetBpmInput();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                      resetBpmInput();
                      event.currentTarget.blur();
                    }
                  }}
                />
                <TE.FirstBeatLabel>1º beat:</TE.FirstBeatLabel>
                <MaskedInput
                  value={firstBeatInputValue}
                  mask={firstBeatMask}
                  title=""
                  placeholder="00:00.000"
                  classname="first-beat-input"
                  onChange={({ raw }) => updateFirstBeat(raw)}
                />
              </TE.SnapControl>
            </TE.TimelineHeader>
            <TE.Timeline>
              <TE.TimelineRuler>
                <TE.RulerLayersSpacer />
                <TE.RulerViewport ref={rulerViewportRef}>
                  <TE.RulerTrack
                    $contentWidth={timelineContentWidth}
                    onPointerDown={startPlayheadDrag}
                    onWheel={handleZoom}
                  >
                    {timelineGrid}
                    <TE.RulerPlayhead ref={rulerPlayheadRef}>
                      {Icons.triangleIcon}
                    </TE.RulerPlayhead>
                    {rulerLabels.map((tick) => (
                      <TE.RulerTick key={tick.bar} $position={tick.position}>
                        {tick.bar}
                      </TE.RulerTick>
                    ))}
                  </TE.RulerTrack>
                </TE.RulerViewport>
              </TE.TimelineRuler>
              <TE.TimelineTracks>
                <TE.Layers
                  ref={layersRef}
                  onScroll={syncLayersScroll}
                  onPointerDown={handleLayersPointerDown}
                  onPointerMove={moveStemSelection}
                  onPointerUp={finishStemSelection}
                  onPointerCancel={finishStemSelection}
                >
                  {stemSelectionBox && (
                    <TE.SelectionBox
                      $left={0}
                      $top={Math.min(
                        stemSelectionBox.startY,
                        stemSelectionBox.currentY,
                      )}
                      $width={130}
                      $height={Math.abs(
                        stemSelectionBox.currentY - stemSelectionBox.startY,
                      )}
                    />
                  )}
                  {layers.map((layer) => {
                    const stem = stems.find((timelineStem) => timelineStem.name === layer);
                    return (
                      <TE.Layer
                        key={layer}
                        ref={(element) => {
                          if (stem && element) stemRefs.current.set(stem.id, element);
                          else if (stem) stemRefs.current.delete(stem.id);
                        }}
                        $isSelected={stem ? selectedStemIds.includes(stem.id) : false}
                        onPointerDown={(event) => {
                          if (event.ctrlKey || !stem) return;
                          if (event.target instanceof HTMLButtonElement) return;
                          setSelectedStemIds((currentIds) =>
                            currentIds.includes(stem.id)
                              ? currentIds.filter((id) => id !== stem.id)
                              : [stem.id],
                          );
                        }}
                      >
                        {stem ? (
                          <TE.LayerNameInput
                            value={
                              editingStem?.id === stem.id
                                ? editingStem?.name
                                : layer
                            }
                            aria-label={`Nome do stem ${layer}`}
                            onFocus={() => {
                              setEditingStem({ id: stem.id, name: stem.name });
                            }}
                            onChange={(event) => {
                              setEditingStem({ id: stem.id, name: event.target.value });
                            }}
                            onBlur={(event) => {
                              renameStem(stem.id, event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                              if (event.key === "Escape") {
                                setEditingStem(undefined);
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        ) : (
                          layer
                        )}
                        {stemColors.has(layer) && (
                          <TE.StemColorButton
                            type="button"
                            $color={stemColors.get(layer) ?? "var(--green-200)"}
                            aria-label={`Alterar cor do stem ${layer}`}
                            title="Alterar cor"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              colorPickerRefs.setReference(event.currentTarget);
                              setColorPickerStemName(layer);
                            }}
                          />
                        )}
                        <TE.LayerPulse
                        ref={(element) => {
                          if (element) {
                            layerPulseRefs.current.set(layer, element);
                          } else {
                            layerPulseRefs.current.delete(layer);
                          }
                        }}
                        $color={stemColors.get(layer) ?? "var(--green-200)"}
                      />
                      </TE.Layer>
                    );
                  })}
                </TE.Layers>
                <TE.EventsViewport
                  ref={eventsViewportRef}
                  onWheel={handleZoom}
                  onScroll={syncTimelineScroll}
                >
                  <TE.EventsCanvas $contentWidth={timelineContentWidth}>
                    {timelineGrid}
                    <TE.EventsPlayhead
                      ref={eventsPlayheadRef}
                      $height={layers.length * 48}
                    />
                    {selectionBox && (
                      <TE.SelectionBox
                        $left={Math.min(
                          selectionBox.startX,
                          selectionBox.currentX,
                        )}
                        $top={Math.min(
                          selectionBox.startY,
                          selectionBox.currentY,
                        )}
                        $width={Math.abs(
                          selectionBox.currentX - selectionBox.startX,
                        )}
                        $height={Math.abs(
                          selectionBox.currentY - selectionBox.startY,
                        )}
                      />
                    )}
                    {layers.map((layer) => (
                      <TE.EventLane
                        key={layer}
                        onPointerDown={(event) => {
                          if (event.ctrlKey) startSelection(event);
                          else startEventCreation(event, layer);
                        }}
                        onPointerMove={(event) => {
                          movePendingEvent(event);
                          moveSelection(event);
                        }}
                        onPointerUp={() => {
                          finishEventCreation();
                          finishSelection();
                        }}
                        onPointerCancel={() => {
                          cancelEventCreation();
                          finishSelection();
                        }}
                      >
                        {pendingEvent?.stem === layer && (
                          <TE.EventMarker
                            $color={stemColors.get(layer) ?? "var(--green-200)"}
                            $isPending
                            style={{
                              left: `${getTimelinePositionPercent(pendingEvent.timeSeconds)}%`,
                            }}
                          />
                        )}
                        {events
                          .filter((event) => event.stem === layer)
                          .map((event) => (
                            <TE.EventMarker
                              key={event.id}
                              ref={(element) => {
                                if (element) {
                                  eventMarkerRefs.current.set(
                                    event.id,
                                    element,
                                  );
                                } else {
                                  eventMarkerRefs.current.delete(event.id);
                                }
                              }}
                              $color={stemColors.get(layer) ?? "var(--green-200)"}
                              $isSelected={selectedEventIds.includes(event.id)}
                              onPointerDown={(pointerEvent) =>
                                startEventDrag(pointerEvent, event)
                              }
                              onPointerMove={moveEvent}
                              onPointerUp={finishEventDrag}
                              onPointerCancel={cancelEventDrag}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                              }}
                              onContextMenu={(contextEvent) => {
                                contextEvent.preventDefault();
                                contextEvent.stopPropagation();
                                deleteTimelineEvents([event.id]);
                              }}
                              style={{
                                left: `${getTimelinePositionPercent(
                                  draggedEventTimes.get(event.id) ??
                                    event.timeSeconds,
                                )}%`,
                              }}
                            />
                          ))}
                      </TE.EventLane>
                    ))}
                  </TE.EventsCanvas>
                  </TE.EventsViewport>
                </TE.TimelineTracks>
              </TE.Timeline>
              {selectedStem &&
                createPortal(
                  <TE.StemColorPopover
                    ref={colorPickerRefs.setFloating}
                    style={colorPickerStyles}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <HexColorPicker
                      color={selectedStem.color}
                      onChange={(color) =>
                        updateStemColor(selectedStem.name, color)
                      }
                    />
                    <TE.StemColorValue>{selectedStem.color}</TE.StemColorValue>
                  </TE.StemColorPopover>,
                  document.body,
                )}
            </TE.CenterBottom>
        </TE.CenterPanel>
        <TE.RightPanel />
      </TE.Container>
      </TE.Body>
    </>
  );
}
