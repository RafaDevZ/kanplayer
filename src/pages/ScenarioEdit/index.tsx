import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Icons } from "../../components/Icons";
import Dropdown from "../../components/Dropdown";
import { DropdownOption } from "../../components/Dropdown/styles";
import { TitledInput } from "../../components/DefaultComponents";
import Window from "../../components/Window";
import { MotionDnd } from "../../components/MotionDnd";
import { useMotionDnd } from "../../components/MotionDnd/useMotionDnd";
import type {
  ScenarioElementProps,
  ScenarioElementOperationProps,
  StemResponseOperation,
  StemResponseTransition,
} from "../../interfaces/ScenarioElement";
import { useScenarios, useUpdateScenario } from "../../queries/useScenarios";
import { useTimelines } from "../../queries/useTimelines";
import Player from "../player";
import * as SE from "./styles";

interface ScenarioEditProps {
  scenarioId: number;
  onBack: () => void;
}

type ScenarioTool = "hand" | "select";
type TransformMode = "move" | "rotate" | `resize-${ResizeHandle}`;
type ResizeHandle = "north-west" | "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west";
interface ElementTransformDragProps {
  elementId: string;
  pointerId: number;
  mode: TransformMode;
  startPoint: { x: number; y: number };
  startTransform: ScenarioElementProps;
  startAngle?: number;
  isAspectUnlocked: boolean;
}
interface LayerSwapResult {
  draggableData: { from: unknown; to: unknown };
}

const circleBaseRadius = 20;
const circleBaseSize = circleBaseRadius * 2;

const resizeHandles: ResizeHandle[] = [
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
];

const rotationHandles: ResizeHandle[] = [
  "north-west",
  "north-east",
  "south-east",
  "south-west",
];

const stemResponseOperationLabels: Record<StemResponseOperation, string> = {
  scale: "Escala",
  rotation: "Rotação",
};

const stemResponseTransitionLabels: Record<StemResponseTransition, string> = {
  linear: "Linear",
  ease: "Ease",
  "ease-in": "Ease-in",
  "ease-out": "Ease-out",
  "ease-in-out": "Ease-in-out",
};

const applyStemResponseTransition = (
  progress: number,
  transition: StemResponseTransition | undefined,
) => {
  const normalized = Math.min(1, Math.max(0, progress));
  switch (transition) {
    case "ease-in":
      return normalized * normalized;
    case "ease-out":
      return 1 - (1 - normalized) ** 2;
    case "ease-in-out":
      return normalized < 0.5
        ? 2 * normalized * normalized
        : 1 - ((-2 * normalized + 2) ** 2) / 2;
    case "ease":
      return normalized * normalized * (3 - 2 * normalized);
    case "linear":
    default:
      return normalized;
  }
};

const initialScenarioElements: ScenarioElementProps[] = [
  {
    id: "initial-circle",
    name: "Bolinha 1",
    type: "circle",
    x: 200,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    color: "#00a8ff",
    operations: [],
  },
  {
    id: "test-circle-red",
    name: "Bolinha 2",
    type: "circle",
    x: 300,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    color: "#ff5c62",
    operations: [],
  },
  {
    id: "test-circle-yellow",
    name: "Bolinha 3",
    type: "circle",
    x: 400,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    color: "#ffd166",
    operations: [],
  },
];

const getElementTypeLabel = (type: ScenarioElementProps["type"]) =>
  type === "circle" ? "Bolinha" : String(type).charAt(0).toUpperCase() + String(type).slice(1);

const ensureElementNames = (items: ScenarioElementProps[]) => {
  const usedNames = new Set<string>();
  const nextNumbers = new Map<string, number>();
  return items.map((element) => {
    const typeLabel = getElementTypeLabel(element.type);
    const existingName = element.name?.trim();
    if (existingName && !usedNames.has(existingName)) {
      usedNames.add(existingName);
      const match = existingName.match(new RegExp(`^${typeLabel} (\\d+)$`, "i"));
      if (match) nextNumbers.set(typeLabel, Math.max(nextNumbers.get(typeLabel) ?? 0, Number(match[1])));
      return element;
    }
    let nextNumber = (nextNumbers.get(typeLabel) ?? 0) + 1;
    let name = `${typeLabel} ${nextNumber}`;
    while (usedNames.has(name)) {
      nextNumber += 1;
      name = `${typeLabel} ${nextNumber}`;
    }
    nextNumbers.set(typeLabel, nextNumber);
    usedNames.add(name);
    return { ...element, name };
  });
};

