import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const defaultLayers = ["kick", "snare", "hihat"];
const beatsPerBar = 4;
const barBoundaryToleranceSeconds = 0.001;

const layerColors: Record<string, string> = {
  kick: "var(--red-200)",
  snare: "var(--blue-200)",
  hihat: "var(--yellow-200)",
};

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
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
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
  const [flashingLayers, setFlashingLayers] = useState<Set<string>>(
    () => new Set(),
  );
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
  const layersRef = useRef<HTMLDivElement>(null);
  const draggedEventRef = useRef<TimelineEventProps[]>([]);
  const draggedEventTimesRef = useRef(new Map<number, number>());
  const pendingEventRef = useRef<TimelineEventProps | undefined>(undefined);
  const eventMarkerRefs = useRef(new Map<number, HTMLSpanElement>());
  const selectionStartRef = useRef<
    { clientX: number; clientY: number } | undefined
  >(undefined);
  const dragPointerXRef = useRef(0);
  const nextLocalEventIdRef = useRef(-1);
  const previousPlayerTimeRef = useRef<number | undefined>(undefined);
  const flashTimeoutsRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const pendingZoomAnchorRef = useRef<{ ratio: number; x: number } | null>(
    null,
  );
  const { mutate: saveTimeline, isPending: isSavingTimeline } =
    useUpdateTimeline((updatedTimeline) => {
      setTimeline(updatedTimeline);
      setSelectedEventIds([]);
      timelineHistoryRef.current = { past: [], future: [] };
      nextLocalEventIdRef.current = -1;
    });

  useEffect(() => {
    setVisibleBars(4);
    setPlayheadSeconds(0);
    setPlayerDurationSeconds(0);
    setRequestedPlayerTime(undefined);
    previousPlayerTimeRef.current = undefined;
    nextLocalEventIdRef.current = -1;
    flashTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    flashTimeoutsRef.current.clear();
    setFlashingLayers(new Set());
    setSelectedEventIds([]);
    timelineHistoryRef.current = { past: [], future: [] };
    setTimeline(undefined);
  }, [trackPath]);

  useEffect(() => {
    if (!savedTimeline) return;
    setTimeline(savedTimeline);
    setSelectedEventIds([]);
    timelineHistoryRef.current = { past: [], future: [] };
    nextLocalEventIdRef.current =
      Math.min(0, ...savedTimeline.events.map((event) => event.id)) - 1;
  }, [savedTimeline?.id]);
  const events = timeline?.events ?? [];
  const layers = [
    ...new Set([...defaultLayers, ...events.map((event) => event.stem)]),
  ];
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
  const playheadPercent =
    (Math.max(0, Math.min(playheadSeconds, timelineSeconds)) /
      timelineSeconds) *
    100;
  const rulerLabels = Array.from({ length: timelineBars }, (_, index) => ({
    bar: index + 1,
    position: (index / timelineBars) * 100,
  })).filter(({ bar }) => bar === 1 || bar % labelInterval === 0);
  const renderTimelineGrid = () => (
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
  );

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
    setPlayheadSeconds(nextTime);
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
    saveTimeline(timeline);
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
  }, [timeline]);

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

  const syncTimelineScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (rulerViewportRef.current) {
      rulerViewportRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
    if (layersRef.current) {
      layersRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const syncLayersScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (eventsViewportRef.current) {
      eventsViewportRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  };

  const syncPlayheadWithPlayer = (currentTime: number) => {
    const previousTime = previousPlayerTimeRef.current;
    const timeDelta =
      previousTime === undefined ? 0 : currentTime - previousTime;

    if (previousTime !== undefined && timeDelta > 0 && timeDelta <= 1.5) {
      const passedLayers = new Set(
        events
          .filter(
            (event) =>
              event.timeSeconds > previousTime &&
              event.timeSeconds <= currentTime,
          )
          .map((event) => event.stem),
      );

      passedLayers.forEach((layer) => {
        setFlashingLayers((current) => {
          const next = new Set(current);
          next.add(layer);
          return next;
        });

        const previousTimeout = flashTimeoutsRef.current.get(layer);
        if (previousTimeout) clearTimeout(previousTimeout);
        const timeout = setTimeout(() => {
          setFlashingLayers((current) => {
            const next = new Set(current);
            next.delete(layer);
            return next;
          });
          flashTimeoutsRef.current.delete(layer);
        }, 120);
        flashTimeoutsRef.current.set(layer, timeout);
      });
    }

    previousPlayerTimeRef.current = currentTime;
    if (!isDraggingPlayhead) setPlayheadSeconds(currentTime);
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
                    {renderTimelineGrid()}
                    <TE.RulerPlayhead $position={playheadPercent}>
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
                      {layer}
                      <TE.LayerPulse
                        $active={flashingLayers.has(layer)}
                        $color={layerColors[layer] ?? "var(--green-200)"}
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
                    {renderTimelineGrid()}
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
                        $playheadPercent={playheadPercent}
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
                            $color={layerColors[layer] ?? "var(--green-200)"}
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
                              $color={layerColors[layer] ?? "var(--green-200)"}
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
          </TE.CenterBottom>
        </TE.CenterPanel>
        <TE.RightPanel />
      </TE.Container>
    </TE.Body>
  );
}
