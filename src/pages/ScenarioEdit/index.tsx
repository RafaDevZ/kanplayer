import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Icons } from "../../components/Icons";
import Dropdown from "../../components/Dropdown";
import { DropdownOption } from "../../components/Dropdown/styles";
import { TitledInput } from "../../components/DefaultComponents";
import Window from "../../components/Window";
import { MotionDnd } from "../../components/MotionDnd";
import { useMotionDnd } from "../../components/MotionDnd/useMotionDnd";
import {
  getFrequencyBandIntensityFromSpectrum,
  isAudioAnalysisPlaying,
  readFrequencySpectrum,
  readVocalIntensity,
} from "../../hooks/player/audioAnalysis";
import type {
  ScenarioElementProps,
  ScenarioElementOperationProps,
  FrequencyResponseProps,
  VocalResponseProps,
  StemResponseOperation,
  StemResponseTransition,
} from "../../interfaces/ScenarioElement";
import { useScenarios, useUpdateScenario } from "../../queries/useScenarios";
import { useStems } from "../../queries/useStems";
import { useTimelines, useUpdateTimeline } from "../../queries/useTimelines";
import { useRitraceRender } from "../../queries/useRitrace";
import { ritraceProgressSchema, type RitraceProgressProps } from "../../interfaces/Ritrace";
import { listen } from "@tauri-apps/api/event";
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
interface MarqueeSelection {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
}

const circleBaseRadius = 20;
const circleBaseSize = circleBaseRadius * 2;

const getElementDimensions = (element: ScenarioElementProps) => ({
  // scaleX/scaleY already represent the rendered size against the editor's
  // common 40px transform unit. Natural PNG dimensions are metadata used to
  // derive the initial aspect ratio, not a second geometry multiplier.
  width: circleBaseSize * element.scaleX,
  height: circleBaseSize * element.scaleY,
});

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

interface ElementResponse {
  scale: number;
  rotation: number;
  translationX: number;
  translationY: number;
  translationZ: number;
}

const applyResponseOperation = (
  response: ElementResponse,
  operation: Pick<ScenarioElementOperationProps, "operation" | "value" | "translationX" | "translationY" | "translationZ" | "repetitions">,
  intensity: number,
  progress = 1,
): ElementResponse => {
  if (operation.operation === "scale") {
    return { ...response, scale: response.scale * (1 + ((operation.value ?? 1) - 1) * intensity) };
  }
  if (operation.operation === "rotation") {
    return { ...response, rotation: response.rotation + (operation.value ?? 0) * intensity };
  }
  const oscillation = operation.operation === "wiggle"
    ? Math.sin(progress * Math.max(1, Math.floor(operation.repetitions ?? 1)) * Math.PI * 2)
      * (progress >= 0 && progress <= 1 ? 1 - progress : 1)
      * intensity
    : intensity;
  return {
    ...response,
    translationX: response.translationX + (operation.translationX ?? 0) * oscillation,
    translationY: response.translationY + (operation.translationY ?? 0) * oscillation,
    translationZ: response.translationZ + (operation.translationZ ?? 0) * oscillation,
  };
};

const getElementTypeLabel = (element: ScenarioElementProps) =>
  element.imageData ? "Imagem" : element.type === "circle" ? "Bolinha" : String(element.type).charAt(0).toUpperCase() + String(element.type).slice(1);

