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
type TransformMode = "move" | "rotate" | "pivot" | `resize-${ResizeHandle}`;
type ResizeHandle = "north-west" | "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west";
interface ElementTransformDragProps {
  elementId: string;
  pointerId: number;
  mode: TransformMode;
  startPoint: { x: number; y: number };
  startTransform: ScenarioElementProps;
  startAngle?: number;
  isAspectUnlocked: boolean;
  pivotWorld?: { x: number; y: number };
}
interface LayerSwapResult {
  draggableData: { from: unknown; to: unknown };
}
interface SmartGuideState {
  vertical?: number;
  horizontal?: number;
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
  translation: "Translação",
  wiggle: "Wiggle",
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
    pivotX: 0.5,
    pivotY: 0.5,
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
    pivotX: 0.5,
    pivotY: 0.5,
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
    pivotX: 0.5,
    pivotY: 0.5,
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

// Geometria principal do elemento, derivada apenas dos seus dados de
// transformação. Elementos decorativos internos nunca entram nos bounds.
const getElementGeometry = (
  element: ScenarioElementProps,
  center = { x: element.x, y: element.y },
) => {
  const width = circleBaseSize * element.scaleX;
  const height = circleBaseSize * element.scaleY;
  const radians = (element.rotation * Math.PI) / 180;
  const extentX = Math.abs(Math.cos(radians) * width * 0.5) + Math.abs(Math.sin(radians) * height * 0.5);
  const extentY = Math.abs(Math.sin(radians) * width * 0.5) + Math.abs(Math.cos(radians) * height * 0.5);
  return {
    width,
    height,
    left: center.x - extentX,
    right: center.x + extentX,
    top: center.y - extentY,
    bottom: center.y + extentY,
    centerX: center.x,
    centerY: center.y,
  };
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
  const [stemResponseTranslations, setStemResponseTranslations] = useState<Record<string, { x: number; y: number; z: number }>>({});
  const [smartGuides, setSmartGuides] = useState<SmartGuideState>({});
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
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
    field: "value" | "translationX" | "translationY" | "translationZ" | "repetitions" | "attackSeconds" | "releaseSeconds",
    value: string,
  ) => {
    if (value === "") {
      updateEditingOperation((operation) => ({ ...operation, [field]: undefined }));
      return;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || (numberValue < 0 && !field.startsWith("translation"))) return;
    if (field === "repetitions" && (!Number.isInteger(numberValue) || numberValue < 1)) return;
    updateEditingOperation((operation) => ({ ...operation, [field]: numberValue }));
  };