export default function ScenarioEdit({ scenarioId, onBack }: ScenarioEditProps) {
  const { data: scenarios } = useScenarios();
  const { data: timelines } = useTimelines();
  const { mutate: updateScenario, isPending: isSavingScenario } = useUpdateScenario();
  const scenario = scenarios?.find((scenarioData) => scenarioData.id === scenarioId);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const elementDragRef = useRef<ElementTransformDragProps | undefined>(undefined);
  const [activeTool, setActiveTool] = useState<ScenarioTool>("select");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [stemResponseScales, setStemResponseScales] = useState<Record<string, number>>({});
  const [stemResponseRotations, setStemResponseRotations] = useState<Record<string, number>>({});
  const [elements, setElements] = useState<ScenarioElementProps[]>(initialScenarioElements);
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [selectedTimelineId, setSelectedTimelineId] = useState<number>();
  const [isOperationWindowVisible, setIsOperationWindowVisible] = useState(false);
  const [editingOperationId, setEditingOperationId] = useState<string>();
  const [isWindowStemOpen, setIsWindowStemOpen] = useState(false);
  const [isWindowOperationOpen, setIsWindowOperationOpen] = useState(false);
  const [isWindowTransitionOpen, setIsWindowTransitionOpen] = useState(false);
  const { draggable, dragPreview, dragPreviewElementRef, isLocalDragging } = useMotionDnd();
  const selectedTimeline = timelines?.find(
    (timeline) => timeline.id === selectedTimelineId,
  );
  const selectTimeline = (timelineId: number) => setSelectedTimelineId(timelineId);
  const selectedElement = elements.find((element) => element.id === selectedElementId);
  const selectElement = (elementId?: string) => setSelectedElementId(elementId);
  const availableStems = selectedTimeline?.stems ?? [];
  const editingOperation = selectedElement?.operations.find(
    (operation) => operation.id === editingOperationId,
  );
  const layerElements = [...elements].reverse();

  const reorderLayer = (sourceId: string, targetId: string, direction: "top" | "bottom" = "top") => {
    if (sourceId === targetId) return;
    setElements((currentElements) => {
      const nextLayers = [...currentElements].reverse();
      const sourceIndex = nextLayers.findIndex((element) => element.id === sourceId);
      const targetIndex = nextLayers.findIndex((element) => element.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return currentElements;
      const [movedLayer] = nextLayers.splice(sourceIndex, 1);
      nextLayers.splice(direction === "bottom" ? targetIndex + 1 : targetIndex, 0, movedLayer);
      return nextLayers.reverse();
    });
  };

  const handleLayerSwap = (result: LayerSwapResult, direction: "top" | "bottom") => {
    const sourceId = result?.draggableData?.from;
    const targetId = result?.draggableData?.to;
    if (typeof sourceId !== "string" || typeof targetId !== "string") return;
    reorderLayer(sourceId, targetId, direction);
  };

  const updateSelectedElement = (
    updater: (element: ScenarioElementProps) => ScenarioElementProps,
  ) => {
    if (!selectedElementId) return;
    setElements((currentElements) =>
      currentElements.map((element) =>
        element.id === selectedElementId ? updater(element) : element,
      ),
    );
  };

  const updateEditingOperation = (
    updater: (operation: ScenarioElementOperationProps) => ScenarioElementOperationProps,
  ) => {
    if (!editingOperationId) return;
    updateSelectedElement((element) => ({
      ...element,
      operations: element.operations.map((operation) =>
        operation.id === editingOperationId ? updater(operation) : operation,
      ),
    }));
  };

  const addOperation = () => {
    const operation: ScenarioElementOperationProps = { id: crypto.randomUUID() };
    updateSelectedElement((element) => ({
      ...element,
      operations: [...element.operations, operation],
    }));
    setEditingOperationId(operation.id);
    setIsOperationWindowVisible(true);
  };

  const removeEditingOperation = () => {
    if (!editingOperationId) return;
    updateSelectedElement((element) => ({
      ...element,
      operations: element.operations.filter((operation) => operation.id !== editingOperationId),
    }));
    setIsOperationWindowVisible(false);
    setEditingOperationId(undefined);
  };

  const saveScenario = () => {
    if (!scenario) return;
    updateScenario({ ...scenario, elements });
  };

  const setEditingOperationNumber = (
    field: "value" | "attackSeconds" | "releaseSeconds",
    value: string,
  ) => {
    if (value === "") {
      updateEditingOperation((operation) => ({ ...operation, [field]: undefined }));
      return;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) return;
    updateEditingOperation((operation) => ({ ...operation, [field]: numberValue }));
  };

  const syncStemResponseWithPlayer = (currentTime: number) => {
    if (!selectedTimeline) {
      setStemResponseScales({});
      setStemResponseRotations({});
      return;
    }

    const nextResponses =
      elements.map((element) => {
        const response = element.operations.reduce(
          (currentResponse, operation) => {
            const stem = selectedTimeline.stems.find((stem) => stem.id === operation.stemId);
            if (!stem || !operation.operation || operation.value === undefined) return currentResponse;
            const matchingEvents = selectedTimeline.events.filter((timelineEvent) => timelineEvent.stem === stem.name && timelineEvent.timeSeconds <= currentTime);
            const event = matchingEvents[matchingEvents.length - 1];
            if (!event) return currentResponse;
            const elapsed = currentTime - event.timeSeconds;
            const attack = operation.attackSeconds ?? 0;
            const release = operation.releaseSeconds ?? 0;
            const intensity = elapsed <= attack
              ? (attack === 0 ? 1 : applyStemResponseTransition(elapsed / attack, operation.transition))
              : release > 0 && elapsed <= attack + release
                ? 1 - applyStemResponseTransition((elapsed - attack) / release, operation.transition)
                : 0;
            return operation.operation === "scale"
              ? { ...currentResponse, scale: currentResponse.scale * (1 + (operation.value - 1) * intensity) }
              : { ...currentResponse, rotation: currentResponse.rotation + operation.value * intensity };
          },
          { scale: 1, rotation: 0 },
        );
        return { id: element.id, ...response };
      });
    setStemResponseScales(
      Object.fromEntries(nextResponses.map((response) => [response.id, response.scale])),
    );
    setStemResponseRotations(
      Object.fromEntries(nextResponses.map((response) => [response.id, response.rotation])),
    );
  };

  const getScenarioPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - view.x) / view.zoom,
      y: (clientY - bounds.top - view.y) / view.zoom,
    };
  };

  const getElementLocalPoint = (
    point: { x: number; y: number },
    transform: ScenarioElementProps,
  ) => {
    const radians = (-transform.rotation * Math.PI) / 180;
    const x = point.x - transform.x;
    const y = point.y - transform.y;
    return {
      x: x * Math.cos(radians) - y * Math.sin(radians),
      y: x * Math.sin(radians) + y * Math.cos(radians),
    };
  };

  const getScenarioOffset = (x: number, y: number, rotation: number) => {
    const radians = (rotation * Math.PI) / 180;
    return {
      x: x * Math.cos(radians) - y * Math.sin(radians),
      y: x * Math.sin(radians) + y * Math.cos(radians),
    };
  };

  const constrainElementPosition = (
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
  ) => {
    if (!scenario) return { x, y };
    const radians = (rotation * Math.PI) / 180;
    const extentX = Math.abs(Math.cos(radians) * width * 0.5) + Math.abs(Math.sin(radians) * height * 0.5);
    const extentY = Math.abs(Math.sin(radians) * width * 0.5) + Math.abs(Math.cos(radians) * height * 0.5);
    return {
      x: Math.max(extentX, Math.min(scenario.width - extentX, x)),
      y: Math.max(extentY, Math.min(scenario.height - extentY, y)),
    };
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !scenario) return;

    const centerScenario = () =>
      setView((currentView) => ({
        ...currentView,
        x: (viewport.clientWidth - scenario.width * currentView.zoom) / 2,
        y: (viewport.clientHeight - scenario.height * currentView.zoom) / 2,
      }));

    centerScenario();
    const resizeObserver = new ResizeObserver(centerScenario);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [scenario?.id]);

  useEffect(() => {
    if (!scenario) return;
    if (scenario.elements.length === 0) return;
    setElements(ensureElementNames([
      ...scenario.elements,
      ...initialScenarioElements.filter(
        (initialElement) =>
          !scenario.elements.some((element) => element.id === initialElement.id),
      ),
    ]));
    setSelectedTimelineId(scenario.elements[0].linkedTimelineId);
  }, [scenario?.id]);

  const handleZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const bounds = viewport.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    setView((currentView) => {
      const zoom = Math.min(4, Math.max(0.1, currentView.zoom * Math.exp(-event.deltaY * 0.0015)));
      const worldX = (cursorX - currentView.x) / currentView.zoom;
      const worldY = (cursorY - currentView.y) / currentView.zoom;

      return {
        zoom,
        x: cursorX - worldX * zoom,
        y: cursorY - worldY * zoom,
      };
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "hand" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const storedElementDrag = elementDragRef.current;
    if (storedElementDrag && storedElementDrag.pointerId === event.pointerId && scenario) {
      const point = getScenarioPoint(event.clientX, event.clientY);
      if (!point) return;
      let activeElementDrag = storedElementDrag;

      if (
        activeElementDrag.mode.startsWith("resize-") &&
        activeElementDrag.isAspectUnlocked !== event.shiftKey
      ) {
        activeElementDrag = {
          ...activeElementDrag,
          startPoint: point,
          startTransform:
            elements.find((element) => element.id === activeElementDrag.elementId) ??
            activeElementDrag.startTransform,
          isAspectUnlocked: event.shiftKey,
        };
        elementDragRef.current = activeElementDrag;
      }

      const { startTransform } = activeElementDrag;
      if (activeElementDrag.mode === "move") {
        const width = circleBaseSize * startTransform.scaleX;
        const height = circleBaseSize * startTransform.scaleY;
        const position = constrainElementPosition(
          startTransform.x + point.x - activeElementDrag.startPoint.x,
          startTransform.y + point.y - activeElementDrag.startPoint.y,
          width,
          height,
          startTransform.rotation,
        );
        setElements((currentElements) => currentElements.map((element) =>
          element.id === activeElementDrag.elementId ? { ...startTransform, ...position } : element,
        ));
      }
      if (activeElementDrag.mode.startsWith("resize-")) {
        const handle = activeElementDrag.mode.replace("resize-", "") as ResizeHandle;
        const startPoint = getElementLocalPoint(activeElementDrag.startPoint, startTransform);
        const currentPoint = getElementLocalPoint(point, startTransform);
        const deltaX = currentPoint.x - startPoint.x;
        const deltaY = currentPoint.y - startPoint.y;
        const startWidth = circleBaseSize * startTransform.scaleX;
        const startHeight = circleBaseSize * startTransform.scaleY;
        let width = startWidth;
        let height = startHeight;
        let centerX = 0;
        let centerY = 0;

        if (handle.includes("west")) {
          width = Math.max(8, startWidth - deltaX);
          centerX = (startWidth - width) / 2;
        }
        if (handle.includes("east")) {
          width = Math.max(8, startWidth + deltaX);
          centerX = (width - startWidth) / 2;
        }
        if (handle.includes("north")) {
          height = Math.max(8, startHeight - deltaY);
          centerY = (startHeight - height) / 2;
        }
        if (handle.includes("south")) {
          height = Math.max(8, startHeight + deltaY);
          centerY = (height - startHeight) / 2;
        }

        if (!activeElementDrag.isAspectUnlocked) {
          const minimumScale = Math.max(8 / startWidth, 8 / startHeight);
          const widthScale = width / startWidth;
          const heightScale = height / startHeight;
          const resizeFromHorizontalSide = handle === "east" || handle === "west";
          const resizeFromVerticalSide = handle === "north" || handle === "south";
          const scale = Math.max(
            minimumScale,
            resizeFromHorizontalSide
              ? widthScale
              : resizeFromVerticalSide
                ? heightScale
                : Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
                  ? widthScale
                  : heightScale,
          );

          width = startWidth * scale;
          height = startHeight * scale;
          centerX = handle.includes("west")
            ? (startWidth - width) / 2
            : handle.includes("east")
              ? (width - startWidth) / 2
              : 0;
          centerY = handle.includes("north")
            ? (startHeight - height) / 2
            : handle.includes("south")
              ? (height - startHeight) / 2
              : 0;
        }

        const offset = getScenarioOffset(centerX, centerY, startTransform.rotation);
        const position = constrainElementPosition(
          startTransform.x + offset.x,
          startTransform.y + offset.y,
          width,
          height,
          startTransform.rotation,
        );
        setElements((currentElements) => currentElements.map((element) =>
          element.id === activeElementDrag.elementId
            ? { ...startTransform, ...position, scaleX: width / circleBaseSize, scaleY: height / circleBaseSize }
            : element,
        ));
      }
      if (activeElementDrag.mode === "rotate") {
        const startAngle = activeElementDrag.startAngle;
        if (startAngle === undefined) return;
        const angle = Math.atan2(point.y - startTransform.y, point.x - startTransform.x);
        setElements((currentElements) => currentElements.map((element) =>
          element.id === activeElementDrag.elementId
            ? { ...startTransform, rotation: startTransform.rotation + ((angle - startAngle) * 180) / Math.PI }
            : element,
        ));
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const x = event.clientX;
    const y = event.clientY;
    setView((currentView) => ({
      ...currentView,
      x: currentView.x + x - drag.x,
      y: currentView.y + y - drag.y,
    }));
    dragRef.current = { ...drag, x, y };
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (elementDragRef.current?.pointerId === event.pointerId) {
      elementDragRef.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startElementTransform = (
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
    mode: TransformMode,
    element: ScenarioElementProps,
  ) => {
    if (activeTool !== "select" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getScenarioPoint(event.clientX, event.clientY);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
    elementDragRef.current = {
      elementId: element.id,
      pointerId: event.pointerId,
      mode,
      startPoint: point,
      startTransform: element,
      startAngle: Math.atan2(point.y - element.y, point.x - element.x),
      isAspectUnlocked: event.shiftKey,
    };
    selectElement(element.id);
    viewport.setPointerCapture(event.pointerId);
  };

  return (
    <SE.Body data-scenario-id={scenarioId}>
      <MotionDnd ref={dragPreviewElementRef} dragPreview={dragPreview} />
      <SE.Header>
        <SE.HeaderButton type="button" onClick={onBack}>
          {Icons.returnIcon}
        </SE.HeaderButton>
        <SE.HeaderActions>
          <SE.HeaderSaveButton
            type="button"
            disabled={isSavingScenario}
            onClick={saveScenario}
          >
            {isSavingScenario ? "Salvando..." : "Salvar"}
          </SE.HeaderSaveButton>
        </SE.HeaderActions>
      </SE.Header>
      <Window
        isVisible={isOperationWindowVisible && !!editingOperation}
        onClose={() => {
          setIsOperationWindowVisible(false);
          setEditingOperationId(undefined);
          setIsWindowStemOpen(false);
          setIsWindowOperationOpen(false);
          setIsWindowTransitionOpen(false);
        }}
        title="Configurar operação"
        height="400px"
        width="360px"
      >
        {editingOperation && (
          <SE.OperationWindowBody>
            <Dropdown
              title={`Stem: ${availableStems.find((stem) => stem.id === editingOperation.stemId)?.name ?? "Nenhum"}`}
              width="100%"
              isOpen={isWindowStemOpen}
              onClick={() => {
                setIsWindowStemOpen((isOpen) => !isOpen);
                setIsWindowOperationOpen(false);
                setIsWindowTransitionOpen(false);
              }}
            >
              {[undefined, ...availableStems].map((stem) => (
                <DropdownOption key={stem?.id ?? "none"} onClick={() => {
                  updateEditingOperation((operation) => ({ ...operation, stemId: stem?.id }));
                  updateSelectedElement((element) => ({ ...element, linkedTimelineId: stem ? selectedTimeline?.id : undefined }));
                  setIsWindowStemOpen(false);
                }}>{stem?.name ?? "Nenhum"}</DropdownOption>
              ))}
            </Dropdown>
            <Dropdown
              title={`Operação: ${editingOperation.operation ? stemResponseOperationLabels[editingOperation.operation] : "Nenhuma"}`}
              width="100%"
              isOpen={isWindowOperationOpen}
              onClick={() => {
                setIsWindowOperationOpen((isOpen) => !isOpen);
                setIsWindowStemOpen(false);
                setIsWindowTransitionOpen(false);
              }}
            >
              {([undefined, "scale", "rotation"] as const).map((operation) => (
                <DropdownOption key={operation ?? "none"} onClick={() => { updateEditingOperation((currentOperation) => ({ ...currentOperation, operation })); setIsWindowOperationOpen(false); }}>{operation ? stemResponseOperationLabels[operation] : "Nenhuma"}</DropdownOption>
              ))}
            </Dropdown>
            <Dropdown
              title={`Transição: ${editingOperation.transition ? stemResponseTransitionLabels[editingOperation.transition] : "Nenhuma"}`}
              width="100%"
              isOpen={isWindowTransitionOpen}
              onClick={() => {
                setIsWindowTransitionOpen((isOpen) => !isOpen);
                setIsWindowStemOpen(false);
                setIsWindowOperationOpen(false);
              }}
            >
              {([undefined, "linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const).map((transition) => (
                <DropdownOption
                  key={transition ?? "none"}
                  onClick={() => {
                    updateEditingOperation((currentOperation) => ({ ...currentOperation, transition }));
                    setIsWindowTransitionOpen(false);
                  }}
                >
                  {transition ? stemResponseTransitionLabels[transition] : "Nenhuma"}
                </DropdownOption>
              ))}
            </Dropdown>
            <TitledInput title="Valor" type="number" value={editingOperation.value ?? ""} onChange={(event) => setEditingOperationNumber("value", event.currentTarget.value)} />
            <TitledInput title="Ataque (s)" type="number" min="0" value={editingOperation.attackSeconds ?? ""} onChange={(event) => setEditingOperationNumber("attackSeconds", event.currentTarget.value)} />
            <TitledInput title="Liberação (s)" type="number" min="0" value={editingOperation.releaseSeconds ?? ""} onChange={(event) => setEditingOperationNumber("releaseSeconds", event.currentTarget.value)} />
            <SE.OperationActions>
              <SE.OperationSaveButton
                type="button"
                onClick={() => {
                  setIsOperationWindowVisible(false);
                  setEditingOperationId(undefined);
                }}
              >
                Salvar
              </SE.OperationSaveButton>
              <SE.OperationDeleteButton type="button" onClick={removeEditingOperation}>Excluir</SE.OperationDeleteButton>
            </SE.OperationActions>
          </SE.OperationWindowBody>
        )}
      </Window>
      <SE.Container>
        <SE.LeftPanel>
          <SE.TimelineList>
            {timelines?.map((timeline) => (
              <SE.TimelineButton
                key={timeline.id}
                type="button"
                $isSelected={selectedTimelineId === timeline.id}
                aria-pressed={selectedTimelineId === timeline.id}
                onClick={() => selectTimeline(timeline.id)}
                title={timeline.name}
              >
                {timeline.name}
              </SE.TimelineButton>
            ))}
          </SE.TimelineList>
        </SE.LeftPanel>
        <SE.CenterPanel>
          <SE.CenterTop
            ref={viewportRef}
            $isHandActive={activeTool === "hand"}
            onWheel={handleZoom}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            {scenario && (
              <SE.ScenarioCanvas $x={view.x} $y={view.y} $zoom={view.zoom}>
                <SE.ScenarioSurface
                  $width={scenario.width}
                  $height={scenario.height}
                  $backgroundColor={scenario.backgroundColor}
                  onPointerDown={() => {
                    if (activeTool === "select") selectElement();
                  }}
                >
                  {elements.map((element) => (
                    <SE.ScenarioElement
                      key={element.id}
                      $x={element.x}
                      $y={element.y}
                      $scaleX={element.scaleX}
                      $scaleY={element.scaleY}
                      $responseScale={stemResponseScales[element.id] ?? 1}
                      $rotation={element.rotation}
                      $responseRotation={stemResponseRotations[element.id] ?? 0}
                      $isSelected={selectedElementId === element.id}
                      onPointerDown={(event) => startElementTransform(event, "move", element)}
                    >
                      <SE.ScenarioElementCircle $color={element.color} />
                      {selectedElementId === element.id && (
                        <SE.TransformBox $zoom={view.zoom}>
                          {resizeHandles.map((handle) => (
                            <SE.TransformHandle
                              key={handle}
                              type="button"
                              $type="resize"
                              $position={handle}
                              $zoom={view.zoom}
                              aria-label={`Redimensionar: ${handle}`}
                              onPointerDown={(event) =>
                                startElementTransform(event, `resize-${handle}`, element)
                              }
                            />
                          ))}
                          {rotationHandles.map((handle) => (
                            <SE.TransformHandle
                              key={`rotate-${handle}`}
                              type="button"
                              $type="rotate"
                              $position={handle}
                              $zoom={view.zoom}
                              aria-label={`Rotacionar: ${handle}`}
                              onPointerDown={(event) => startElementTransform(event, "rotate", element)}
                            />
                          ))}
                        </SE.TransformBox>
                      )}
                    </SE.ScenarioElement>
                  ))}
                </SE.ScenarioSurface>
              </SE.ScenarioCanvas>
            )}
          </SE.CenterTop>
          <SE.CenterPlayer>
            <Player
              showManager={false}
              enableSpacebarShortcut
              audio={
                selectedTimeline
                  ? {
                      name: selectedTimeline.track.name,
                      path: selectedTimeline.track.path,
                    }
                  : undefined
              }
              onTimeChange={syncStemResponseWithPlayer}
            />
          </SE.CenterPlayer>
          <SE.CenterBottom>
            <SE.ToolButton
              type="button"
              data-tool="select"
              aria-label="Selecionar e transformar elementos"
              aria-pressed={activeTool === "select"}
              $active={activeTool === "select"}
              onClick={() => setActiveTool("select")}
            >
              {Icons.selectIcon}
            </SE.ToolButton>
            <SE.ToolButton
              type="button"
              data-tool="hand"
              aria-label="Mover visualização"
              aria-pressed={activeTool === "hand"}
              $active={activeTool === "hand"}
              onClick={() => setActiveTool("hand")}
            >
              {Icons.handIcon}
            </SE.ToolButton>
          </SE.CenterBottom>
        </SE.CenterPanel>
        <SE.RightPanel>
          <SE.RightTop>
            <SE.LayersPanel>
              {layerElements.map((element) => (
                <SE.LayerItem
                  key={element.id}
                  type="button"
                  data-layer-id={element.id}
                  $isSelected={selectedElementId === element.id}
                  $isDragging={isLocalDragging(element.id)}
                  ref={draggable(element.id, {
                    allowActionDrag: true,
                    onClick: () => selectElement(element.id),
                    onTopSwap: (result: LayerSwapResult) => handleLayerSwap(result, "top"),
                    onBottomSwap: (result: LayerSwapResult) => handleLayerSwap(result, "bottom"),
                  })}
                >
                  {element.name}
                </SE.LayerItem>
              ))}
            </SE.LayersPanel>
          </SE.RightTop>
          <SE.RightBottom>
            {selectedElement && selectedTimeline && (
              <SE.StemBindingPanel>
                <SE.OperationListHeader>
                  Operações
                  <SE.OperationAddButton type="button" onClick={addOperation}>{Icons.addIcon}</SE.OperationAddButton>
                </SE.OperationListHeader>
                {selectedElement.operations.map((operation) => (
                  <SE.OperationItem key={operation.id} type="button" onClick={() => { setEditingOperationId(operation.id); setIsOperationWindowVisible(true); }}>
                    {operation.operation ? stemResponseOperationLabels[operation.operation] : "Nenhuma"}
                  </SE.OperationItem>
                ))}
              </SE.StemBindingPanel>
            )}
          </SE.RightBottom>
        </SE.RightPanel>
      </SE.Container>
    </SE.Body>
  );
}