const ensureElementNames = (items: ScenarioElementProps[]) => {
  const usedNames = new Set<string>();
  const nextNumbers = new Map<string, number>();
  // Reserve os nomes já persistidos antes de gerar nomes para itens novos.
  // Assim, inserir uma cópia no início da lista nunca renomeia o original.
  items.forEach((element) => {
    const name = element.name?.trim();
    if (!name) return;
    usedNames.add(name);
    const typeLabel = getElementTypeLabel(element);
    const match = name.match(new RegExp(`^${typeLabel} (\\d+)$`, "i"));
    if (match) nextNumbers.set(typeLabel, Math.max(nextNumbers.get(typeLabel) ?? 0, Number(match[1])));
  });
  const assignedNames = new Set<string>();
  return items.map((element) => {
    const typeLabel = getElementTypeLabel(element);
    const existingName = element.name?.trim();
    if (existingName && !assignedNames.has(existingName)) {
      assignedNames.add(existingName);
      return element;
    }
    let nextNumber = (nextNumbers.get(typeLabel) ?? 0) + 1;
    let name = `${typeLabel} ${nextNumber}`;
    while (usedNames.has(name) || assignedNames.has(name)) {
      nextNumber += 1;
      name = `${typeLabel} ${nextNumber}`;
    }
    nextNumbers.set(typeLabel, nextNumber);
    assignedNames.add(name);
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
  const { width, height } = getElementDimensions(element);
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
  const { data: globalStems } = useStems();
  const { mutate: updateScenario, isPending: isSavingScenario } = useUpdateScenario(
    (updatedScenario) => setElements(updatedScenario.elements),
  );
  const scenario = scenarios?.find((scenarioData) => scenarioData.id === scenarioId);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlsRef = useRef(new Set<string>());
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const elementDragRef = useRef<ElementTransformDragProps | undefined>(undefined);
  const marqueeSelectionRef = useRef<MarqueeSelection | undefined>(undefined);
  const [activeTool, setActiveTool] = useState<ScenarioTool>("select");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [isZoomDropdownOpen, setIsZoomDropdownOpen] = useState(false);
  const [stemResponseScales, setStemResponseScales] = useState<Record<string, number>>({});
  const [stemResponseRotations, setStemResponseRotations] = useState<Record<string, number>>({});
  const [stemResponseTranslations, setStemResponseTranslations] = useState<Record<string, { x: number; y: number; z: number }>>({});
  const [smartGuides, setSmartGuides] = useState<SmartGuideState>({});
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(true);
  const [elements, setElements] = useState<ScenarioElementProps[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection>();
  const [selectedTimelineId, setSelectedTimelineId] = useState<number>();
  const [isOperationWindowVisible, setIsOperationWindowVisible] = useState(false);
  const [editingOperationId, setEditingOperationId] = useState<string>();
  const [isWindowStemOpen, setIsWindowStemOpen] = useState(false);
  const [isWindowOperationOpen, setIsWindowOperationOpen] = useState(false);
  const [isWindowTransitionOpen, setIsWindowTransitionOpen] = useState(false);
  const [isFrequencyWindowVisible, setIsFrequencyWindowVisible] = useState(false);
  const [isVocalWindowVisible, setIsVocalWindowVisible] = useState(false);
  const [vocalProgress, setVocalProgress] = useState<RitraceProgressProps>();
  const [isFrequencyOperationOpen, setIsFrequencyOperationOpen] = useState(false);
  const [isFrequencyTransitionOpen, setIsFrequencyTransitionOpen] = useState(false);
  const [frequencyDraft, setFrequencyDraft] = useState<FrequencyResponseProps>();
  const [isVocalResponseWindowVisible, setIsVocalResponseWindowVisible] = useState(false);
  const [vocalResponseDraft, setVocalResponseDraft] = useState<VocalResponseProps>();
  const [frequencyMaximumHz, setFrequencyMaximumHz] = useState(22_050);
  const frequencyMaximumRef = useRef(22_050);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyDragRef = useRef<"minHz" | "maxHz" | undefined>(undefined);
  const frequencySmoothedRef = useRef<Record<string, number>>({});
  const vocalSmoothedRef = useRef<Record<string, number>>({});
  const frequencyLastTimeRef = useRef<number | undefined>(undefined);
  const responseSignatureRef = useRef("");
  const { draggable, dragPreview, dragPreviewElementRef, isLocalDragging } = useMotionDnd();
  const { mutateAsync: renderRitrace, isPending: isExtractingVocal } = useRitraceRender();
  const { mutateAsync: updateTimeline } = useUpdateTimeline();
  const selectedTimeline = timelines?.find(
    (timeline) => timeline.id === selectedTimelineId,
  );
  const selectTimeline = (timelineId: number) => setSelectedTimelineId(timelineId);
  const selectedElement = elements.find((element) => element.id === selectedElementId);

  const extractTimelineVocal = async () => {
    if (!selectedTimeline || selectedTimeline.vocalPath || isExtractingVocal) return;
    const jobId = crypto.randomUUID();
    setIsVocalWindowVisible(true);
    setVocalProgress({ jobId, stage: "Preparando extração vocal", percent: 0, elapsedSeconds: 0 });
    const unlisten = await listen<unknown>("ritrace-progress", (event) => {
      const progress = ritraceProgressSchema.safeParse(event.payload);
      if (progress.success && progress.data.jobId === jobId) setVocalProgress(progress.data);
    });
    try {
      const result = await renderRitrace({
        jobId,
        audioPath: selectedTimeline.track.path,
        kickMinConfidence: 0,
        snareMinConfidence: 0,
        hihatMinConfidence: 0,
        vocalOnly: true,
        timelineId: selectedTimeline.id,
      });
      if (!result.vocalPath) throw new Error("O RiTrace não retornou o arquivo vocal.");
      await updateTimeline({ ...selectedTimeline, vocalPath: result.vocalPath });
      setVocalProgress({ jobId, stage: "Vocal extraído e salvo", percent: 100, elapsedSeconds: vocalProgress?.elapsedSeconds ?? 0 });
    } finally {
      unlisten();
    }
  };
  const selectElement = (elementId?: string) => {
    setSelectedElementId(elementId);
    setSelectedElementIds(elementId ? [elementId] : []);
  };
  const toggleElementSelection = (elementId: string) => {
    setSelectedElementIds((currentIds) => {
      const nextIds = currentIds.includes(elementId)
        ? currentIds.filter((id) => id !== elementId)
        : [...currentIds, elementId];
      setSelectedElementId(nextIds[nextIds.length - 1]);
      return nextIds;
    });
  };
  const availableStems = globalStems ?? [];
  const frequencyResponse = frequencyDraft ?? selectedElement?.frequencyResponse;
  const vocalResponse = vocalResponseDraft ?? selectedElement?.vocalResponse;
  const editingOperation = selectedElement?.operations.find(
    (operation) => operation.id === editingOperationId,
  );
  const layerElements = elements;

  const reorderLayer = (sourceId: string, targetId: string, direction: "top" | "bottom" = "top") => {
    if (sourceId === targetId) return;
    setElements((currentElements) => {
      const nextLayers = [...currentElements];
      const sourceIndex = nextLayers.findIndex((element) => element.id === sourceId);
      const targetIndex = nextLayers.findIndex((element) => element.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return currentElements;
      const [movedLayer] = nextLayers.splice(sourceIndex, 1);
      const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextLayers.splice(direction === "bottom" ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, movedLayer);
      return nextLayers;
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

  const centerSelectedElements = (axis: "horizontal" | "vertical" | "both") => {
    if (!scenario || selectedElementIds.length === 0) return;
    setElements((currentElements) => currentElements.map((element) => {
      if (!selectedElementIds.includes(element.id)) return element;
      return {
        ...element,
        x: axis === "vertical" ? element.x : scenario.width / 2,
        y: axis === "horizontal" ? element.y : scenario.height / 2,
      };
    }));
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

  const addFrequencyResponse = () => {
    if (!selectedElement || selectedElement.frequencyResponse) return;
    setFrequencyDraft({ minHz: 20, maxHz: frequencyMaximumHz, strength: 1 });
    setIsFrequencyWindowVisible(true);
  };

  const addVocalResponse = () => {
    if (!selectedElement || selectedElement.vocalResponse || !selectedTimeline?.vocalPath) return;
    setVocalResponseDraft({ strength: 1 });
    setIsVocalResponseWindowVisible(true);
  };
  const openVocalResponse = () => {
    if (!selectedElement?.vocalResponse) return;
    setVocalResponseDraft({ ...selectedElement.vocalResponse });
    setIsVocalResponseWindowVisible(true);
  };
  const updateVocalResponse = (updater: (config: VocalResponseProps) => VocalResponseProps) => {
    setVocalResponseDraft((current) => updater(current ?? selectedElement?.vocalResponse ?? { strength: 1 }));
  };
  const saveVocalResponse = () => {
    if (!vocalResponseDraft) return;
    updateSelectedElement((element) => ({ ...element, vocalResponse: { ...vocalResponseDraft } }));
    setVocalResponseDraft(undefined);
    setIsVocalResponseWindowVisible(false);
  };
  const removeVocalResponse = () => {
    updateSelectedElement((element) => ({ ...element, vocalResponse: undefined }));
    setVocalResponseDraft(undefined);
    setIsVocalResponseWindowVisible(false);
  };

  const openFrequencyResponse = () => {
    if (!selectedElement?.frequencyResponse) return;
    setFrequencyDraft({ ...selectedElement.frequencyResponse });
    setIsFrequencyWindowVisible(true);
  };

  const saveFrequencyResponse = () => {
    if (!frequencyDraft) return;
    updateSelectedElement((element) => ({ ...element, frequencyResponse: { ...frequencyDraft } }));
    setIsFrequencyWindowVisible(false);
    setFrequencyDraft(undefined);
  };

  const removeFrequencyResponse = () => {
    updateSelectedElement((element) => ({ ...element, frequencyResponse: undefined }));
    setIsFrequencyWindowVisible(false);
    setFrequencyDraft(undefined);
  };

  const updateFrequencyResponse = (updater: (config: FrequencyResponseProps) => FrequencyResponseProps) => {
    setFrequencyDraft((current) => updater(current ?? selectedElement?.frequencyResponse ?? { minHz: 20, maxHz: frequencyMaximumHz }));
  };

  const setFrequencyResponseNumber = (
    field: keyof Pick<FrequencyResponseProps, "value" | "translationX" | "translationY" | "translationZ" | "repetitions" | "strength" | "attackSeconds" | "releaseSeconds">,
    value: string,
  ) => {
    if (value === "") {
      updateFrequencyResponse((config) => ({ ...config, [field]: undefined }));
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 && !field.startsWith("translation")) return;
    if (field === "repetitions" && (!Number.isInteger(numericValue) || numericValue < 1)) return;
    updateFrequencyResponse((config) => ({
      ...config,
      [field]: field === "strength" ? Math.min(1, numericValue) : numericValue,
    }));
  };

  const setVocalResponseNumber = (
    field: keyof Pick<VocalResponseProps, "value" | "translationX" | "translationY" | "translationZ" | "repetitions" | "strength" | "attackSeconds" | "releaseSeconds">,
    value: string,
  ) => {
    if (value === "") return updateVocalResponse((config) => ({ ...config, [field]: undefined }));
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || (numericValue < 0 && !field.startsWith("translation"))) return;
    if (field === "repetitions" && (!Number.isInteger(numericValue) || numericValue < 1)) return;
    updateVocalResponse((config) => ({ ...config, [field]: field === "strength" ? Math.min(1, numericValue) : numericValue }));
  };

  const updateFrequencyBoundary = (boundary: "minHz" | "maxHz", value: number) => {
    if (!Number.isFinite(value)) return;
    updateFrequencyResponse((config) => {
      const current = config;
      const nextValue = Math.max(0, Math.min(frequencyMaximumHz, value));
      const next = boundary === "minHz"
        ? { minHz: Math.min(nextValue, current.maxHz - 1), maxHz: current.maxHz }
        : { minHz: current.minHz, maxHz: Math.max(current.minHz + 1, nextValue) };
      return { ...config, ...next };
    });
  };

  const handleFrequencyHandlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    boundary: "minHz" | "maxHz",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    frequencyDragRef.current = boundary;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFrequencyHandlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const boundary = frequencyDragRef.current;
    const canvas = frequencyCanvasRef.current;
    if (!boundary || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    updateFrequencyBoundary(boundary, ratio * frequencyMaximumHz);
  };

  const stopFrequencyHandleDrag = () => {
    frequencyDragRef.current = undefined;
  };

  useEffect(() => {
    if (!isFrequencyWindowVisible || !frequencyResponse) return;
    let frame = 0;
    let idleTimer: number | undefined;
    let lastDrawAt = 0;
    let canvasContext: CanvasRenderingContext2D | null = null;
    const update = () => {
      const now = performance.now();
      // A visualização não precisa acompanhar o tick de áudio a 60+ FPS. A
      // análise usada pelo cenário continua sendo atualizada no loop central;
      // aqui limitamos apenas o desenho do modal a 30 FPS.
      if (now - lastDrawAt < 1000 / 30) {
        frame = requestAnimationFrame(update);
        return;
      }
      const data = readFrequencySpectrum();
      if (data) {
        lastDrawAt = now;
        const maximumHz = data.sampleRate / 2;
        if (maximumHz !== frequencyMaximumRef.current) {
          frequencyMaximumRef.current = maximumHz;
          setFrequencyMaximumHz(maximumHz);
        }
        const canvas = frequencyCanvasRef.current;
        canvasContext ??= canvas?.getContext("2d") ?? null;
        if (canvas && canvasContext) {
          const context = canvasContext;
          // Evita uma superfície interna desproporcional em monitores com DPR
          // muito alto, mantendo nitidez suficiente para o tamanho do gráfico.
          const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
          const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
          const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.clearRect(0, 0, width, height);
          context.fillStyle = "#c77dff";
          const barCount = Math.min(256, data.values.length);
          const binsPerBar = data.values.length / barCount;
          const barWidth = width / barCount;
          for (let index = 0; index < barCount; index += 1) {
            const start = Math.floor(index * binsPerBar);
            const end = Math.max(start + 1, Math.floor((index + 1) * binsPerBar));
            let peak = 0;
            for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, data.values[bin]);
            const barHeight = (peak / 255) * height;
            context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth), barHeight);
          }
        }
      }
      if (isAudioAnalysisPlaying()) {
        frame = requestAnimationFrame(update);
      } else {
        // Enquanto pausado, não há frames de desenho. Uma checagem esparsa
        // permite retomar o gráfico caso o usuário dê play com a janela aberta.
        idleTimer = window.setTimeout(update, 250);
      }
    };
    update();
    return () => {
      cancelAnimationFrame(frame);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      canvasContext = null;
    };
  }, [isFrequencyWindowVisible]);

  const addComponent = () => {
    if (!scenario) return;
    const componentId = crypto.randomUUID();
    setElements((currentElements) => ensureElementNames([
      {
        id: componentId,
        name: "",
        type: "circle",
        x: scenario.width / 2,
        y: scenario.height / 2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        pivotX: 0.5,
        pivotY: 0.5,
        color: "#00a8ff",
        operations: [],
      },
      ...currentElements,
    ]));
    selectElement(componentId);
  };

  const importImageComponent = (file: File) => {
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    if (!isPng) return;
    const imagePreviewUrl = URL.createObjectURL(file);
    imagePreviewUrlsRef.current.add(imagePreviewUrl);
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = typeof reader.result === "string" ? reader.result : undefined;
      if (!imageData || !scenario) {
        URL.revokeObjectURL(imagePreviewUrl);
        imagePreviewUrlsRef.current.delete(imagePreviewUrl);
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        const componentId = crypto.randomUUID();
        const initialSize = Math.min(240, Math.max(40, Math.min(scenario.width, scenario.height) * 0.35));
        const factor = initialSize / Math.max(image.naturalWidth, image.naturalHeight);
        setElements((currentElements) => ensureElementNames([
          {
            id: componentId,
            name: "",
            type: "circle",
            x: scenario.width / 2,
            y: scenario.height / 2,
            scaleX: (image.naturalWidth * factor) / circleBaseSize,
            scaleY: (image.naturalHeight * factor) / circleBaseSize,
            rotation: 0,
            pivotX: 0.5,
            pivotY: 0.5,
            color: "#ffffff",
            imageData,
            imagePreviewUrl,
            imageWidth: image.naturalWidth,
            imageHeight: image.naturalHeight,
            operations: [],
          },
          ...currentElements,
        ]));
        selectElement(componentId);
      };
      image.onerror = () => {
        URL.revokeObjectURL(imagePreviewUrl);
        imagePreviewUrlsRef.current.delete(imagePreviewUrl);
      };
      image.src = imagePreviewUrl;
    };
    reader.onerror = () => {
      URL.revokeObjectURL(imagePreviewUrl);
      imagePreviewUrlsRef.current.delete(imagePreviewUrl);
    };
    reader.readAsDataURL(file);
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

  const deleteSelectedComponent = () => {
    if (selectedElementIds.length === 0) return;
    setElements((currentElements) =>
      currentElements.filter((element) => !selectedElementIds.includes(element.id)),
    );
    selectElement();
    setSmartGuides({});
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
    // Só consulta o analyser quando existe ao menos um modulador de faixa
    // utilizável. Isso mantém o playback normal livre de trabalho de FFT.
    const hasFrequencyModulator = Boolean(
      selectedTimeline && elements.some((element) => element.frequencyResponse?.operation),
    );
    const spectrum = hasFrequencyModulator ? readFrequencySpectrum() : undefined;
    const hasVocalModulator = Boolean(selectedTimeline?.vocalPath && elements.some((element) => element.vocalResponse?.operation));
    const vocalIntensity = hasVocalModulator ? readVocalIntensity() : 0;
    const previousTime = frequencyLastTimeRef.current;
    const elapsedSinceLastFrame = previousTime === undefined || currentTime < previousTime
      ? 0
      : currentTime - previousTime;
    frequencyLastTimeRef.current = currentTime;
    const latestEventsByStem = new Map<number, NonNullable<typeof selectedTimeline>["events"][number]>();
    selectedTimeline?.events.forEach((timelineEvent) => {
      if (timelineEvent.timeSeconds > currentTime || !timelineEvent.stemId) return;
      const previousEvent = latestEventsByStem.get(timelineEvent.stemId);
      if (!previousEvent || timelineEvent.timeSeconds >= previousEvent.timeSeconds) {
        latestEventsByStem.set(timelineEvent.stemId, timelineEvent);
      }
    });
    const nextResponses =
      elements.map((element) => {
        const response = element.operations.reduce(
          (currentResponse, operation) => {
            if (!operation.operation) return currentResponse;
            if ((operation.operation === "scale" || operation.operation === "rotation") && operation.value === undefined) return currentResponse;
            const event = operation.stemId ? latestEventsByStem.get(operation.stemId) : undefined;
            const elapsed = event ? currentTime - event.timeSeconds : 0;
            const attack = operation.attackSeconds ?? 0;
            const release = operation.releaseSeconds ?? 0;
            const stemIntensity = event
              ? elapsed <= attack
              ? (attack === 0 ? 1 : applyStemResponseTransition(elapsed / attack, operation.transition))
              : release > 0 && elapsed <= attack + release
                ? 1 - applyStemResponseTransition((elapsed - attack) / release, operation.transition)
                : 0
              : 0;
            const intensity = stemIntensity;
            if (intensity <= 0) return currentResponse;
            const duration = attack + release;
            const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
            return applyResponseOperation(currentResponse, operation, intensity, progress);
          },
          { scale: 1, rotation: 0, translationX: 0, translationY: 0, translationZ: 0 },
        );
        const frequency = element.frequencyResponse;
        const frequencyOperation = frequency?.operation;
        let frequencyForce = 0;
        if (spectrum && selectedTimeline && frequency && frequencyOperation) {
          const rawForce = Math.min(1, getFrequencyBandIntensityFromSpectrum(spectrum, frequency.minHz, frequency.maxHz) * (frequency.strength ?? 1));
          const previousForce = frequencySmoothedRef.current[element.id] ?? 0;
          const duration = rawForce >= previousForce ? frequency.attackSeconds ?? 0 : frequency.releaseSeconds ?? 0;
          const smoothing = duration > 0 ? Math.min(1, elapsedSinceLastFrame / duration) : 1;
          const smoothedForce = previousForce + (rawForce - previousForce) * smoothing;
          frequencySmoothedRef.current[element.id] = smoothedForce;
          frequencyForce = applyStemResponseTransition(smoothedForce, frequency.transition);
        } else if (frequency) {
          frequencySmoothedRef.current[element.id] = 0;
        }
        const finalResponse = frequencyOperation && frequencyForce > 0
          // No modulador contínuo a fase do Wiggle vem do relógio do áudio;
          // passar o tempo evita a fase nula fixa (sin(2πn)) e mantém a
          // oscilação derivada do mesmo tick central do player.
          ? applyResponseOperation(response, frequency, frequencyForce, currentTime)
          : response;
        const vocal = element.vocalResponse;
        const rawVocalForce = vocal?.operation ? Math.min(1, vocalIntensity * (vocal.strength ?? 1)) : 0;
        const previousVocalForce = vocalSmoothedRef.current[element.id] ?? 0;
        const vocalDuration = rawVocalForce >= previousVocalForce ? vocal?.attackSeconds ?? 0 : vocal?.releaseSeconds ?? 0;
        const vocalSmoothing = vocalDuration > 0 ? Math.min(1, elapsedSinceLastFrame / vocalDuration) : 1;
        const vocalForce = previousVocalForce + (rawVocalForce - previousVocalForce) * vocalSmoothing;
        if (vocal) vocalSmoothedRef.current[element.id] = vocalForce;
        const responseWithVocal = vocalForce > 0 && vocal
          ? applyResponseOperation(finalResponse, vocal, applyStemResponseTransition(vocalForce, vocal.transition), currentTime)
          : finalResponse;
        return { id: element.id, ...responseWithVocal };
      });
    const responseSignature = nextResponses
      .map((response) => `${response.id}:${response.scale}:${response.rotation}:${response.translationX}:${response.translationY}:${response.translationZ}`)
      .join("|");
    if (responseSignature === responseSignatureRef.current) return;
    responseSignatureRef.current = responseSignature;
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
      (element.pivotX - 0.5) * getElementDimensions(element).width,
      (element.pivotY - 0.5) * getElementDimensions(element).height,
      rotation,
    );
    return { x: element.x + offset.x, y: element.y + offset.y };
  };

  const getRenderedElementProps = (element: ScenarioElementProps, layerIndex = 0) => {
    const responseScale = stemResponseScales[element.id] ?? 1;
    const responseRotation = stemResponseRotations[element.id] ?? 0;
    const responseTranslation = stemResponseTranslations[element.id] ?? { x: 0, y: 0, z: 0 };
    const renderedPivotWorld = getElementPivotWorld(element);
    const { width: baseWidth, height: baseHeight } = getElementDimensions(element);
    return {
      $pivotWorldX: renderedPivotWorld.x,
      $pivotWorldY: renderedPivotWorld.y,
      $pivotLocalX: element.pivotX * baseWidth * responseScale,
      $pivotLocalY: element.pivotY * baseHeight * responseScale,
      $responseTranslateX: responseTranslation.x,
      $responseTranslateY: responseTranslation.y,
      $responseTranslateZ: responseTranslation.z,
      $scaleX: element.scaleX,
      $scaleY: element.scaleY,
      $responseScale: responseScale,
      $rotation: element.rotation,
      $responseRotation: responseRotation,
      $isSelected: selectedElementIds.includes(element.id),
      $layerZIndex: Math.max(1, elements.length - layerIndex),
    };
  };

  const constrainElementPosition = (
    x: number,
    y: number,
    _width: number,
    _height: number,
    _rotation: number,
  ) => {
    // Components may live outside the scenario. Their visual content is
    // clipped at the surface boundary, while selection controls stay visible.
    return { x, y };
  };


  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !scenario) return;

    let hasFittedScenario = false;
    const updateScenarioView = () => {
      if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;

      if (!hasFittedScenario) {
        const padding = 16;
        const zoom = Math.min(
          1,
          Math.max(
            0.1,
            Math.min(
              (viewport.clientWidth - padding * 2) / scenario.width,
              (viewport.clientHeight - padding * 2) / scenario.height,
            ),
          ),
        );
        hasFittedScenario = true;
        setView({
          zoom,
          x: (viewport.clientWidth - scenario.width * zoom) / 2,
          y: (viewport.clientHeight - scenario.height * zoom) / 2,
        });
        return;
      }

      setView((currentView) => ({
        ...currentView,
        x: (viewport.clientWidth - scenario.width * currentView.zoom) / 2,
        y: (viewport.clientHeight - scenario.height * currentView.zoom) / 2,
      }));
    };

    updateScenarioView();
    const resizeObserver = new ResizeObserver(updateScenarioView);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [scenario?.id]);

  useEffect(
    () => () => {
      imagePreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      imagePreviewUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!scenario) return;
    const loadedElements = ensureElementNames(scenario.elements);
    // A sequência persistida é a ordem das camadas e, portanto, a fonte do
    // z-index. Não ordenar por nome ao reabrir o cenário.
    setElements([...loadedElements]);
    selectElement();
    setSelectedTimelineId(scenario.elements.find((element) => element.linkedTimelineId)?.linkedTimelineId);
    frequencySmoothedRef.current = {};
    vocalSmoothedRef.current = {};
    frequencyLastTimeRef.current = undefined;
    responseSignatureRef.current = "";
  }, [scenario?.id]);

  useEffect(() => {
    setIsFrequencyWindowVisible(false);
    setFrequencyDraft(undefined);
    setIsVocalResponseWindowVisible(false);
    setVocalResponseDraft(undefined);
    frequencyDragRef.current = undefined;
  }, [selectedElementId]);

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

  const setScenarioZoom = (zoom: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !scenario) return;
    setView({
      zoom,
      x: (viewport.clientWidth - scenario.width * zoom) / 2,
      y: (viewport.clientHeight - scenario.height * zoom) / 2,
    });
  };

  const fitScenarioToViewport = () => {
    const viewport = viewportRef.current;
    if (!viewport || !scenario) return;
    const padding = 16;
    const zoom = Math.min(
      1,
      Math.max(
        0.1,
        Math.min(
          (viewport.clientWidth - padding * 2) / scenario.width,
          (viewport.clientHeight - padding * 2) / scenario.height,
        ),
      ),
    );
    setScenarioZoom(zoom);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool === "select" && event.button === 0 && event.ctrlKey) {
      const point = getScenarioPoint(event.clientX, event.clientY);
      if (!point) return;
      const selection = { pointerId: event.pointerId, start: point, current: point };
      marqueeSelectionRef.current = selection;
      setMarqueeSelection(selection);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool === "select" && event.button === 0) {
      selectElement();
      return;
    }
    if (activeTool !== "hand" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const marquee = marqueeSelectionRef.current;
    if (marquee?.pointerId === event.pointerId) {
      const point = getScenarioPoint(event.clientX, event.clientY);
      if (!point) return;
      const nextSelection = { ...marquee, current: point };
      marqueeSelectionRef.current = nextSelection;
      setMarqueeSelection(nextSelection);
      const left = Math.min(nextSelection.start.x, point.x);
      const right = Math.max(nextSelection.start.x, point.x);
      const top = Math.min(nextSelection.start.y, point.y);
      const bottom = Math.max(nextSelection.start.y, point.y);
      const selectedIds = elements
        .filter((element) => {
          const bounds = getElementGeometry(element);
          return bounds.left >= left && bounds.right <= right && bounds.top >= top && bounds.bottom <= bottom;
        })
        .map((element) => element.id);
      setSelectedElementIds(selectedIds);
      setSelectedElementId(selectedIds[0]);
      return;
    }
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
        const { width, height } = getElementDimensions(startTransform);
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
        const { width, height } = getElementDimensions(startTransform);
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
        const { width: startWidth, height: startHeight } = getElementDimensions(startTransform);
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
        const { width, height } = getElementDimensions(startTransform);
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
    if (marqueeSelectionRef.current?.pointerId === event.pointerId) {
      marqueeSelectionRef.current = undefined;
      setMarqueeSelection(undefined);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
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
    // Ctrl reserves the gesture for the marquee selection, including when it
    // starts on top of an existing component.
    if (event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getScenarioPoint(event.clientX, event.clientY);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
    let transformElement = event.altKey && mode === "move"
      ? {
          ...element,
          id: crypto.randomUUID(),
          name: "",
          operations: element.operations.map((operation) => ({
            ...operation,
            id: crypto.randomUUID(),
          })),
      }
      : element;
    if (transformElement !== element) {
      // Gere o nome antes de iniciar o drag. O movimento usa startTransform
      // como base em cada frame; se a cópia permanecer com nome vazio, esse
      // valor acaba sobrescrevendo o nome recém-gerado pelo estado.
      transformElement = ensureElementNames([...elements, transformElement])
        .find((item) => item.id === transformElement.id) ?? transformElement;
      setElements((currentElements) => ensureElementNames([
        transformElement,
        ...currentElements,
      ]));
    }
    elementDragRef.current = {
      elementId: transformElement.id,
      pointerId: event.pointerId,
      mode,
      startPoint: point,
      startTransform: transformElement,
      startAngle: mode === "rotate"
        ? (() => {
            const pivot = getElementPivotWorld(transformElement);
            return Math.atan2(point.y - pivot.y, point.x - pivot.x);
          })()
        : undefined,
      isAspectUnlocked: event.shiftKey,
      pivotWorld: mode === "rotate"
        ? getElementPivotWorld(transformElement)
        : undefined,
    };
    selectElement(transformElement.id);
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
      } else if (event.key === "Delete") {
        deleteSelectedComponent();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [selectedElementIds]);

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
        isVisible={isVocalWindowVisible}
        disableClose={isExtractingVocal}
        onClose={() => {
          if (isExtractingVocal) return;
          setIsVocalWindowVisible(false);
          setVocalProgress(undefined);
        }}
        title="Extrair vocal da música"
        height="220px"
        width="420px"
      >
        <SE.OperationWindowBody>
          <SE.VocalExtractionStatus>
            <span>{vocalProgress?.stage ?? "Preparando extração vocal"}</span>
            <strong>{vocalProgress?.percent ?? 0}%</strong>
          </SE.VocalExtractionStatus>
          <SE.OperationActions>
            <SE.OperationSaveButton type="button" disabled={isExtractingVocal} onClick={() => {
              if (selectedTimeline?.vocalPath) {
                setIsVocalWindowVisible(false);
                setVocalProgress(undefined);
              } else {
                void extractTimelineVocal();
              }
            }}>
              {selectedTimeline?.vocalPath ? "Fechar" : isExtractingVocal ? "Extraindo..." : "Extrair vocal"}
            </SE.OperationSaveButton>
          </SE.OperationActions>
        </SE.OperationWindowBody>
      </Window>
      <Window
        isVisible={isVocalResponseWindowVisible && !!vocalResponse}
        onClose={() => { setIsVocalResponseWindowVisible(false); setVocalResponseDraft(undefined); }}
        title="Modulador vocal"
        height="420px"
        width="420px"
      >
        {vocalResponse && (
          <SE.OperationWindowBody>
            <SE.FrequencyForm>
              <Dropdown title={`Operação: ${vocalResponse.operation ? stemResponseOperationLabels[vocalResponse.operation] : "Nenhuma"}`} width="100%" isOpen={isFrequencyOperationOpen} onClick={() => { setIsFrequencyOperationOpen((open) => !open); setIsFrequencyTransitionOpen(false); }}>
                {([undefined, "scale", "rotation", "translation", "wiggle"] as const).map((operation) => <DropdownOption key={operation ?? "none"} onClick={() => { updateVocalResponse((config) => ({ ...config, operation })); setIsFrequencyOperationOpen(false); }}>{operation ? stemResponseOperationLabels[operation] : "Nenhuma"}</DropdownOption>)}
              </Dropdown>
              <Dropdown title={`Transição: ${vocalResponse.transition ? stemResponseTransitionLabels[vocalResponse.transition] : "Linear"}`} width="100%" isOpen={isFrequencyTransitionOpen} onClick={() => { setIsFrequencyTransitionOpen((open) => !open); setIsFrequencyOperationOpen(false); }}>
                {(["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const).map((transition) => <DropdownOption key={transition} onClick={() => { updateVocalResponse((config) => ({ ...config, transition })); setIsFrequencyTransitionOpen(false); }}>{stemResponseTransitionLabels[transition]}</DropdownOption>)}
              </Dropdown>
              {vocalResponse.operation === "translation" || vocalResponse.operation === "wiggle" ? <>
                <TitledInput title="X" type="number" value={vocalResponse.translationX ?? ""} onChange={(event) => setVocalResponseNumber("translationX", event.currentTarget.value)} />
                <TitledInput title="Y" type="number" value={vocalResponse.translationY ?? ""} onChange={(event) => setVocalResponseNumber("translationY", event.currentTarget.value)} />
                <TitledInput title="Z" type="number" value={vocalResponse.translationZ ?? ""} onChange={(event) => setVocalResponseNumber("translationZ", event.currentTarget.value)} />
                {vocalResponse.operation === "wiggle" && <TitledInput title="Repetições" type="number" min="1" step="1" value={vocalResponse.repetitions ?? 1} onChange={(event) => setVocalResponseNumber("repetitions", event.currentTarget.value)} />}
              </> : <TitledInput title="Valor" type="number" value={vocalResponse.value ?? ""} onChange={(event) => setVocalResponseNumber("value", event.currentTarget.value)} />}
              <TitledInput title="Força" type="number" min="0" max="1" step="0.01" value={vocalResponse.strength ?? 1} onChange={(event) => setVocalResponseNumber("strength", event.currentTarget.value)} />
              <TitledInput title="Ataque (s)" type="number" min="0" value={vocalResponse.attackSeconds ?? ""} onChange={(event) => setVocalResponseNumber("attackSeconds", event.currentTarget.value)} />
              <TitledInput title="Liberação (s)" type="number" min="0" value={vocalResponse.releaseSeconds ?? ""} onChange={(event) => setVocalResponseNumber("releaseSeconds", event.currentTarget.value)} />
            </SE.FrequencyForm>
            <SE.OperationActions><SE.OperationSaveButton type="button" onClick={saveVocalResponse}>Salvar</SE.OperationSaveButton><SE.OperationDeleteButton type="button" onClick={removeVocalResponse}>Excluir modulador</SE.OperationDeleteButton></SE.OperationActions>
          </SE.OperationWindowBody>
        )}
      </Window>
      <Window
        isVisible={isFrequencyWindowVisible && !!frequencyResponse}
        onClose={() => {
          setIsFrequencyWindowVisible(false);
          setFrequencyDraft(undefined);
          frequencyDragRef.current = undefined;
        }}
        title="Modulador de frequência"
        height="420px"
        width="420px"
      >
        {frequencyResponse && (
          <SE.FrequencyWindowBody>
            <SE.FrequencyForm>
              <SE.FrequencySpectrum>
              <canvas ref={frequencyCanvasRef} />
              <SE.FrequencyRange
                style={{
                  left: `${(frequencyResponse.minHz / frequencyMaximumHz) * 100}%`,
                  width: `${((frequencyResponse.maxHz - frequencyResponse.minHz) / frequencyMaximumHz) * 100}%`,
                }}
              />
              <SE.FrequencyHandle
                style={{ left: `${(frequencyResponse.minHz / frequencyMaximumHz) * 100}%` }}
                onPointerDown={(event) => handleFrequencyHandlePointerDown(event, "minHz")}
                onPointerMove={handleFrequencyHandlePointerMove}
                onPointerUp={stopFrequencyHandleDrag}
                onPointerCancel={stopFrequencyHandleDrag}
                aria-label="Frequência inicial"
              />
              <SE.FrequencyHandle
                style={{ left: `${(frequencyResponse.maxHz / frequencyMaximumHz) * 100}%` }}
                onPointerDown={(event) => handleFrequencyHandlePointerDown(event, "maxHz")}
                onPointerMove={handleFrequencyHandlePointerMove}
                onPointerUp={stopFrequencyHandleDrag}
                onPointerCancel={stopFrequencyHandleDrag}
                aria-label="Frequência final"
              />
              </SE.FrequencySpectrum>
              <SE.FrequencyLabels>
              <span>Início: {Math.round(frequencyResponse.minHz)} Hz</span>
              <span>Fim: {Math.round(frequencyResponse.maxHz)} Hz</span>
              </SE.FrequencyLabels>
              <Dropdown
              title={`Operação: ${frequencyResponse.operation ? stemResponseOperationLabels[frequencyResponse.operation] : "Nenhuma"}`}
              width="100%"
              isOpen={isFrequencyOperationOpen}
              onClick={() => {
                setIsFrequencyOperationOpen((open) => !open);
                setIsFrequencyTransitionOpen(false);
              }}
            >
              {([undefined, "scale", "rotation", "translation", "wiggle"] as const).map((operation) => (
                <DropdownOption
                  key={operation ?? "none"}
                  onClick={() => {
                    updateFrequencyResponse((config) => ({ ...config, operation }));
                    setIsFrequencyOperationOpen(false);
                  }}
                >
                  {operation ? stemResponseOperationLabels[operation] : "Nenhuma"}
                </DropdownOption>
              ))}
              </Dropdown>
              <Dropdown
              title={`Transição: ${frequencyResponse.transition ? stemResponseTransitionLabels[frequencyResponse.transition] : "Linear"}`}
              width="100%"
              isOpen={isFrequencyTransitionOpen}
              onClick={() => {
                setIsFrequencyTransitionOpen((open) => !open);
                setIsFrequencyOperationOpen(false);
              }}
            >
              {(["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const).map((transition) => (
                <DropdownOption
                  key={transition}
                  onClick={() => {
                    updateFrequencyResponse((config) => ({ ...config, transition }));
                    setIsFrequencyTransitionOpen(false);
                  }}
                >
                  {stemResponseTransitionLabels[transition]}
                </DropdownOption>
              ))}
              </Dropdown>
              {frequencyResponse.operation === "translation" || frequencyResponse.operation === "wiggle" ? (
              <>
                <TitledInput title="X" type="number" value={frequencyResponse.translationX ?? ""} onChange={(event) => setFrequencyResponseNumber("translationX", event.currentTarget.value)} />
                <TitledInput title="Y" type="number" value={frequencyResponse.translationY ?? ""} onChange={(event) => setFrequencyResponseNumber("translationY", event.currentTarget.value)} />
                <TitledInput title="Z" type="number" value={frequencyResponse.translationZ ?? ""} onChange={(event) => setFrequencyResponseNumber("translationZ", event.currentTarget.value)} />
                {frequencyResponse.operation === "wiggle" && <TitledInput title="Repetições" type="number" min="1" step="1" value={frequencyResponse.repetitions ?? 1} onChange={(event) => setFrequencyResponseNumber("repetitions", event.currentTarget.value)} />}
              </>
              ) : (
              <TitledInput title="Valor" type="number" value={frequencyResponse.value ?? ""} onChange={(event) => setFrequencyResponseNumber("value", event.currentTarget.value)} />
              )}
              <TitledInput title="Força" type="number" min="0" max="1" step="0.01" value={frequencyResponse.strength ?? 1} onChange={(event) => setFrequencyResponseNumber("strength", event.currentTarget.value)} />
              <TitledInput title="Ataque (s)" type="number" min="0" value={frequencyResponse.attackSeconds ?? ""} onChange={(event) => setFrequencyResponseNumber("attackSeconds", event.currentTarget.value)} />
              <TitledInput title="Liberação (s)" type="number" min="0" value={frequencyResponse.releaseSeconds ?? ""} onChange={(event) => setFrequencyResponseNumber("releaseSeconds", event.currentTarget.value)} />
            </SE.FrequencyForm>
            <SE.OperationActions>
              <SE.OperationSaveButton type="button" onClick={saveFrequencyResponse}>
                Salvar
              </SE.OperationSaveButton>
              <SE.OperationDeleteButton type="button" onClick={removeFrequencyResponse}>
                Excluir modulador
              </SE.OperationDeleteButton>
            </SE.OperationActions>
          </SE.FrequencyWindowBody>
        )}
      </Window>
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
            <SE.ScenarioToolsHeader onPointerDown={(event) => event.stopPropagation()}>
              <SE.ScenarioToolButton
                type="button"
                disabled={selectedElementIds.length === 0}
                title="Centralizar horizontalmente"
                aria-label="Centralizar horizontalmente"
                onClick={() => centerSelectedElements("horizontal")}
              >
                {Icons.alignHorizontalCenterIcon}
              </SE.ScenarioToolButton>
              <SE.ScenarioToolButton
                type="button"
                disabled={selectedElementIds.length === 0}
                title="Centralizar verticalmente"
                aria-label="Centralizar verticalmente"
                onClick={() => centerSelectedElements("vertical")}
              >
                {Icons.alignVerticalCenterIcon}
              </SE.ScenarioToolButton>
              <SE.ScenarioToolButton
                type="button"
                disabled={selectedElementIds.length === 0}
                title="Centralizar nos dois eixos"
                aria-label="Centralizar nos dois eixos"
                onClick={() => centerSelectedElements("both")}
              >
                {Icons.alignCenterIcon}
              </SE.ScenarioToolButton>
            </SE.ScenarioToolsHeader>
            <SE.ZoomControl onPointerDown={(event) => event.stopPropagation()}>
              <Dropdown
                title={`${Math.round(view.zoom * 100)}%`}
                width="82px"
                zIndex={20}
                isOpen={isZoomDropdownOpen}
                onClick={() => setIsZoomDropdownOpen((isOpen) => !isOpen)}
              >
                {[10, 25, 50, 75, 100].map((percentage) => (
                  <DropdownOption
                    key={percentage}
                    onClick={() => {
                      setScenarioZoom(percentage / 100);
                      setIsZoomDropdownOpen(false);
                    }}
                  >
                    {percentage}%
                  </DropdownOption>
                ))}
                <DropdownOption
                  className="half"
                  onClick={() => {
                    fitScenarioToViewport();
                    setIsZoomDropdownOpen(false);
                  }}
                >
                  Ajustar à tela
                </DropdownOption>
              </Dropdown>
            </SE.ZoomControl>
            {scenario && (
              <SE.ScenarioCanvas $x={view.x} $y={view.y} $zoom={view.zoom}>
                <SE.ScenarioSurface
                  $width={scenario.width}
                  $height={scenario.height}
                  $backgroundColor={scenario.backgroundColor}
                  onPointerDown={(event) => {
                    if (activeTool === "select" && !event.ctrlKey) selectElement();
                  }}
                >
                  {marqueeSelection && (
                    <SE.ScenarioSelectionBox
                      $left={Math.min(marqueeSelection.start.x, marqueeSelection.current.x)}
                      $top={Math.min(marqueeSelection.start.y, marqueeSelection.current.y)}
                      $width={Math.abs(marqueeSelection.current.x - marqueeSelection.start.x)}
                      $height={Math.abs(marqueeSelection.current.y - marqueeSelection.start.y)}
                    />
                  )}
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
                  <SE.ScenarioVisualLayer>
                    {elements.map((element, layerIndex) => (
                      <SE.ScenarioElement
                        key={element.id}
                        {...getRenderedElementProps(element, layerIndex)}
                        onPointerDown={(event) => startElementTransform(event, "move", element)}
                      >
                        {element.imageData ? (
                          <SE.ScenarioElementImage src={element.imagePreviewUrl ?? element.imageData} alt={element.name} draggable={false} />
                        ) : (
                          <SE.ScenarioElementCircle $color={element.color} />
                        )}
                      </SE.ScenarioElement>
                    ))}
                  </SE.ScenarioVisualLayer>
                  <SE.ScenarioControlsLayer>
                    {elements.filter((element) => selectedElementIds.includes(element.id)).map((element) => (
                      <SE.ScenarioElementControl key={element.id} {...getRenderedElementProps(element, elements.findIndex((item) => item.id === element.id))}>
                        {selectedElementId !== element.id ? (
                          <SE.SelectedElementOutline $zoom={view.zoom} />
                        ) : (
                          <SE.TransformBox
                            $zoom={view.zoom}
                            onPointerDown={(event) => startElementTransform(event, "move", element)}
                          >
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
                      </SE.ScenarioElementControl>
                    ))}
                  </SE.ScenarioControlsLayer>
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
              vocalExtraction={selectedTimeline ? {
                extracted: Boolean(selectedTimeline.vocalPath),
                processing: isExtractingVocal,
                onExtract: () => void extractTimelineVocal(),
              } : undefined}
              vocalAnalysisPath={selectedTimeline?.vocalPath}
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
              <SE.OperationListHeader>
                Componentes
                <span style={{ display: "flex", gap: 4 }}>
                  <SE.OperationAddButton type="button" onClick={addComponent} aria-label="Adicionar bolinha" title="Adicionar bolinha">{Icons.addIcon}</SE.OperationAddButton>
                  <SE.OperationAddButton type="button" onClick={() => imageInputRef.current?.click()} aria-label="Importar PNG" title="Importar PNG">{Icons.imageAddIcon}</SE.OperationAddButton>
                </span>
              </SE.OperationListHeader>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,.png"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) importImageComponent(file);
                  event.currentTarget.value = "";
                }}
              />
              {layerElements.map((element) => (
                <SE.LayerItem
                  key={element.id}
                  type="button"
                  data-layer-id={element.id}
                  $isSelected={selectedElementIds.includes(element.id)}
                  $isDragging={isLocalDragging(element.id)}
                  ref={draggable(element.id, {
                    allowActionDrag: true,
                    onClick: ({ event }) => {
                      if (event.ctrlKey) toggleElementSelection(element.id);
                      else selectElement(element.id);
                    },
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
            <SE.StemBindingPanel>
              {selectedElement && (
                  <>
                    <SE.OperationListHeader $accent="frequency">
                      Modulador vocal
                      {!selectedElement.vocalResponse && (
                        <SE.OperationAddButton type="button" disabled={!selectedTimeline?.vocalPath} onClick={addVocalResponse} aria-label="Adicionar modulador vocal">{Icons.addIcon}</SE.OperationAddButton>
                      )}
                    </SE.OperationListHeader>
                    {selectedElement.vocalResponse && (
                      <SE.FrequencyOperationItem type="button" onClick={openVocalResponse}>Resposta ao vocal</SE.FrequencyOperationItem>
                    )}
                    <SE.OperationListHeader $accent="frequency">
                      Modulador de frequência
                      {!selectedElement.frequencyResponse && (
                        <SE.OperationAddButton type="button" onClick={addFrequencyResponse} aria-label="Adicionar modulador de frequência">
                          {Icons.addIcon}
                        </SE.OperationAddButton>
                      )}
                    </SE.OperationListHeader>
                    {selectedElement.frequencyResponse && (
                      <SE.FrequencyOperationItem
                        type="button"
                        onClick={openFrequencyResponse}
                      >
                        Faixa: {Math.round(selectedElement.frequencyResponse.minHz)}–{Math.round(selectedElement.frequencyResponse.maxHz)} Hz
                      </SE.FrequencyOperationItem>
                    )}
                    <SE.OperationListHeader>
                      Operações
                      <SE.OperationAddButton type="button" onClick={addOperation}>{Icons.addIcon}</SE.OperationAddButton>
                    </SE.OperationListHeader>
                    {selectedElement.operations.map((operation) => (
                      <SE.OperationItem key={operation.id} type="button" onClick={() => { setEditingOperationId(operation.id); setIsOperationWindowVisible(true); }}>
                        {operation.operation ? stemResponseOperationLabels[operation.operation] : "Nenhuma"}
                      </SE.OperationItem>
                    ))}
                  </>
              )}
            </SE.StemBindingPanel>
          </SE.RightBottom>
        </SE.RightPanel>
      </SE.Container>
    </SE.Body>
  );
}
