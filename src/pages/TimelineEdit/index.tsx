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
import { timelineSchema } from "../../interfaces/Timeline";

const defaultLayers = ["kick", "snare", "hihat"];

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
  const { data: timeline, isLoading } = useTimeline(trackPath);
  const { mutate: updateTimeline, isPending: isUpdatingTimeline } =
    useUpdateTimeline();
  const [snap, setSnap] = useState<SnapValue>("1/16");
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [playerDurationSeconds, setPlayerDurationSeconds] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [visibleBars, setVisibleBars] = useState<number>(4);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [requestedPlayerTime, setRequestedPlayerTime] = useState<number>();
  const [draggedEvent, setDraggedEvent] = useState<TimelineEventProps>();
  const rulerViewportRef = useRef<HTMLDivElement>(null);
  const eventsViewportRef = useRef<HTMLDivElement>(null);
  const draggedEventRef = useRef<TimelineEventProps | undefined>(undefined);
  const dragPointerXRef = useRef(0);
  const pendingZoomAnchorRef = useRef<{ ratio: number; x: number } | null>(
    null,
  );

  useEffect(() => {
    setVisibleBars(4);
    setPlayheadSeconds(0);
    setPlayerDurationSeconds(0);
    setRequestedPlayerTime(undefined);
  }, [trackPath]);
  const events = timeline?.events ?? [];
  const layers = [
    ...new Set([...defaultLayers, ...events.map((event) => event.stem)]),
  ];
  const beatSeconds =
    timeline?.beatIntervalSeconds ?? (timeline?.bpm ? 60 / timeline.bpm : 0.5);
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
  const trackSeconds = Math.max(
    playerDurationSeconds,
    timeline?.track.durationSeconds ?? 0,
    ...events.map((event) => event.timeSeconds),
    beatSeconds * 4,
  );
  const timelineBars = Math.max(1, Math.ceil(trackSeconds / (beatSeconds * 4)));
  const timelineBeats = timelineBars * 4;
  const timelineSeconds = timelineBeats * beatSeconds;
  const contentScale = Math.max(1, timelineBars / visibleBars);
  const barsInViewport = Math.min(visibleBars, timelineBars);
  const pixelsPerBar = Math.max(1, timelineViewportWidth / barsInViewport);
  const barSeconds = beatSeconds * 4;
  const barGridSeconds = barSeconds * getNiceInterval(4 / pixelsPerBar);
  const barGridPercent = (barGridSeconds / timelineSeconds) * 100;
  const subdivisionSeconds =
    snapSeconds > 0 && snapSeconds < barSeconds
      ? snapSeconds
      : snapSeconds === 0
        ? beatSeconds
        : 0;
  const subdivisionPixels = pixelsPerBar * (subdivisionSeconds / barSeconds);
  const subdivisionGridPercent =
    subdivisionSeconds > 0 && subdivisionPixels >= 4
      ? (subdivisionSeconds / timelineSeconds) * 100
      : undefined;
  const labelInterval = getNiceInterval(36 / pixelsPerBar);
  const playheadPercent = (playheadSeconds / timelineSeconds) * 100;
  const rulerLabels = Array.from({ length: timelineBars }, (_, index) => ({
    bar: index + 1,
    position: (index / timelineBars) * 100,
  })).filter(({ bar }) => bar === 1 || bar % labelInterval === 0);

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
    const nextTime = (position / viewport.scrollWidth) * timelineSeconds;
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
    const audioDuration =
      playerDurationSeconds ||
      timeline.track.durationSeconds ||
      timelineSeconds;
    return Number(Math.min(snappedTime, audioDuration).toFixed(6));
  };

  const createEventAtPosition = (
    event: React.MouseEvent<HTMLDivElement>,
    stem: string,
  ) => {
    if (!timeline || isUpdatingTimeline) return;
    const timeSeconds = getEventTimeAtPosition(event.clientX);
    if (timeSeconds === undefined) return;

    if (
      timeline.events.some(
        (timelineEvent) =>
          timelineEvent.stem === stem &&
          Math.abs(timelineEvent.timeSeconds - timeSeconds) < 0.000001,
      )
    )
      return;

    const timelineEvent = timelineEventSchema.parse({
      stem,
      timeSeconds,
      origin: "manual",
    });
    updateTimeline(
      timelineSchema.parse({
        ...timeline,
        events: [...timeline.events, timelineEvent],
      }),
    );
  };

  const startEventDrag = (
    event: React.PointerEvent<HTMLSpanElement>,
    timelineEvent: TimelineEventProps,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedEventRef.current = timelineEvent;
    setDraggedEvent(timelineEvent);
  };

  const moveEvent = (event: React.PointerEvent<HTMLSpanElement>) => {
    const timelineEvent = draggedEventRef.current;
    const timeSeconds = getEventTimeAtPosition(event.clientX);
    if (!timelineEvent || timeSeconds === undefined) return;
    const movedEvent = { ...timelineEvent, timeSeconds };
    draggedEventRef.current = movedEvent;
    setDraggedEvent(movedEvent);
  };

  const finishEventDrag = () => {
    const movedEvent = draggedEventRef.current;
    draggedEventRef.current = undefined;
    setDraggedEvent(undefined);
    if (!timeline || !movedEvent || isUpdatingTimeline) return;

    const originalEvent = timeline.events.find(
      (timelineEvent) => timelineEvent.id === movedEvent.id,
    );
    const duplicatedEvent = timeline.events.some(
      (timelineEvent) =>
        timelineEvent.id !== movedEvent.id &&
        timelineEvent.stem === movedEvent.stem &&
        Math.abs(timelineEvent.timeSeconds - movedEvent.timeSeconds) < 0.000001,
    );
    if (
      !originalEvent ||
      duplicatedEvent ||
      originalEvent.timeSeconds === movedEvent.timeSeconds
    )
      return;

    updateTimeline(
      timelineSchema.parse({
        ...timeline,
        events: timeline.events.map((timelineEvent) =>
          timelineEvent.id === movedEvent.id
            ? { ...timelineEvent, timeSeconds: movedEvent.timeSeconds }
            : timelineEvent,
        ),
      }),
    );
  };

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
    animationFrameId = requestAnimationFrame(autoScroll);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
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
  };

  const syncPlayheadWithPlayer = (currentTime: number) => {
    if (!isDraggingPlayhead) setPlayheadSeconds(currentTime);
  };

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
      </TE.Header>
      <TE.Container>
        <TE.LeftPanel />
        <TE.CenterPanel>
          <TE.CenterTop />
          <TE.CenterPlayer>
            <Player
              showManager={false}
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
              </TE.SnapControl>
            </TE.TimelineHeader>
            <TE.Timeline>
              <TE.TimelineRuler>
                <TE.RulerLayersSpacer />
                <TE.RulerViewport ref={rulerViewportRef}>
                  <TE.RulerTrack
                    $barGridPercent={barGridPercent}
                    $subdivisionGridPercent={subdivisionGridPercent}
                    $contentScale={contentScale}
                    onPointerDown={startPlayheadDrag}
                    onWheel={handleZoom}
                  >
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
                <TE.Layers>
                  {layers.map((layer) => (
                    <TE.Layer key={layer}>{layer}</TE.Layer>
                  ))}
                </TE.Layers>
                <TE.EventsViewport
                  ref={eventsViewportRef}
                  onWheel={handleZoom}
                  onScroll={syncTimelineScroll}
                >
                  <TE.EventsCanvas $contentScale={contentScale}>
                    {layers.map((layer) => (
                      <TE.EventLane
                        key={layer}
                        $barGridPercent={barGridPercent}
                        $subdivisionGridPercent={subdivisionGridPercent}
                        $playheadPercent={playheadPercent}
                        onClick={(event) => createEventAtPosition(event, layer)}
                      >
                        {events
                          .filter((event) => event.stem === layer)
                          .map((event) => (
                            <TE.EventMarker
                              key={event.id}
                              $color={layerColors[layer] ?? "var(--green-200)"}
                              onPointerDown={(pointerEvent) =>
                                startEventDrag(pointerEvent, event)
                              }
                              onPointerMove={moveEvent}
                              onPointerUp={finishEventDrag}
                              onClick={(clickEvent) =>
                                clickEvent.stopPropagation()
                              }
                              style={{
                                left: `${
                                  ((draggedEvent?.id === event.id
                                    ? draggedEvent.timeSeconds
                                    : event.timeSeconds) /
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
