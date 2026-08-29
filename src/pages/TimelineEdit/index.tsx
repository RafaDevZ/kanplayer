import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { HexColorPicker } from "react-colorful";
import * as TE from "./styles";
import { Icons } from "../../components/Icons";
import { useTimeline, useUpdateTimeline } from "../../queries/useTimelines";
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
  const [colorPickerStemName, setColorPickerStemName] = useState<string>();
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
  const selectionStartRef = useRef<
    { clientX: number; clientY: number } | undefined
  >(undefined);
  const dragPointerXRef = useRef(0);
  const playheadSecondsRef = useRef(0);
  const playheadFollowEnabledRef = useRef(false);
  const playheadReferenceXRef = useRef<number | undefined>(undefined);
  const nextLocalEventIdRef = useRef(-1);
  const nextLocalStemIdRef = useRef(-1000);
  const copiedEventsRef = useRef<TimelineEventProps[]>([]);
  const lastPasteStartSecondsRef = useRef<number | undefined>(undefined);
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
  const { mutate: saveTimeline, isPending: isSavingTimeline } =
    useUpdateTimeline((updatedTimeline) => {
      setTimeline(updatedTimeline);
      setSelectedEventIds([]);
      timelineHistoryRef.current = { past: [], future: [] };
      nextLocalEventIdRef.current = -1;
    });

  useEffect(() => {
    setVisibleBars(4);
    playheadSecondsRef.current = 0;
    setIsPlayheadFollowEnabled(false);
    playheadFollowEnabledRef.current = false;
    playheadReferenceXRef.current = undefined;
    setPlayerDurationSeconds(0);
    setRequestedPlayerTime(undefined);
    previousPlayerTimeRef.current = undefined;
    nextLocalEventIdRef.current = -1;
    nextLocalStemIdRef.current = -1000;
    copiedEventsRef.current = [];
    lastPasteStartSecondsRef.current = undefined;
    flashTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    flashTimeoutsRef.current.clear();
    setSelectedEventIds([]);
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
    setIsPlayheadFollowEnabled(savedTimeline.followPlayhead);
    playheadFollowEnabledRef.current = savedTimeline.followPlayhead;
    playheadReferenceXRef.current = undefined;
    setSelectedEventIds([]);
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
  const beatSeconds =
    timeline?.beatIntervalSeconds ?? (timeline?.bpm ? 60 / timeline.bpm : 0.5);
  const currentBpm = 60 / beatSeconds;
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
      Math.max(0, trackSeconds - barBoundaryToleranceSeconds) / barSeconds,
    ),
  );
  const timelineSeconds = timelineBars * barSeconds;
  const editableDurationSeconds =
    trackSeconds > 0 ? trackSeconds : timelineSeconds;
  const contentScale = Math.max(1, timelineBars / visibleBars);
  const timelineContentWidth = Math.max(
    1,
    timelineViewportWidth * contentScale,
  );
  const pixelsPerBar = timelineContentWidth / timelineBars;
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
    position: (index / timelineBars) * 100,
  })).filter(({ bar }) => bar === 1 || bar % labelInterval === 0);
  const timelineGrid = useMemo(
    () => (
      <TE.TimelineGrid>
        {Array.from({ length: timelineBars }, (_, barIndex) => (
          <TE.TimelineGridBar
            key={barIndex}
            $left={barIndex * pixelsPerBar}
            $width={pixelsPerBar}
            $showBarLine={barIndex % barGridInterval === 0}
            $subdivisionPixels={subdivisionGridPixels}
          />
        ))}
      </TE.TimelineGrid>
    ),
    [barGridInterval, pixelsPerBar, subdivisionGridPixels, timelineBars],
  );

  const getPlayheadCanvasPosition = (timeSeconds: number) =>
    (Math.max(0, Math.min(timeSeconds, timelineSeconds)) / timelineSeconds) *
    timelineContentWidth;

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
      (position / viewport.scrollWidth) * timelineSeconds,
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
    const unsnappedTime = (position / viewport.scrollWidth) * timelineSeconds;
    const snappedTime = snapSeconds
      ? Math.round(unsnappedTime / snapSeconds) * snapSeconds
      : unsnappedTime;
    return Number(Math.min(snappedTime, editableDurationSeconds).toFixed(6));
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

  const deleteTimelineEvents = (eventIds: number[]) => {
    if (!timeline || eventIds.length === 0) return;
    const eventIdsToDelete = new Set(eventIds);
    const hasEventToDelete = timeline.events.some((timelineEvent) =>
      eventIdsToDelete.has(timelineEvent.id),
    );
    if (!hasEventToDelete) return;
    setSelectedEventIds((currentIds) =>
      currentIds.filter((eventId) => !eventIdsToDelete.has(eventId)),
    );
    commitTimelineChange(
      timelineSchema.parse({
        ...timeline,
        events: timeline.events.filter(
          (timelineEvent) => !eventIdsToDelete.has(timelineEvent.id),
        ),
      }),
    );
  };

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
    if (selectedEventIds.length === 0) return;
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

      const selectedEvents = timeline.events.filter((timelineEvent) =>
        selectedEventIds.includes(timelineEvent.id),
      );
      if (selectedEvents.length === 0) return;
      event.preventDefault();
      deleteTimelineEvents(selectedEventIds);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEventIds, timeline]);

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
        }, 120);
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
                <TE.BpmDisplay>
                  {Number(currentBpm.toFixed(2))} BPM
                </TE.BpmDisplay>
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
                <TE.Layers ref={layersRef} onScroll={syncLayersScroll}>
                    {layers.map((layer) => (
                      <TE.Layer key={layer}>
                        {stems.find((stem) => stem.name === layer) ? (
                          <TE.LayerNameInput
                            value={
                              editingStem?.id ===
                              stems.find((stem) => stem.name === layer)?.id
                                ? editingStem?.name
                                : layer
                            }
                            aria-label={`Nome do stem ${layer}`}
                            onFocus={() => {
                              const stem = stems.find(
                                (timelineStem) => timelineStem.name === layer,
                              );
                              if (stem) {
                                setEditingStem({ id: stem.id, name: stem.name });
                              }
                            }}
                            onChange={(event) => {
                              const stem = stems.find(
                                (timelineStem) => timelineStem.name === layer,
                              );
                              if (stem) {
                                setEditingStem({ id: stem.id, name: event.target.value });
                              }
                            }}
                            onBlur={(event) => {
                              const stem = stems.find(
                                (timelineStem) => timelineStem.name === layer,
                              );
                              if (stem) renameStem(stem.id, event.target.value);
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
                  ))}
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
                              left: `${(pendingEvent.timeSeconds / timelineSeconds) * 100}%`,
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
                                left: `${
                                  ((draggedEventTimes.get(event.id) ??
                                    event.timeSeconds) /
                                    timelineSeconds) *
                                  100
                                }%`,
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
  );
}