  const syncStemResponseWithPlayer = (currentTime: number) => {
    if (!selectedTimeline) {
      setStemResponseScales({});
      setStemResponseRotations({});
      setStemResponseTranslations({});
      return;
    }

    const nextResponses =
      elements.map((element) => {
        const response = element.operations.reduce(
          (currentResponse, operation) => {
            const stem = selectedTimeline.stems.find((stem) => stem.id === operation.stemId);
            if (!stem || !operation.operation) return currentResponse;
            if ((operation.operation === "scale" || operation.operation === "rotation") && operation.value === undefined) return currentResponse;
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
            if (operation.operation === "scale") {
              return { ...currentResponse, scale: currentResponse.scale * (1 + ((operation.value ?? 1) - 1) * intensity) };
            }
            if (operation.operation === "rotation") {
              return { ...currentResponse, rotation: currentResponse.rotation + (operation.value ?? 0) * intensity };
            }
            const isWiggle = operation.operation === "wiggle";
            const duration = attack + release;
            const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
            const repetitions = Math.max(1, Math.floor(operation.repetitions ?? 1));
            const decay = 1 - progress;
            const oscillation = isWiggle
              ? Math.sin(progress * repetitions * Math.PI * 2) * decay * intensity
              : intensity;
            return {
              ...currentResponse,
              translationX: currentResponse.translationX + (operation.translationX ?? 0) * oscillation,
              translationY: currentResponse.translationY + (operation.translationY ?? 0) * oscillation,
              translationZ: currentResponse.translationZ + (operation.translationZ ?? 0) * oscillation,
            };
          },
          { scale: 1, rotation: 0, translationX: 0, translationY: 0, translationZ: 0 },
        );
        return { id: element.id, ...response };
      });
    setStemResponseScales(
      Object.fromEntries(nextResponses.map((response) => [response.id, response.scale])),
    );
    setStemResponseRotations(
      Object.fromEntries(nextResponses.map((response) => [response.id, response.rotation])),
    );
    setStemResponseTranslations(
      Object.fromEntries(nextResponses.map((response) => [response.id, {
        x: response.translationX,
        y: response.translationY,
        z: response.translationZ,
      }])),
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

  // The element's x/y are its visual center. Keep this conversion centralized
  // so the pivot drawn by the editor and the pivot used by rotation cannot
  // diverge (especially after resize or when the element is already rotated).
  const getElementPivotWorld = (element: ScenarioElementProps, rotation = element.rotation) => {
    const offset = getScenarioOffset(
      (element.pivotX - 0.5) * circleBaseSize * element.scaleX,
      (element.pivotY - 0.5) * circleBaseSize * element.scaleY,
      rotation,
    );
    return { x: element.x + offset.x, y: element.y + offset.y };
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
      if (activeElementDrag.mode === "pivot") {
        const width = circleBaseSize * startTransform.scaleX;
        const height = circleBaseSize * startTransform.scaleY;
        // Derive the pivot from the pointer displacement captured at pointer-down.
        // The displacement is converted to scenario units exactly once by
        // getScenarioPoint, then inverse-rotated into the element's local axes.
        // Using the absolute point relative to the element center here causes
        // the expanded transform box (and the element translation) to be mixed
        // into the pivot calculation, making the marker outrun the pointer.
        const deltaX = point.x - activeElementDrag.startPoint.x;
        const deltaY = point.y - activeElementDrag.startPoint.y;
        const radians = (-startTransform.rotation * Math.PI) / 180;
        const localDelta = {
          x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
          y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians),
        };
        const startPivotLocal = {
          x: (startTransform.pivotX - 0.5) * width,
          y: (startTransform.pivotY - 0.5) * height,
        };
        setElements((currentElements) => currentElements.map((element) =>
          element.id === activeElementDrag.elementId
            ? {
                ...startTransform,
                pivotX: Math.max(0, Math.min(1, (startPivotLocal.x + localDelta.x) / width + 0.5)),
                pivotY: Math.max(0, Math.min(1, (startPivotLocal.y + localDelta.y) / height + 0.5)),
              }
            : element,
        ));
        return;
      }
      if (activeElementDrag.mode === "move") {
        const width = circleBaseSize * startTransform.scaleX;
        const height = circleBaseSize * startTransform.scaleY;
        const rawPosition = {
          x: startTransform.x + point.x - activeElementDrag.startPoint.x,
          y: startTransform.y + point.y - activeElementDrag.startPoint.y,
        };
        let position = constrainElementPosition(
          rawPosition.x,
          rawPosition.y,
          width,
          height,
          startTransform.rotation,
        );
        const nextGuides: SmartGuideState = {};
        if (!event.ctrlKey && smartGuidesEnabled) {
          const movingBounds = getElementGeometry(startTransform, position);
          const otherElements = elements.filter((element) => element.id !== startTransform.id);
          const tolerance = 8 / view.zoom;
          const xCandidates = otherElements.flatMap((element) => {
            const bounds = getElementGeometry(element);
            return [
              { value: bounds.left, offset: movingBounds.left - position.x },
              { value: bounds.right, offset: movingBounds.right - position.x },
              { value: bounds.centerX, offset: movingBounds.centerX - position.x },
            ].map((candidate) => ({ ...candidate, distance: Math.abs((position.x + candidate.offset) - candidate.value) }));
          }).sort((first, second) => first.distance - second.distance);
          const yCandidates = otherElements.flatMap((element) => {
            const bounds = getElementGeometry(element);
            return [
              { value: bounds.top, offset: movingBounds.top - position.y },
              { value: bounds.bottom, offset: movingBounds.bottom - position.y },
              { value: bounds.centerY, offset: movingBounds.centerY - position.y },
            ].map((candidate) => ({ ...candidate, distance: Math.abs((position.y + candidate.offset) - candidate.value) }));
          }).sort((first, second) => first.distance - second.distance);
          const xMatch = xCandidates[0];
          const yMatch = yCandidates[0];
          if (xMatch && xMatch.distance <= tolerance) {
            position = { ...position, x: position.x + (xMatch.value - (position.x + xMatch.offset)) };
            nextGuides.vertical = xMatch.value;
          }
          if (yMatch && yMatch.distance <= tolerance) {
            position = { ...position, y: position.y + (yMatch.value - (position.y + yMatch.offset)) };
            nextGuides.horizontal = yMatch.value;
          }
          position = constrainElementPosition(position.x, position.y, width, height, startTransform.rotation);
        }
        setSmartGuides(nextGuides);
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

        const guideTolerance = 8 / view.zoom;
        const otherElements = elements.filter((element) => element.id !== startTransform.id);
        const canSnapWidth = handle.includes("east") || handle.includes("west");
        const canSnapHeight = handle.includes("north") || handle.includes("south");
        const dimensionMatches = otherElements.flatMap((element) => [
          { axis: "width" as const, value: getElementGeometry(element).width, distance: Math.abs(width - getElementGeometry(element).width) },
          { axis: "height" as const, value: getElementGeometry(element).height, distance: Math.abs(height - getElementGeometry(element).height) },
        ]).filter((match) => match.axis === "width" ? canSnapWidth : canSnapHeight)
          .sort((first, second) => first.distance - second.distance);
        const closestMatch = smartGuidesEnabled && !activeElementDrag.isAspectUnlocked
          ? dimensionMatches[0]
          : undefined;
        const nextGuides: SmartGuideState = {};
        if (closestMatch && closestMatch.distance <= guideTolerance) {
          if (closestMatch.axis === "width") {
            width = closestMatch.value;
            if (!activeElementDrag.isAspectUnlocked) height = startHeight * (width / startWidth);
            nextGuides.vertical = 0;
          } else {
            height = closestMatch.value;
            if (!activeElementDrag.isAspectUnlocked) width = startWidth * (height / startHeight);
            nextGuides.horizontal = 0;
          }
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

          const resizedCenterOffset = getScenarioOffset(centerX, centerY, startTransform.rotation);
          const edgeOffset = closestMatch.axis === "width"
            ? getScenarioOffset(
                handle.includes("west") ? -width / 2 : width / 2,
                0,
                startTransform.rotation,
              )
            : getScenarioOffset(
                0,
                handle.includes("north") ? -height / 2 : height / 2,
                startTransform.rotation,
              );
          const edgePosition = {
            x: startTransform.x + resizedCenterOffset.x + edgeOffset.x,
            y: startTransform.y + resizedCenterOffset.y + edgeOffset.y,
          };
          if (closestMatch.axis === "width") nextGuides.vertical = edgePosition.x;
          else nextGuides.horizontal = edgePosition.y;
        }
        setSmartGuides(nextGuides);

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
        const pivotWorld = activeElementDrag.pivotWorld;
        if (startAngle === undefined || !pivotWorld) return;
        const angle = Math.atan2(point.y - pivotWorld.y, point.x - pivotWorld.x);
        const nextRotation = startTransform.rotation + ((angle - startAngle) * 180) / Math.PI;
        const width = circleBaseSize * startTransform.scaleX;
        const height = circleBaseSize * startTransform.scaleY;
        const pivotOffset = getScenarioOffset(
          (startTransform.pivotX - 0.5) * width,
          (startTransform.pivotY - 0.5) * height,
          nextRotation,
        );
        const nextCenter = {
          x: pivotWorld.x - pivotOffset.x,
          y: pivotWorld.y - pivotOffset.y,
        };
        setElements((currentElements) => currentElements.map((element) =>
          element.id === activeElementDrag.elementId
            ? { ...startTransform, ...nextCenter, rotation: nextRotation }
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
      setSmartGuides({});
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
      startAngle: mode === "rotate"
        ? (() => {
            const pivot = getElementPivotWorld(element);
            return Math.atan2(point.y - pivot.y, point.x - pivot.x);
          })()
        : undefined,
      isAspectUnlocked: event.shiftKey,
      pivotWorld: mode === "rotate"
        ? getElementPivotWorld(element)
        : undefined,
    };
    selectElement(element.id);
    viewport.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "h") {
        setActiveTool("hand");
        event.preventDefault();
      } else if (key === "v") {
        setActiveTool("select");
        event.preventDefault();
      } else if (key === "g") {
        setSmartGuidesEnabled((enabled) => !enabled);
        setSmartGuides({});
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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
        height="460px"
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
              {([undefined, "scale", "rotation", "translation", "wiggle"] as const).map((operation) => (
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
            {editingOperation.operation === "translation" || editingOperation.operation === "wiggle" ? (
              <>
                <TitledInput title="X" type="number" value={editingOperation.translationX ?? ""} onChange={(event) => setEditingOperationNumber("translationX", event.currentTarget.value)} />
                <TitledInput title="Y" type="number" value={editingOperation.translationY ?? ""} onChange={(event) => setEditingOperationNumber("translationY", event.currentTarget.value)} />
                <TitledInput title="Z" type="number" value={editingOperation.translationZ ?? ""} onChange={(event) => setEditingOperationNumber("translationZ", event.currentTarget.value)} />
                {editingOperation.operation === "wiggle" && (
                  <TitledInput title="Repetições" type="number" min="1" step="1" value={editingOperation.repetitions ?? 1} onChange={(event) => setEditingOperationNumber("repetitions", event.currentTarget.value)} />
                )}
              </>
            ) : (
              <TitledInput title="Valor" type="number" value={editingOperation.value ?? ""} onChange={(event) => setEditingOperationNumber("value", event.currentTarget.value)} />
            )}
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
                  {smartGuides.vertical !== undefined && (
                    <SE.ScenarioSmartGuide
                      $axis="width"
                      $position={smartGuides.vertical}
                      $width={scenario.width}
                      $height={scenario.height}
                    />
                  )}
                  {smartGuides.horizontal !== undefined && (
                    <SE.ScenarioSmartGuide
                      $axis="height"
                      $position={smartGuides.horizontal}
                      $width={scenario.width}
                      $height={scenario.height}
                    />
                  )}
                  {elements.map((element) => {
                    const responseScale = stemResponseScales[element.id] ?? 1;
                    const responseRotation = stemResponseRotations[element.id] ?? 0;
                    const responseTranslation = stemResponseTranslations[element.id] ?? { x: 0, y: 0, z: 0 };
                    // Keep the saved/base pivot fixed in scenario space. The
                    // stem response changes the rendered geometry/angle, but
                    // must never become a new pivot or make the pivot orbit.
                    const renderedPivotWorld = getElementPivotWorld(element, element.rotation);
                    const renderedWidth = circleBaseSize * element.scaleX * responseScale;
                    const renderedHeight = circleBaseSize * element.scaleY * responseScale;
                    // ScenarioElement is positioned by its real top-left. The
                    // pivot then becomes the exact CSS transform-origin; no
                    // percentage translation (and therefore no hidden center
                    // anchor) participates in the rotation.
                    return <SE.ScenarioElement
                      key={element.id}
                      $pivotWorldX={renderedPivotWorld.x}
                      $pivotWorldY={renderedPivotWorld.y}
                      $pivotLocalX={element.pivotX * renderedWidth}
                      $pivotLocalY={element.pivotY * renderedHeight}
                      $responseTranslateX={responseTranslation.x}
                      $responseTranslateY={responseTranslation.y}
                      $responseTranslateZ={responseTranslation.z}
                      $scaleX={element.scaleX}
                      $scaleY={element.scaleY}
                      $responseScale={responseScale}
                      $rotation={element.rotation}
                      $responseRotation={responseRotation}
                      $isSelected={selectedElementId === element.id}
                      onPointerDown={(event) => startElementTransform(event, "move", element)}
                    >
                      <SE.ScenarioElementCircle $color={element.color} />
                      {selectedElementId === element.id && (
                        <SE.TransformBox $zoom={view.zoom}>
                          <SE.PivotMarker
                            type="button"
                            aria-label="Mover pivô de rotação"
                            $x={element.pivotX}
                            $y={element.pivotY}
                            $zoom={view.zoom}
                            onPointerDown={(event) => startElementTransform(event, "pivot", element)}
                          />
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
                    </SE.ScenarioElement>;
                  })}
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
            <SE.ToolButton
              type="button"
              data-tool="smart-guides"
              aria-label="Ativar ou desativar smart guides (G)"
              title="Smart guides (G)"
              aria-pressed={smartGuidesEnabled}
              $active={smartGuidesEnabled}
              onClick={() => {
                setSmartGuidesEnabled((enabled) => !enabled);
                setSmartGuides({});
              }}
            >
              {Icons.smartGuideIcon}
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
