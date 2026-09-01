import { memo, useEffect, useMemo, useRef, useState, type PointerEvent, type RefCallback, type WheelEvent } from "react";
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
import type { OperationPresetCategory, OperationPresetConfiguration, OperationPresetProps } from "../../interfaces/OperationPreset";
import { useScenario, useUpdateScenario } from "../../queries/useScenarios";
import { useStems } from "../../queries/useStems";
import { useTimelines, useUpdateTimeline } from "../../queries/useTimelines";
import { useRitraceRender } from "../../queries/useRitrace";
import { operationPresetService } from "../../services/operationPresetService";
import { useAlert } from "../../utils/Utils";
import { ritraceProgressSchema, type RitraceProgressProps } from "../../interfaces/Ritrace";
import { listen } from "@tauri-apps/api/event";
import Player from "../player";
import PixiScenarioRenderer, { type PixiScenarioRendererHandle, type PixiTransformMode, type RigAnchorRole } from "./PixiScenarioRenderer";
import {
  defaultElementResponse,
  getElementDimensions,
  getElementGeometry,
  getElementPivotWorld,
  getScenarioOffset,
  scenarioElementBaseSize,
  worldPointToElementCenterLocal,
  type ElementGeometry,
  type ElementResponse,
} from "./scenarioGeometry";
import * as SE from "./styles";
import {
  composeRigResponses,
  getElementNormalizedPoint,
  getRigDescendants,
  getRigResponsiveElementIds,
  transformRigDescendants,
  wouldCreateRigCycle,
} from "./scenarioRig";

interface ScenarioEditProps {
  scenarioId: number;
  onBack: () => void;
}

type ScenarioTool = "hand" | "select" | "rig";
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
  guideTargets: Array<{ id: string; bounds: ElementGeometry }>;
  rigDescendantStarts: ScenarioElementProps[];
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
interface RigDraft {
  parentId: string;
  parentAnchorX: number;
  parentAnchorY: number;
}

interface ScenarioPointerMove {
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}
interface RigAnchorDrag {
  pointerId: number;
  childId: string;
  role: RigAnchorRole;
}

const circleBaseSize = scenarioElementBaseSize;

const stemResponseOperationLabels: Record<StemResponseOperation, string> = {
  scale: "Escala",
  width: "Largura",
  height: "Altura",
  rotation: "Rotação",
  opacity: "Opacidade",
  translation: "Translação",
  wiggle: "Wiggle",
  random: "Aleatório",
  wander: "Flutuação",
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

interface TransformPointerEvent {
  button: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface LayerUiActions {
  rename: (elementId: string, name: string) => void;
  toggleVisibility: (elementId: string) => void;
  startOpacity: (event: PointerEvent<HTMLButtonElement>, element: ScenarioElementProps) => void;
  updateOpacity: (event: PointerEvent<HTMLButtonElement>) => void;
  stopOpacity: (event: PointerEvent<HTMLButtonElement>) => void;
}

interface ScenarioLayerRowViewProps {
  element: ScenarioElementProps;
  selected: boolean;
  dragging: boolean;
  draggableRef: RefCallback<HTMLElement>;
  actions: LayerUiActions;
}

const ScenarioLayerRowView = memo(function ScenarioLayerRowView({
  element,
  selected,
  dragging,
  draggableRef,
  actions,
}: ScenarioLayerRowViewProps) {
  return (
    <SE.LayerRow $isVisible={element.visible}>
      <SE.LayerItem
        data-layer-id={element.id}
        $isSelected={selected}
        $isDragging={dragging}
        ref={draggableRef}
      >
        <SE.LayerNameInput
          value={element.name}
          aria-label={`Nome do componente ${element.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => actions.rename(element.id, event.target.value)}
          onBlur={() => {
            if (!element.name.trim()) actions.rename(element.id, getElementTypeLabel(element));
          }}
        />
      </SE.LayerItem>
      <SE.LayerVisibilityButton
        type="button"
        aria-label={element.visible ? `Ocultar ${element.name}` : `Mostrar ${element.name}`}
        aria-pressed={element.visible}
        title={element.visible ? "Ocultar componente" : "Mostrar componente"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => actions.toggleVisibility(element.id)}
      >
        {element.visible ? Icons.eyeIcon : Icons.eyeClosedIcon}
      </SE.LayerVisibilityButton>
      <SE.LayerOpacityButton
        type="button"
        $opacity={element.opacity}
        aria-label={`Opacidade de ${element.name}: ${Math.round(element.opacity * 100)}%`}
        title={`Opacidade: ${Math.round(element.opacity * 100)}%. Arraste para cima ou para baixo.`}
        onPointerDown={(event) => actions.startOpacity(event, element)}
        onPointerMove={actions.updateOpacity}
        onPointerUp={actions.stopOpacity}
        onPointerCancel={actions.stopOpacity}
      >
        <span>{Math.round(element.opacity * 100)}%</span>
      </SE.LayerOpacityButton>
    </SE.LayerRow>
  );
});

type RandomOperationField = keyof Pick<ScenarioElementOperationProps,
  | "randomScale" | "randomRotation" | "randomTranslationX" | "randomTranslationY" | "randomTranslationZ"
  | "randomWiggleX" | "randomWiggleY" | "randomWiggleZ" | "randomRepetitions"
>;
type OperationNumericField = keyof Pick<ScenarioElementOperationProps,
  | "value" | "translationX" | "translationY" | "translationZ" | "repetitions"
  | "randomScale" | "randomRotation" | "randomTranslationX" | "randomTranslationY" | "randomTranslationZ"
  | "randomWiggleX" | "randomWiggleY" | "randomWiggleZ" | "randomRepetitions"
  | "wanderRadius" | "wanderRotation" | "wanderRepetitions" | "wanderOpposition"
  | "attackSeconds" | "releaseSeconds"
>;
type ModulatorNumericField = OperationNumericField | "strength";

const isSignedOperationField = (field: OperationNumericField) =>
  field === "value"
  ||
  field.startsWith("translation")
  || field === "randomRotation"
  || field === "wanderRotation"
  || field.startsWith("randomTranslation")
  || field.startsWith("randomWiggle");

const isRepetitionField = (field: OperationNumericField) =>
  field === "repetitions" || field === "randomRepetitions" || field === "wanderRepetitions";

interface RandomOperationInputsProps {
  operation: Pick<ScenarioElementOperationProps, RandomOperationField>;
  onChange: (field: RandomOperationField, value: string) => void;
}

const RandomOperationInputs = ({ operation, onChange }: RandomOperationInputsProps) => (
  <>
    <TitledInput title="Escala" type="number" min="0" value={operation.randomScale ?? ""} onChange={(event) => onChange("randomScale", event.currentTarget.value)} />
    <TitledInput title="Rotação (°)" type="number" value={operation.randomRotation ?? ""} onChange={(event) => onChange("randomRotation", event.currentTarget.value)} />
    <TitledInput title="Translação X" type="number" value={operation.randomTranslationX ?? ""} onChange={(event) => onChange("randomTranslationX", event.currentTarget.value)} />
    <TitledInput title="Translação Y" type="number" value={operation.randomTranslationY ?? ""} onChange={(event) => onChange("randomTranslationY", event.currentTarget.value)} />
    <TitledInput title="Translação Z" type="number" value={operation.randomTranslationZ ?? ""} onChange={(event) => onChange("randomTranslationZ", event.currentTarget.value)} />
    <TitledInput title="Wiggle X" type="number" value={operation.randomWiggleX ?? ""} onChange={(event) => onChange("randomWiggleX", event.currentTarget.value)} />
    <TitledInput title="Wiggle Y" type="number" value={operation.randomWiggleY ?? ""} onChange={(event) => onChange("randomWiggleY", event.currentTarget.value)} />
    <TitledInput title="Wiggle Z" type="number" value={operation.randomWiggleZ ?? ""} onChange={(event) => onChange("randomWiggleZ", event.currentTarget.value)} />
    <TitledInput title="Repetições" type="number" min="1" step="1" value={operation.randomRepetitions ?? 4} onChange={(event) => onChange("randomRepetitions", event.currentTarget.value)} />
  </>
);

interface WanderOperationInputsProps {
  operation: Pick<ScenarioElementOperationProps, "wanderRadius" | "wanderRotation" | "wanderRepetitions" | "wanderOpposition">;
  onChange: (field: "wanderRadius" | "wanderRotation" | "wanderRepetitions" | "wanderOpposition", value: string) => void;
}

const WanderOperationInputs = ({ operation, onChange }: WanderOperationInputsProps) => (
  <>
    <TitledInput title="Raio" type="number" min="0" value={operation.wanderRadius ?? 20} onChange={(event) => onChange("wanderRadius", event.currentTarget.value)} />
    <TitledInput title="Rotação (°)" type="number" value={operation.wanderRotation ?? 8} onChange={(event) => onChange("wanderRotation", event.currentTarget.value)} />
    <TitledInput title="Repetições" type="number" min="1" step="1" value={operation.wanderRepetitions ?? 2} onChange={(event) => onChange("wanderRepetitions", event.currentTarget.value)} />
    <TitledInput title="Chance de lado oposto (0–1)" type="number" min="0" max="1" step="0.05" value={operation.wanderOpposition ?? 0.75} onChange={(event) => onChange("wanderOpposition", event.currentTarget.value)} />
  </>
);

const randomSeedCache = new Map<string, number>();

const getStringSeed = (value: string) => {
  const cached = randomSeedCache.get(value);
  if (cached !== undefined) return cached;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seed = hash >>> 0;
  if (randomSeedCache.size >= 4096) randomSeedCache.clear();
  randomSeedCache.set(value, seed);
  return seed;
};

const getSeededRandom = (seed: number, index: number) => {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
};

const getSmoothRandom = (progress: number, repetitions: number, seedKey: string, channel: number) => {
  const position = Math.max(0, progress) * repetitions;
  const index = Math.floor(position);
  const fraction = position - index;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const seed = getStringSeed(`${seedKey}:${channel}`);
  const from = getSeededRandom(seed, index);
  const to = getSeededRandom(seed, index + 1);
  return from + (to - from) * eased;
};

const applyResponseOperation = (
  response: ElementResponse,
  operation: Pick<ScenarioElementOperationProps,
    | "operation" | "value" | "translationX" | "translationY" | "translationZ" | "repetitions"
    | "randomScale" | "randomRotation" | "randomTranslationX" | "randomTranslationY" | "randomTranslationZ"
    | "randomWiggleX" | "randomWiggleY" | "randomWiggleZ" | "randomRepetitions"
    | "wanderRadius" | "wanderRotation" | "wanderRepetitions" | "wanderOpposition"
  >,
  intensity: number,
  progress = 1,
  seedKey = "random",
  baseOpacity = 1,
): ElementResponse => {
  if (operation.operation === "scale") {
    response.scale *= 1 + ((operation.value ?? 1) - 1) * intensity;
    return response;
  }
  if (operation.operation === "width") {
    response.widthScale *= 1 + ((operation.value ?? 1) - 1) * intensity;
    return response;
  }
  if (operation.operation === "height") {
    response.heightScale *= 1 + ((operation.value ?? 1) - 1) * intensity;
    return response;
  }
  if (operation.operation === "rotation") {
    response.rotation += (operation.value ?? 0) * intensity;
    return response;
  }
  if (operation.operation === "opacity") {
    const targetOpacity = Math.max(0, Math.min(1, operation.value ?? 1));
    response.opacity += (targetOpacity - baseOpacity) * intensity;
    return response;
  }
  if (operation.operation === "wander") {
    const repetitions = Math.max(1, Math.floor(operation.wanderRepetitions ?? 2));
    const cyclePosition = Math.max(0, progress) * repetitions;
    const cycle = Math.floor(cyclePosition);
    const cycleProgress = cyclePosition - cycle;
    const opposition = Math.min(1, Math.max(0, operation.wanderOpposition ?? 0.75));
    const seed = getStringSeed(`${seedKey}:wander`);
    const prefersOpposite = (getSeededRandom(seed, cycle * 5) + 1) / 2 <= opposition;
    const slowlyChangingAxis = getSmoothRandom(cycle / 6, 1, seedKey, 11) * Math.PI;
    const freeAngle = ((getSeededRandom(seed, cycle * 5 + 1) + 1) / 2) * Math.PI * 2;
    const targetAngle = prefersOpposite ? slowlyChangingAxis + cycle * Math.PI : freeAngle;
    const radialRandom = (getSeededRandom(seed, cycle * 5 + 2) + 1) / 2;
    const radialFactor = 0.55 + Math.sqrt(radialRandom) * 0.45;
    const returnToCenter = 0.5 - 0.5 * Math.cos(cycleProgress * Math.PI * 2);
    // Em vez de sair e voltar pela mesma reta, percorre um arco diferente em
    // cada excursão. O raio continua fechando em zero nos limites do ciclo,
    // portanto a posição base permanece exata e não há acúmulo de deslocamento.
    const curveDirection = getSeededRandom(seed, cycle * 5 + 3) < 0 ? -1 : 1;
    const curveRandom = (getSeededRandom(seed, cycle * 5 + 4) + 1) / 2;
    const curveSweep = (0.35 + curveRandom * 0.9) * Math.PI * curveDirection;
    const curvedProgress = cycleProgress * cycleProgress * (3 - 2 * cycleProgress);
    const angle = targetAngle + (curvedProgress - 0.5) * curveSweep;
    const distance = (operation.wanderRadius ?? 20) * radialFactor * returnToCenter * intensity;
    response.translationX += Math.cos(angle) * distance;
    response.translationY += Math.sin(angle) * distance;
    const rotationEnvelope = Math.sin(cycleProgress * Math.PI);
    const rotationSway = 0.75 + 0.25 * Math.sin(cycleProgress * Math.PI * 2 + curveRandom * Math.PI * 2);
    response.rotation += (operation.wanderRotation ?? 8) * curveDirection * rotationEnvelope * rotationSway * intensity;
    return response;
  }
  if (operation.operation === "random") {
    const repetitions = Math.max(1, Math.floor(operation.randomRepetitions ?? 4));
    const randomX = getSmoothRandom(progress, repetitions, seedKey, 1);
    const randomY = getSmoothRandom(progress, repetitions, seedKey, 2);
    const randomZ = getSmoothRandom(progress, repetitions, seedKey, 3);
    const randomRotation = getSmoothRandom(progress, repetitions, seedKey, 4);
    const randomScale = (getSmoothRandom(progress, repetitions, seedKey, 5) + 1) / 2;
    const phase = getSeededRandom(getStringSeed(seedKey), 6) * Math.PI * 2;
    const wiggleEnvelope = progress >= 0 && progress <= 1 ? 1 - progress : 1;
    const wiggle = Math.sin(progress * repetitions * Math.PI * 2 + phase) * wiggleEnvelope * intensity;
    response.scale *= 1 + ((operation.randomScale ?? 1) - 1) * randomScale * intensity;
    response.rotation += (operation.randomRotation ?? 0) * randomRotation * intensity;
    response.translationX += (operation.randomTranslationX ?? 0) * randomX * intensity
      + (operation.randomWiggleX ?? 0) * wiggle;
    response.translationY += (operation.randomTranslationY ?? 0) * randomY * intensity
      + (operation.randomWiggleY ?? 0) * wiggle;
    response.translationZ += (operation.randomTranslationZ ?? 0) * randomZ * intensity
      + (operation.randomWiggleZ ?? 0) * wiggle;
    return response;
  }
  const oscillation = operation.operation === "wiggle"
    ? Math.sin(progress * Math.max(1, Math.floor(operation.repetitions ?? 1)) * Math.PI * 2)
      * (progress >= 0 && progress <= 1 ? 1 - progress : 1)
      * intensity
    : intensity;
  response.translationX += (operation.translationX ?? 0) * oscillation;
  response.translationY += (operation.translationY ?? 0) * oscillation;
  response.translationZ += (operation.translationZ ?? 0) * oscillation;
  return response;
};

const getElementTypeLabel = (element: ScenarioElementProps) =>
  element.imageData ? "Imagem" : element.type === "circle" ? "Bolinha" : String(element.type).charAt(0).toUpperCase() + String(element.type).slice(1);

const recoverLegacyOperation = (element: ScenarioElementProps): ScenarioElementProps => {
  if (!element.stemResponseOperation) return element;
  const alreadyRecovered = element.operations.some((operation) =>
    operation.operation === element.stemResponseOperation
    && operation.stemId === element.linkedStemId,
  );
  if (alreadyRecovered) return element;
  return {
    ...element,
    operations: [...element.operations, {
      id: `${element.id}-legacy-stem-operation`,
      stemId: element.linkedStemId,
      operation: element.stemResponseOperation,
      value: element.stemResponseValue,
      attackSeconds: element.stemResponseAttackSeconds,
      releaseSeconds: element.stemResponseReleaseSeconds,
    }],
  };
};

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
  return items.map((rawElement) => {
    const element = recoverLegacyOperation(rawElement);
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

export default function ScenarioEdit({ scenarioId, onBack }: ScenarioEditProps) {
  const { setAlert } = useAlert();
  const { data: scenario } = useScenario(scenarioId);
  const { data: timelines } = useTimelines();
  const { data: globalStems } = useStems();
  const { mutate: updateScenario, isPending: isSavingScenario } = useUpdateScenario(
    (updatedScenario) => setElements(ensureElementNames(updatedScenario.elements)),
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const pixiRendererRef = useRef<PixiScenarioRendererHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlsRef = useRef(new Set<string>());
  const hydratedElementDetailsRef = useRef<string | undefined>(undefined);
  const opacityDragRef = useRef<{ elementId: string; startY: number; startOpacity: number } | undefined>(undefined);
  const opacityFrameRef = useRef<number | undefined>(undefined);
  const pendingOpacityYRef = useRef<number | undefined>(undefined);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const elementDragRef = useRef<ElementTransformDragProps | undefined>(undefined);
  const rigAnchorDragRef = useRef<RigAnchorDrag | undefined>(undefined);
  const marqueeSelectionRef = useRef<MarqueeSelection | undefined>(undefined);
  const pendingPointerMoveRef = useRef<ScenarioPointerMove | undefined>(undefined);
  const pointerMoveFrameRef = useRef<number | undefined>(undefined);
  const [activeTool, setActiveTool] = useState<ScenarioTool>("select");
  const [rigDraft, setRigDraft] = useState<RigDraft>();
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [isZoomDropdownOpen, setIsZoomDropdownOpen] = useState(false);
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
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const [operationPresets, setOperationPresets] = useState<OperationPresetProps[]>([]);
  const [frequencyPresets, setFrequencyPresets] = useState<OperationPresetProps[]>([]);
  const [vocalPresets, setVocalPresets] = useState<OperationPresetProps[]>([]);
  const [isFrequencyPresetDropdownOpen, setIsFrequencyPresetDropdownOpen] = useState(false);
  const [isVocalPresetDropdownOpen, setIsVocalPresetDropdownOpen] = useState(false);
  const [isPresetNameWindowVisible, setIsPresetNameWindowVisible] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetCategory, setPresetCategory] = useState<OperationPresetCategory>("operation");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isFrequencyWindowVisible, setIsFrequencyWindowVisible] = useState(false);
  const [isVocalWindowVisible, setIsVocalWindowVisible] = useState(false);
  const [vocalProgress, setVocalProgress] = useState<RitraceProgressProps>();
  const [isFrequencyOperationOpen, setIsFrequencyOperationOpen] = useState(false);
  const [isFrequencyTransitionOpen, setIsFrequencyTransitionOpen] = useState(false);
  const [frequencyDraft, setFrequencyDraft] = useState<FrequencyResponseProps>();
  const [isVocalResponseWindowVisible, setIsVocalResponseWindowVisible] = useState(false);
  const [vocalResponseDraft, setVocalResponseDraft] = useState<VocalResponseProps>();
  const [frequencyMaximumHz, setFrequencyMaximumHz] = useState(22_050);
  const [frequencyView, setFrequencyView] = useState({ minHz: 0, maxHz: 22_050 });
  const frequencyMaximumRef = useRef(22_050);
  const frequencyCanvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyDragRef = useRef<"minHz" | "maxHz" | "range" | undefined>(undefined);
  const frequencyRangeDragRef = useRef<{
    startClientX: number;
    minHz: number;
    maxHz: number;
  } | undefined>(undefined);
  const frequencySmoothedRef = useRef<Record<string, number>>({});
  const vocalSmoothedRef = useRef<Record<string, number>>({});
  const frequencyLastTimeRef = useRef<number | undefined>(undefined);
  const frequencyBandIntensitiesRef = useRef(new Map<string, number>());
  const latestEventsByStemRef = useRef(new Map<number, { timeSeconds: number } | undefined>());
  const responseValuesRef = useRef<Array<{ id: string } & ElementResponse>>([]);
  const responsesByElementRef = useRef(new Map<string, ElementResponse>());
  const layerActionDelegateRef = useRef<{
    select: (elementId: string, additive: boolean) => void;
    swap: (result: LayerSwapResult, direction: "top" | "bottom") => void;
  }>({ select: () => undefined, swap: () => undefined });
  const layerDraggableRefsRef = useRef(new Map<string, RefCallback<HTMLElement>>());
  const layerUiDelegateRef = useRef<LayerUiActions>({
    rename: () => undefined,
    toggleVisibility: () => undefined,
    startOpacity: () => undefined,
    updateOpacity: () => undefined,
    stopOpacity: () => undefined,
  });
  const stableLayerUiActions = useRef<LayerUiActions>({
    rename: (elementId, name) => layerUiDelegateRef.current.rename(elementId, name),
    toggleVisibility: (elementId) => layerUiDelegateRef.current.toggleVisibility(elementId),
    startOpacity: (event, element) => layerUiDelegateRef.current.startOpacity(event, element),
    updateOpacity: (event) => layerUiDelegateRef.current.updateOpacity(event),
    stopOpacity: (event) => layerUiDelegateRef.current.stopOpacity(event),
  }).current;
  const timelineEventIndexRef = useRef<{
    events?: NonNullable<typeof timelines>[number]["events"];
    byStem: Map<number, Array<{ timeSeconds: number }>>;
  }>({ byStem: new Map() });
  const { draggable, dragPreview, dragPreviewElementRef, isLocalDragging } = useMotionDnd();
  const { mutateAsync: renderRitrace, isPending: isExtractingVocal } = useRitraceRender();
  const { mutateAsync: updateTimeline } = useUpdateTimeline();
  const selectedTimeline = timelines?.find(
    (timeline) => timeline.id === selectedTimelineId,
  );
  const selectTimeline = (timelineId: number) => setSelectedTimelineId(timelineId);
  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId),
    [elements, selectedElementId],
  );
  const selectedElementIdsSet = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);

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
  const frequencyViewSpan = Math.max(1, frequencyView.maxHz - frequencyView.minHz);
  const frequencyPositionPercent = (value: number) => ((value - frequencyView.minHz) / frequencyViewSpan) * 100;
  const frequencyRangeLeftPercent = frequencyResponse
    ? Math.max(0, Math.min(100, frequencyPositionPercent(frequencyResponse.minHz)))
    : 0;
  const frequencyRangeRightPercent = frequencyResponse
    ? Math.max(0, Math.min(100, frequencyPositionPercent(frequencyResponse.maxHz)))
    : 0;
  const editingOperation = selectedElement?.operations.find(
    (operation) => operation.id === editingOperationId,
  );

  const setPresetsForCategory = (category: OperationPresetCategory, presets: OperationPresetProps[]) => {
    if (category === "operation") setOperationPresets(presets);
    else if (category === "frequency") setFrequencyPresets(presets);
    else setVocalPresets(presets);
  };

  const loadPresets = (category: OperationPresetCategory) => operationPresetService.list(category)
    .then((presets) => setPresetsForCategory(category, presets))
    .catch((error) => setAlert({
      type: "error",
      message: error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível listar os presets.",
    }));

  useEffect(() => {
    if (!isOperationWindowVisible) return;
    let cancelled = false;
    void operationPresetService.list("operation")
      .then((presets) => {
        if (!cancelled) setOperationPresets(presets);
      })
      .catch((error) => {
        if (!cancelled) setAlert({
          type: "error",
          message: error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível listar os presets.",
        });
    });
    return () => { cancelled = true; };
  }, [isOperationWindowVisible, setAlert]);
  useEffect(() => {
    if (!isFrequencyWindowVisible) return;
    void loadPresets("frequency");
  }, [isFrequencyWindowVisible]);
  useEffect(() => {
    if (!isVocalResponseWindowVisible) return;
    void loadPresets("vocal");
  }, [isVocalResponseWindowVisible]);
  const layerElements = elements;
  const rigResponsiveElementIds = useMemo(() => getRigResponsiveElementIds(elements), [elements]);
  const responseElements = useMemo(
    () => elements.filter((element) => element.visible && rigResponsiveElementIds.has(element.id)),
    [elements, rigResponsiveElementIds],
  );
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
  layerActionDelegateRef.current = {
    select: (elementId, additive) => {
      if (additive) toggleElementSelection(elementId);
      else selectElement(elementId);
    },
    swap: handleLayerSwap,
  };
  const getLayerDraggableRef = (elementId: string) => {
    const storedRef = layerDraggableRefsRef.current.get(elementId);
    if (storedRef) return storedRef;
    const draggableRef = draggable(elementId, {
      allowActionDrag: true,
      onClick: ({ event }) => layerActionDelegateRef.current.select(elementId, event.ctrlKey),
      onTopSwap: (result: LayerSwapResult) => layerActionDelegateRef.current.swap(result, "top"),
      onBottomSwap: (result: LayerSwapResult) => layerActionDelegateRef.current.swap(result, "bottom"),
    });
    layerDraggableRefsRef.current.set(elementId, draggableRef);
    return draggableRef;
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

  const updateElementName = (elementId: string, name: string) => {
    setElements((currentElements) => currentElements.map((element) =>
      element.id === elementId ? { ...element, name } : element,
    ));
  };

  const toggleElementVisibility = (elementId: string) => {
    const element = elements.find((item) => item.id === elementId);
    if (!element) return;
    if (element.visible) {
      responsesByElementRef.current.delete(elementId);
      delete frequencySmoothedRef.current[elementId];
      delete vocalSmoothedRef.current[elementId];
      setSelectedElementIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== elementId);
        setSelectedElementId(nextIds[nextIds.length - 1]);
        return nextIds;
      });
    }
    setElements((currentElements) => currentElements.map((item) =>
      item.id === elementId ? { ...item, visible: !item.visible } : item,
    ));
  };

  const startOpacityDrag = (event: PointerEvent<HTMLButtonElement>, element: ScenarioElementProps) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    opacityDragRef.current = { elementId: element.id, startY: event.clientY, startOpacity: element.opacity };
  };

  const updateOpacityDrag = (event: PointerEvent<HTMLButtonElement>) => {
    pendingOpacityYRef.current = event.clientY;
    if (opacityFrameRef.current !== undefined) return;
    opacityFrameRef.current = requestAnimationFrame(() => {
      opacityFrameRef.current = undefined;
      const drag = opacityDragRef.current;
      const clientY = pendingOpacityYRef.current;
      pendingOpacityYRef.current = undefined;
      if (!drag || clientY === undefined) return;
      const opacity = Math.max(0, Math.min(1, drag.startOpacity + (drag.startY - clientY) / 120));
      setElements((currentElements) => currentElements.map((element) =>
        element.id === drag.elementId ? { ...element, opacity } : element,
      ));
    });
  };

  const stopOpacityDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (opacityFrameRef.current !== undefined) cancelAnimationFrame(opacityFrameRef.current);
    opacityFrameRef.current = undefined;
    const drag = opacityDragRef.current;
    if (drag) {
      const opacity = Math.max(0, Math.min(1, drag.startOpacity + (drag.startY - event.clientY) / 120));
      setElements((currentElements) => currentElements.map((element) =>
        element.id === drag.elementId ? { ...element, opacity } : element,
      ));
    }
    pendingOpacityYRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    opacityDragRef.current = undefined;
  };
  layerUiDelegateRef.current = {
    rename: updateElementName,
    toggleVisibility: toggleElementVisibility,
    startOpacity: startOpacityDrag,
    updateOpacity: updateOpacityDrag,
    stopOpacity: stopOpacityDrag,
  };

  const centerSelectedElements = (axis: "horizontal" | "vertical" | "both") => {
    if (!scenario || selectedElementIds.length === 0) return;
    setElements((currentElements) => {
      const byId = new Map(currentElements.map((element) => [element.id, element]));
      const rootSelections = currentElements.filter((element) => {
        if (!selectedElementIdsSet.has(element.id)) return false;
        let parentId = element.rigParentId;
        while (parentId) {
          if (selectedElementIdsSet.has(parentId)) return false;
          parentId = byId.get(parentId)?.rigParentId;
        }
        return true;
      });
      return rootSelections.reduce((nextElements, selected) => {
        const current = nextElements.find((element) => element.id === selected.id);
        if (!current) return nextElements;
        const centered = {
          ...current,
          x: axis === "vertical" ? current.x : scenario.width / 2,
          y: axis === "horizontal" ? current.y : scenario.height / 2,
        };
        return transformRigDescendants(
          nextElements,
          current,
          centered,
          getRigDescendants(nextElements, current.id),
        );
      }, currentElements);
    });
  };

  const handleRigElementPointerDown = (
    event: globalThis.PointerEvent,
    elementId: string,
    point: { x: number; y: number },
  ) => {
    if (activeTool !== "rig" || event.button !== 0) return;
    const element = elements.find((item) => item.id === elementId);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    const response = responsesByElementRef.current.get(elementId) ?? defaultElementResponse;
    const anchor = getElementNormalizedPoint(point, element, response);
    if (!rigDraft) {
      setRigDraft({ parentId: elementId, parentAnchorX: anchor.x, parentAnchorY: anchor.y });
      selectElement(elementId);
      return;
    }
    if (rigDraft.parentId === elementId) {
      setAlert({ type: "warning", message: "O pai e o filho do rig precisam ser componentes diferentes." });
      return;
    }
    if (wouldCreateRigCycle(elements, rigDraft.parentId, elementId)) {
      setAlert({ type: "warning", message: "Esse vínculo criaria um ciclo no rig." });
      return;
    }
    setElements((currentElements) => currentElements.map((current) => current.id === elementId ? {
      ...current,
      rigParentId: rigDraft.parentId,
      rigParentAnchorX: rigDraft.parentAnchorX,
      rigParentAnchorY: rigDraft.parentAnchorY,
      rigChildAnchorX: anchor.x,
      rigChildAnchorY: anchor.y,
    } : current));
    selectElement(elementId);
    setRigDraft(undefined);
  };

  const startRigAnchorDrag = (
    event: globalThis.PointerEvent,
    childId: string,
    role: RigAnchorRole,
  ) => {
    if (activeTool !== "select" || event.button !== 0) return;
    const child = elements.find((element) => element.id === childId);
    if (!child?.rigParentId) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;
    rigAnchorDragRef.current = { pointerId: event.pointerId, childId, role };
    viewport.setPointerCapture(event.pointerId);
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

  const importOperationPreset = (preset: OperationPresetProps) => {
    if (preset.category !== "operation") return;
    const { id: _presetId, ...configuration } = preset.operation as ScenarioElementOperationProps;
    updateEditingOperation((operation) => ({ ...configuration, id: operation.id }));
    setIsPresetDropdownOpen(false);
    setIsWindowStemOpen(false);
    setIsWindowOperationOpen(false);
    setIsWindowTransitionOpen(false);
    setAlert({ type: "success", message: `Preset “${preset.name}” aplicado.` });
  };

  const importFrequencyPreset = (preset: OperationPresetProps) => {
    if (preset.category !== "frequency") return;
    setFrequencyDraft({ ...(preset.operation as FrequencyResponseProps) });
    setIsFrequencyPresetDropdownOpen(false);
    setIsFrequencyOperationOpen(false);
    setIsFrequencyTransitionOpen(false);
    setAlert({ type: "success", message: `Preset “${preset.name}” aplicado.` });
  };

  const importVocalPreset = (preset: OperationPresetProps) => {
    if (preset.category !== "vocal") return;
    setVocalResponseDraft({ ...(preset.operation as VocalResponseProps) });
    setIsVocalPresetDropdownOpen(false);
    setIsFrequencyOperationOpen(false);
    setIsFrequencyTransitionOpen(false);
    setAlert({ type: "success", message: `Preset “${preset.name}” aplicado.` });
  };

  const openPresetNameWindow = (category: OperationPresetCategory = "operation") => {
    const hasConfiguration = category === "operation"
      ? Boolean(editingOperation)
      : category === "frequency"
        ? Boolean(frequencyResponse)
        : Boolean(vocalResponse);
    if (!hasConfiguration) return;
    setPresetCategory(category);
    setPresetName("");
    setIsPresetDropdownOpen(false);
    setIsFrequencyPresetDropdownOpen(false);
    setIsVocalPresetDropdownOpen(false);
    setIsWindowStemOpen(false);
    setIsWindowOperationOpen(false);
    setIsWindowTransitionOpen(false);
    setIsPresetNameWindowVisible(true);
  };

  const saveOperationPreset = async () => {
    const name = presetName.trim();
    const configuration: OperationPresetConfiguration | undefined = presetCategory === "operation"
      ? editingOperation
      : presetCategory === "frequency"
        ? frequencyResponse
        : vocalResponse;
    if (!configuration || !name || isSavingPreset) {
      if (!name) setAlert({ type: "warning", message: "Digite um nome para o preset." });
      return;
    }
    setIsSavingPreset(true);
    try {
      await operationPresetService.save(name, presetCategory, configuration);
      setPresetsForCategory(presetCategory, await operationPresetService.list(presetCategory));
      setIsPresetNameWindowVisible(false);
      setPresetName("");
      setAlert({ type: "success", message: `Preset “${name}” salvo.` });
    } catch (error) {
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível salvar o preset.",
      });
    } finally {
      setIsSavingPreset(false);
    }
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
    setFrequencyView({ minHz: 0, maxHz: frequencyMaximumHz });
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
    setFrequencyView({ minHz: 0, maxHz: frequencyMaximumHz });
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
    field: ModulatorNumericField,
    value: string,
  ) => {
    if (value === "") {
      updateFrequencyResponse((config) => ({ ...config, [field]: undefined }));
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 && field !== "strength" && !isSignedOperationField(field)) return;
    if (field !== "strength" && isRepetitionField(field) && (!Number.isInteger(numericValue) || numericValue < 1)) return;
    updateFrequencyResponse((config) => ({
      ...config,
      [field]: field === "strength"
        ? Math.min(3, numericValue)
        : field === "wanderOpposition"
          ? Math.min(1, numericValue)
          : numericValue,
    }));
  };

  const setVocalResponseNumber = (
    field: ModulatorNumericField,
    value: string,
  ) => {
    if (value === "") return updateVocalResponse((config) => ({ ...config, [field]: undefined }));
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || (numericValue < 0 && field !== "strength" && !isSignedOperationField(field))) return;
    if (field !== "strength" && isRepetitionField(field) && (!Number.isInteger(numericValue) || numericValue < 1)) return;
    updateVocalResponse((config) => ({
      ...config,
      [field]: field === "strength"
        ? Math.min(3, numericValue)
        : field === "wanderOpposition"
          ? Math.min(1, numericValue)
          : numericValue,
    }));
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
    const dragMode = frequencyDragRef.current;
    const canvas = frequencyCanvasRef.current;
    if (!dragMode || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const viewSpan = frequencyView.maxHz - frequencyView.minHz;
    if (dragMode === "range") {
      const drag = frequencyRangeDragRef.current;
      if (!drag) return;
      const rangeWidth = drag.maxHz - drag.minHz;
      const deltaHz = ((event.clientX - drag.startClientX) / bounds.width) * viewSpan;
      const minHz = Math.max(0, Math.min(frequencyMaximumHz - rangeWidth, drag.minHz + deltaHz));
      updateFrequencyResponse((config) => ({ ...config, minHz, maxHz: minHz + rangeWidth }));
      return;
    }
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    updateFrequencyBoundary(dragMode, frequencyView.minHz + ratio * viewSpan);
  };

  const stopFrequencyHandleDrag = () => {
    frequencyDragRef.current = undefined;
    frequencyRangeDragRef.current = undefined;
  };

  const handleFrequencyRangePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!frequencyResponse || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    frequencyDragRef.current = "range";
    frequencyRangeDragRef.current = {
      startClientX: event.clientX,
      minHz: frequencyResponse.minHz,
      maxHz: frequencyResponse.maxHz,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFrequencySpectrumWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const cursorRatio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setFrequencyView((current) => {
      const currentSpan = current.maxHz - current.minHz;
      const minimumSpan = Math.min(100, frequencyMaximumHz);
      const nextSpan = Math.max(
        minimumSpan,
        Math.min(frequencyMaximumHz, currentSpan * Math.exp(event.deltaY * 0.0015)),
      );
      const anchorHz = current.minHz + cursorRatio * currentSpan;
      const minHz = Math.max(0, Math.min(frequencyMaximumHz - nextSpan, anchorHz - cursorRatio * nextSpan));
      return { minHz, maxHz: minHz + nextSpan };
    });
  };

  useEffect(() => {
    if (!isFrequencyWindowVisible || !frequencyResponse) return;
    let updateTimer: number | undefined;
    let canvasContext: CanvasRenderingContext2D | null = null;
    const update = () => {
      // A visualização não precisa acompanhar o tick de áudio a 60+ FPS. A
      // análise usada pelo cenário continua sendo atualizada no loop central;
      // aqui agendamos somente os 30 desenhos necessários, sem manter um RAF
      // de 60+ FPS apenas para descartar metade dos callbacks.
      const data = readFrequencySpectrum();
      if (data) {
        const maximumHz = data.sampleRate / 2;
        if (maximumHz !== frequencyMaximumRef.current) {
          const previousMaximum = frequencyMaximumRef.current;
          frequencyMaximumRef.current = maximumHz;
          setFrequencyMaximumHz(maximumHz);
          setFrequencyView((current) => {
            const wasShowingEverything = current.minHz === 0 && Math.abs(current.maxHz - previousMaximum) < 1;
            if (wasShowingEverything) return { minHz: 0, maxHz: maximumHz };
            const span = Math.min(maximumHz, current.maxHz - current.minHz);
            const minHz = Math.max(0, Math.min(maximumHz - span, current.minHz));
            return { minHz, maxHz: minHz + span };
          });
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
          const nyquist = data.sampleRate / 2;
          const firstBin = Math.max(0, Math.min(data.values.length - 1, Math.floor((frequencyView.minHz / nyquist) * data.values.length)));
          const lastBin = Math.max(firstBin + 1, Math.min(data.values.length, Math.ceil((frequencyView.maxHz / nyquist) * data.values.length)));
          const visibleBinCount = lastBin - firstBin;
          const barCount = Math.min(256, visibleBinCount);
          const binsPerBar = visibleBinCount / barCount;
          const barWidth = width / barCount;
          for (let index = 0; index < barCount; index += 1) {
            const start = firstBin + Math.floor(index * binsPerBar);
            const end = Math.min(lastBin, Math.max(start + 1, firstBin + Math.floor((index + 1) * binsPerBar)));
            let peak = 0;
            for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, data.values[bin]);
            const barHeight = (peak / 255) * height;
            context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth), barHeight);
          }
        }
      }
      // Enquanto pausado, uma checagem esparsa permite retomar o gráfico caso
      // o usuário dê play com a janela aberta.
      updateTimer = window.setTimeout(update, isAudioAnalysisPlaying() ? 1000 / 30 : 250);
    };
    update();
    return () => {
      if (updateTimer !== undefined) window.clearTimeout(updateTimer);
      canvasContext = null;
    };
  }, [isFrequencyWindowVisible, frequencyView.minHz, frequencyView.maxHz]);

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
        visible: true,
        opacity: 1,
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
            visible: true,
            opacity: 1,
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
    selectedElementIds.forEach((elementId) => {
      layerDraggableRefsRef.current.delete(elementId);
      responsesByElementRef.current.delete(elementId);
      delete frequencySmoothedRef.current[elementId];
      delete vocalSmoothedRef.current[elementId];
    });
    setElements((currentElements) =>
      currentElements
        .filter((element) => !selectedElementIdsSet.has(element.id))
        .map((element) => element.rigParentId && selectedElementIdsSet.has(element.rigParentId) ? {
          ...element,
          rigParentId: undefined,
          rigParentAnchorX: undefined,
          rigParentAnchorY: undefined,
          rigChildAnchorX: undefined,
          rigChildAnchorY: undefined,
        } : element),
    );
    setRigDraft((draft) => draft && selectedElementIdsSet.has(draft.parentId) ? undefined : draft);
    selectElement();
    setSmartGuides({});
  };

  const saveScenario = () => {
    if (!scenario) return;
    updateScenario({ ...scenario, elements });
  };

  const setEditingOperationNumber = (
    field: OperationNumericField,
    value: string,
  ) => {
    if (value === "") {
      updateEditingOperation((operation) => ({ ...operation, [field]: undefined }));
      return;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || (numberValue < 0 && !isSignedOperationField(field))) return;
    if (isRepetitionField(field) && (!Number.isInteger(numberValue) || numberValue < 1)) return;
    updateEditingOperation((operation) => ({
      ...operation,
      [field]: field === "wanderOpposition" ? Math.min(1, numberValue) : numberValue,
    }));
  };

  const syncStemResponseWithPlayer = (currentTime: number) => {
    // Só consulta o analyser quando existe ao menos um modulador de faixa
    // utilizável. Isso mantém o playback normal livre de trabalho de FFT.
    const hasFrequencyModulator = Boolean(
      selectedTimeline && responseElements.some((element) => element.frequencyResponse?.operation),
    );
    const spectrum = hasFrequencyModulator ? readFrequencySpectrum() : undefined;
    const hasVocalModulator = Boolean(selectedTimeline?.vocalPath && responseElements.some((element) => element.vocalResponse?.operation));
    const vocalIntensity = hasVocalModulator ? readVocalIntensity() : 0;
    const frequencyBandIntensities = frequencyBandIntensitiesRef.current;
    frequencyBandIntensities.clear();
    const previousTime = frequencyLastTimeRef.current;
    const elapsedSinceLastFrame = previousTime === undefined || currentTime < previousTime
      ? 0
      : currentTime - previousTime;
    frequencyLastTimeRef.current = currentTime;
    if (timelineEventIndexRef.current.events !== selectedTimeline?.events) {
      const byStem = new Map<number, Array<{ timeSeconds: number }>>();
      selectedTimeline?.events.forEach((event) => {
        if (!event.stemId) return;
        const events = byStem.get(event.stemId) ?? [];
        events.push(event);
        byStem.set(event.stemId, events);
      });
      byStem.forEach((events) => events.sort((first, second) => first.timeSeconds - second.timeSeconds));
      timelineEventIndexRef.current = { events: selectedTimeline?.events, byStem };
    }
    const latestEventsByStem = latestEventsByStemRef.current;
    latestEventsByStem.clear();
    const getLatestEvent = (stemId?: number) => {
      if (!stemId) return undefined;
      if (latestEventsByStem.has(stemId)) return latestEventsByStem.get(stemId);
      const events = timelineEventIndexRef.current.byStem.get(stemId);
      if (!events?.length) {
        latestEventsByStem.set(stemId, undefined);
        return undefined;
      }
      let low = 0;
      let high = events.length - 1;
      let match: { timeSeconds: number } | undefined;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (events[middle].timeSeconds <= currentTime) {
          match = events[middle];
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      latestEventsByStem.set(stemId, match);
      return match;
    };
    const rawResponses =
      responseElements.map((element) => {
        const response = element.operations.reduce(
          (currentResponse, operation) => {
            if (!operation.operation) return currentResponse;
            if (["scale", "width", "height", "rotation"].includes(operation.operation) && operation.value === undefined) return currentResponse;
            const event = getLatestEvent(operation.stemId);
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
            return applyResponseOperation(
              currentResponse,
              operation,
              intensity,
              progress,
              `${element.id}:${operation.id}:${event?.timeSeconds ?? 0}`,
              element.opacity,
            );
          },
          { ...defaultElementResponse },
        );
        const frequency = element.frequencyResponse;
        const frequencyOperation = frequency?.operation;
        let frequencyForce = 0;
        if (spectrum && selectedTimeline && frequency && frequencyOperation) {
          const bandKey = `${frequency.minHz}:${frequency.maxHz}`;
          let bandIntensity = frequencyBandIntensities.get(bandKey);
          if (bandIntensity === undefined) {
            bandIntensity = getFrequencyBandIntensityFromSpectrum(spectrum, frequency.minHz, frequency.maxHz);
            frequencyBandIntensities.set(bandKey, bandIntensity);
          }
          const rawForce = Math.min(1, bandIntensity * (frequency.strength ?? 1));
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
          ? applyResponseOperation(response, frequency, frequencyForce, currentTime, `${element.id}:frequency`, element.opacity)
          : response;
        const vocal = element.vocalResponse;
        const rawVocalForce = vocal?.operation ? Math.min(1, vocalIntensity * (vocal.strength ?? 1)) : 0;
        const previousVocalForce = vocalSmoothedRef.current[element.id] ?? 0;
        const vocalDuration = rawVocalForce >= previousVocalForce ? vocal?.attackSeconds ?? 0 : vocal?.releaseSeconds ?? 0;
        const vocalSmoothing = vocalDuration > 0 ? Math.min(1, elapsedSinceLastFrame / vocalDuration) : 1;
        const vocalForce = previousVocalForce + (rawVocalForce - previousVocalForce) * vocalSmoothing;
        if (vocal) vocalSmoothedRef.current[element.id] = vocalForce;
        const responseWithVocal = vocalForce > 0 && vocal
          ? applyResponseOperation(finalResponse, vocal, applyStemResponseTransition(vocalForce, vocal.transition), currentTime, `${element.id}:vocal`, element.opacity)
          : finalResponse;
        return { id: element.id, ...responseWithVocal };
      });
    const rawResponsesById = new Map(rawResponses.map(({ id, ...response }) => [id, response]));
    const composedResponses = composeRigResponses(elements, rawResponsesById, rigResponsiveElementIds);
    const nextResponses = responseElements.map((element) => ({
      id: element.id,
      ...(composedResponses.get(element.id) ?? rawResponsesById.get(element.id) ?? defaultElementResponse),
    }));
    const previousResponses = responseValuesRef.current;
    const responsesAreEqual = previousResponses.length === nextResponses.length && nextResponses.every((response, index) => {
      const previous = previousResponses[index];
      return previous?.id === response.id
        && previous.scale === response.scale
        && previous.widthScale === response.widthScale
        && previous.heightScale === response.heightScale
        && previous.opacity === response.opacity
        && previous.rotation === response.rotation
        && previous.translationX === response.translationX
        && previous.translationY === response.translationY
        && previous.translationZ === response.translationZ;
    });
    if (responsesAreEqual) return;
    responseValuesRef.current = nextResponses;
    const responsesByElement = responsesByElementRef.current;
    responsesByElement.clear();
    nextResponses.forEach(({ id, ...response }) => {
      responsesByElement.set(id, response);
    });
    pixiRendererRef.current?.render();
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
  ) => worldPointToElementCenterLocal(point, transform);

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
      if (pointerMoveFrameRef.current !== undefined) cancelAnimationFrame(pointerMoveFrameRef.current);
      if (opacityFrameRef.current !== undefined) cancelAnimationFrame(opacityFrameRef.current);
      pointerMoveFrameRef.current = undefined;
      pendingPointerMoveRef.current = undefined;
      opacityFrameRef.current = undefined;
      pendingOpacityYRef.current = undefined;
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
    responseValuesRef.current = [];
    responsesByElementRef.current.clear();
    layerDraggableRefsRef.current.clear();
  }, [scenario?.id]);

  useEffect(() => {
    if (!scenario?.elements.length) return;
    const detailsKey = JSON.stringify(scenario.elements.map((element) => ({
      id: element.id,
      operations: element.operations,
      frequencyResponse: element.frequencyResponse,
      vocalResponse: element.vocalResponse,
    })));
    if (hydratedElementDetailsRef.current === detailsKey) return;
    hydratedElementDetailsRef.current = detailsKey;

    // A query detalhada pode chegar depois do cenário base. Complete apenas
    // dados persistidos que ainda não existem no estado de edição local, para
    // que operações recém-carregadas apareçam sem descartar mudanças do usuário.
    const persistedById = new Map(scenario.elements.map((element) => {
      const normalized = recoverLegacyOperation(element);
      return [normalized.id, normalized];
    }));
    setElements((currentElements) => currentElements.map((element) => {
      const persisted = persistedById.get(element.id);
      if (!persisted) return element;
      const localOperationIds = new Set(element.operations.map((operation) => operation.id));
      const missingOperations = persisted.operations.filter((operation) => !localOperationIds.has(operation.id));
      const operations = missingOperations.length > 0
        ? [...element.operations, ...missingOperations.map((operation) => ({ ...operation }))]
        : element.operations;
      const frequencyResponse = element.frequencyResponse ?? persisted.frequencyResponse;
      const vocalResponse = element.vocalResponse ?? persisted.vocalResponse;
      if (
        operations === element.operations
        && frequencyResponse === element.frequencyResponse
        && vocalResponse === element.vocalResponse
      ) return element;
      return { ...element, operations, frequencyResponse, vocalResponse };
    }));
  }, [scenario?.elements]);

  useEffect(() => {
    setIsFrequencyWindowVisible(false);
    setFrequencyDraft(undefined);
    setIsVocalResponseWindowVisible(false);
    setVocalResponseDraft(undefined);
    frequencyDragRef.current = undefined;
    frequencyRangeDragRef.current = undefined;
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
    if (activeTool === "rig" && event.button === 0) {
      setRigDraft(undefined);
      selectElement();
      return;
    }
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

  const processPointerMove = (event: ScenarioPointerMove) => {
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
          if (!element.visible) return false;
          const bounds = getElementGeometry(element);
          return bounds.left >= left && bounds.right <= right && bounds.top >= top && bounds.bottom <= bottom;
        })
        .map((element) => element.id);
      setSelectedElementIds(selectedIds);
      setSelectedElementId(selectedIds[0]);
      return;
    }
    const rigAnchorDrag = rigAnchorDragRef.current;
    if (rigAnchorDrag?.pointerId === event.pointerId) {
      const point = getScenarioPoint(event.clientX, event.clientY);
      if (!point) return;
      const child = elements.find((element) => element.id === rigAnchorDrag.childId);
      const targetId = rigAnchorDrag.role === "parent" ? child?.rigParentId : child?.id;
      const target = targetId ? elements.find((element) => element.id === targetId) : undefined;
      if (!child || !target) return;
      const response = responsesByElementRef.current.get(target.id) ?? defaultElementResponse;
      const anchor = getElementNormalizedPoint(point, target, response);
      setElements((currentElements) => currentElements.map((element) => {
        if (element.id !== rigAnchorDrag.childId) return element;
        return rigAnchorDrag.role === "parent"
          ? { ...element, rigParentAnchorX: anchor.x, rigParentAnchorY: anchor.y }
          : { ...element, rigChildAnchorX: anchor.x, rigChildAnchorY: anchor.y };
      }));
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
          const tolerance = 8 / view.zoom;
          let xMatch: { value: number; offset: number; distance: number } | undefined;
          let yMatch: { value: number; offset: number; distance: number } | undefined;
          for (const target of activeElementDrag.guideTargets) {
            const bounds = target.bounds;
            const xCandidates = [
              { value: bounds.left, offset: movingBounds.left - position.x },
              { value: bounds.right, offset: movingBounds.right - position.x },
              { value: bounds.centerX, offset: movingBounds.centerX - position.x },
            ];
            for (const candidate of xCandidates) {
              const distance = Math.abs((position.x + candidate.offset) - candidate.value);
              if (!xMatch || distance < xMatch.distance) xMatch = { ...candidate, distance };
            }
            const yCandidates = [
              { value: bounds.top, offset: movingBounds.top - position.y },
              { value: bounds.bottom, offset: movingBounds.bottom - position.y },
              { value: bounds.centerY, offset: movingBounds.centerY - position.y },
            ];
            for (const candidate of yCandidates) {
              const distance = Math.abs((position.y + candidate.offset) - candidate.value);
              if (!yMatch || distance < yMatch.distance) yMatch = { ...candidate, distance };
            }
          }
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
        const nextTransform = { ...startTransform, ...position };
        setElements((currentElements) => transformRigDescendants(
          currentElements,
          startTransform,
          nextTransform,
          activeElementDrag.rigDescendantStarts,
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
        const canSnapWidth = handle.includes("east") || handle.includes("west");
        const canSnapHeight = handle.includes("north") || handle.includes("south");
        let closestMatch: { axis: "width" | "height"; value: number; distance: number } | undefined;
        if (smartGuidesEnabled && !activeElementDrag.isAspectUnlocked) {
          for (const target of activeElementDrag.guideTargets) {
            const bounds = target.bounds;
            if (canSnapWidth) {
              const distance = Math.abs(width - bounds.width);
              if (!closestMatch || distance < closestMatch.distance) {
                closestMatch = { axis: "width", value: bounds.width, distance };
              }
            }
            if (canSnapHeight) {
              const distance = Math.abs(height - bounds.height);
              if (!closestMatch || distance < closestMatch.distance) {
                closestMatch = { axis: "height", value: bounds.height, distance };
              }
            }
          }
        }
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
        const nextTransform = {
          ...startTransform,
          ...position,
          scaleX: width / circleBaseSize,
          scaleY: height / circleBaseSize,
        };
        setElements((currentElements) => transformRigDescendants(
          currentElements,
          startTransform,
          nextTransform,
          activeElementDrag.rigDescendantStarts,
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
        const nextTransform = { ...startTransform, ...nextCenter, rotation: nextRotation };
        setElements((currentElements) => transformRigDescendants(
          currentElements,
          startTransform,
          nextTransform,
          activeElementDrag.rigDescendantStarts,
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

  const flushPointerMove = () => {
    if (pointerMoveFrameRef.current !== undefined) {
      cancelAnimationFrame(pointerMoveFrameRef.current);
      pointerMoveFrameRef.current = undefined;
    }
    const pendingMove = pendingPointerMoveRef.current;
    pendingPointerMoveRef.current = undefined;
    if (pendingMove) processPointerMove(pendingMove);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    pendingPointerMoveRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
    };
    if (pointerMoveFrameRef.current !== undefined) return;
    pointerMoveFrameRef.current = requestAnimationFrame(() => {
      pointerMoveFrameRef.current = undefined;
      const pendingMove = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = undefined;
      if (pendingMove) processPointerMove(pendingMove);
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (pendingPointerMoveRef.current?.pointerId === event.pointerId) flushPointerMove();
    if (rigAnchorDragRef.current?.pointerId === event.pointerId) {
      rigAnchorDragRef.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
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
    event: TransformPointerEvent,
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
      guideTargets: elements
        .filter((item) => item.id !== transformElement.id && item.visible)
        .map((item) => ({ id: item.id, bounds: getElementGeometry(item) })),
      rigDescendantStarts: getRigDescendants(elements, transformElement.id),
    };
    selectElement(transformElement.id);
    viewport.setPointerCapture(event.pointerId);
  };
  const startPixiElementTransform = (event: globalThis.PointerEvent, elementId: string) => {
    const element = elements.find((item) => item.id === elementId);
    if (element) startElementTransform(event, "move", element);
  };
  const startPixiTransform = (
    event: globalThis.PointerEvent,
    mode: PixiTransformMode,
    elementId: string,
  ) => {
    const element = elements.find((item) => item.id === elementId);
    if (element) startElementTransform(event, mode, element);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "h") {
        setRigDraft(undefined);
        setActiveTool("hand");
        event.preventDefault();
      } else if (key === "v") {
        setRigDraft(undefined);
        setActiveTool("select");
        event.preventDefault();
      } else if (key === "r") {
        setRigDraft(undefined);
        setActiveTool("rig");
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
            <SE.PresetToolbar>
              <Dropdown
                title="Importar preset"
                width="100%"
                isOpen={isVocalPresetDropdownOpen}
                onClick={() => {
                  setIsVocalPresetDropdownOpen((open) => !open);
                  setIsFrequencyOperationOpen(false);
                  setIsFrequencyTransitionOpen(false);
                }}
              >
                {vocalPresets.length > 0 ? vocalPresets.map((preset) => (
                  <DropdownOption key={preset.name} type="button" onClick={() => importVocalPreset(preset)}>{preset.name}</DropdownOption>
                )) : <DropdownOption type="button" disabled>Nenhum preset vocal salvo</DropdownOption>}
              </Dropdown>
              <SE.PresetExportButton type="button" onClick={() => openPresetNameWindow("vocal")}>Exportar</SE.PresetExportButton>
            </SE.PresetToolbar>
            <SE.FrequencyForm>
              <Dropdown title={`Operação: ${vocalResponse.operation ? stemResponseOperationLabels[vocalResponse.operation] : "Nenhuma"}`} width="100%" isOpen={isFrequencyOperationOpen} onClick={() => { setIsFrequencyOperationOpen((open) => !open); setIsFrequencyTransitionOpen(false); }}>
                {([undefined, "scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"] as const).map((operation) => <DropdownOption key={operation ?? "none"} onClick={() => { updateVocalResponse((config) => ({ ...config, operation })); setIsFrequencyOperationOpen(false); }}>{operation ? stemResponseOperationLabels[operation] : "Nenhuma"}</DropdownOption>)}
              </Dropdown>
              <Dropdown title={`Transição: ${vocalResponse.transition ? stemResponseTransitionLabels[vocalResponse.transition] : "Linear"}`} width="100%" isOpen={isFrequencyTransitionOpen} onClick={() => { setIsFrequencyTransitionOpen((open) => !open); setIsFrequencyOperationOpen(false); }}>
                {(["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const).map((transition) => <DropdownOption key={transition} onClick={() => { updateVocalResponse((config) => ({ ...config, transition })); setIsFrequencyTransitionOpen(false); }}>{stemResponseTransitionLabels[transition]}</DropdownOption>)}
              </Dropdown>
              {vocalResponse.operation === "random" ? (
                <RandomOperationInputs operation={vocalResponse} onChange={setVocalResponseNumber} />
              ) : vocalResponse.operation === "wander" ? (
                <WanderOperationInputs operation={vocalResponse} onChange={setVocalResponseNumber} />
              ) : vocalResponse.operation === "translation" || vocalResponse.operation === "wiggle" ? <>
                <TitledInput title="X" type="number" value={vocalResponse.translationX ?? ""} onChange={(event) => setVocalResponseNumber("translationX", event.currentTarget.value)} />
                <TitledInput title="Y" type="number" value={vocalResponse.translationY ?? ""} onChange={(event) => setVocalResponseNumber("translationY", event.currentTarget.value)} />
                <TitledInput title="Z" type="number" value={vocalResponse.translationZ ?? ""} onChange={(event) => setVocalResponseNumber("translationZ", event.currentTarget.value)} />
                {vocalResponse.operation === "wiggle" && <TitledInput title="Repetições" type="number" min="1" step="1" value={vocalResponse.repetitions ?? 1} onChange={(event) => setVocalResponseNumber("repetitions", event.currentTarget.value)} />}
              </> : <TitledInput title="Valor" type="number" value={vocalResponse.value ?? ""} onChange={(event) => setVocalResponseNumber("value", event.currentTarget.value)} />}
              <TitledInput title="Força" type="number" min="0" max="3" step="0.01" value={vocalResponse.strength ?? 1} onChange={(event) => setVocalResponseNumber("strength", event.currentTarget.value)} />
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
          frequencyRangeDragRef.current = undefined;
        }}
        title="Modulador de frequência"
        height="420px"
        width="420px"
      >
        {frequencyResponse && (
          <SE.FrequencyWindowBody>
            <SE.PresetToolbar>
              <Dropdown
                title="Importar preset"
                width="100%"
                isOpen={isFrequencyPresetDropdownOpen}
                onClick={() => {
                  setIsFrequencyPresetDropdownOpen((open) => !open);
                  setIsFrequencyOperationOpen(false);
                  setIsFrequencyTransitionOpen(false);
                }}
              >
                {frequencyPresets.length > 0 ? frequencyPresets.map((preset) => (
                  <DropdownOption key={preset.name} type="button" onClick={() => importFrequencyPreset(preset)}>{preset.name}</DropdownOption>
                )) : <DropdownOption type="button" disabled>Nenhum preset de frequência salvo</DropdownOption>}
              </Dropdown>
              <SE.PresetExportButton type="button" onClick={() => openPresetNameWindow("frequency")}>Exportar</SE.PresetExportButton>
            </SE.PresetToolbar>
            <SE.FrequencyForm>
              <SE.FrequencySpectrum onWheel={handleFrequencySpectrumWheel} title="Use a roda do mouse para ampliar a frequência sob o cursor">
              <canvas ref={frequencyCanvasRef} />
              <SE.FrequencyRange
                style={{
                  left: `${frequencyRangeLeftPercent}%`,
                  width: `${Math.max(0, frequencyRangeRightPercent - frequencyRangeLeftPercent)}%`,
                }}
                onPointerDown={handleFrequencyRangePointerDown}
                onPointerMove={handleFrequencyHandlePointerMove}
                onPointerUp={stopFrequencyHandleDrag}
                onPointerCancel={stopFrequencyHandleDrag}
                title="Arraste para mover a faixa selecionada"
              />
              <SE.FrequencyHandle
                style={{ left: `${frequencyPositionPercent(frequencyResponse.minHz)}%` }}
                onPointerDown={(event) => handleFrequencyHandlePointerDown(event, "minHz")}
                onPointerMove={handleFrequencyHandlePointerMove}
                onPointerUp={stopFrequencyHandleDrag}
                onPointerCancel={stopFrequencyHandleDrag}
                aria-label="Frequência inicial"
              />
              <SE.FrequencyHandle
                style={{ left: `${frequencyPositionPercent(frequencyResponse.maxHz)}%` }}
                onPointerDown={(event) => handleFrequencyHandlePointerDown(event, "maxHz")}
                onPointerMove={handleFrequencyHandlePointerMove}
                onPointerUp={stopFrequencyHandleDrag}
                onPointerCancel={stopFrequencyHandleDrag}
                aria-label="Frequência final"
              />
              </SE.FrequencySpectrum>
              <SE.FrequencyLabels>
              <span>Início: {Math.round(frequencyResponse.minHz)} Hz</span>
              <span>Visão: {Math.round(frequencyView.minHz)}–{Math.round(frequencyView.maxHz)} Hz</span>
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
              {([undefined, "scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"] as const).map((operation) => (
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
              {frequencyResponse.operation === "random" ? (
                <RandomOperationInputs operation={frequencyResponse} onChange={setFrequencyResponseNumber} />
              ) : frequencyResponse.operation === "wander" ? (
                <WanderOperationInputs operation={frequencyResponse} onChange={setFrequencyResponseNumber} />
              ) : frequencyResponse.operation === "translation" || frequencyResponse.operation === "wiggle" ? (
              <>
                <TitledInput title="X" type="number" value={frequencyResponse.translationX ?? ""} onChange={(event) => setFrequencyResponseNumber("translationX", event.currentTarget.value)} />
                <TitledInput title="Y" type="number" value={frequencyResponse.translationY ?? ""} onChange={(event) => setFrequencyResponseNumber("translationY", event.currentTarget.value)} />
                <TitledInput title="Z" type="number" value={frequencyResponse.translationZ ?? ""} onChange={(event) => setFrequencyResponseNumber("translationZ", event.currentTarget.value)} />
                {frequencyResponse.operation === "wiggle" && <TitledInput title="Repetições" type="number" min="1" step="1" value={frequencyResponse.repetitions ?? 1} onChange={(event) => setFrequencyResponseNumber("repetitions", event.currentTarget.value)} />}
              </>
              ) : (
              <TitledInput title="Valor" type="number" value={frequencyResponse.value ?? ""} onChange={(event) => setFrequencyResponseNumber("value", event.currentTarget.value)} />
              )}
              <TitledInput title="Força" type="number" min="0" max="3" step="0.01" value={frequencyResponse.strength ?? 1} onChange={(event) => setFrequencyResponseNumber("strength", event.currentTarget.value)} />
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
          setIsPresetDropdownOpen(false);
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
            <SE.PresetToolbar>
              <Dropdown
                title="Importar preset"
                width="100%"
                isOpen={isPresetDropdownOpen}
                onClick={() => {
                  setIsPresetDropdownOpen((open) => !open);
                  setIsWindowStemOpen(false);
                  setIsWindowOperationOpen(false);
                  setIsWindowTransitionOpen(false);
                }}
              >
                {operationPresets.length > 0 ? operationPresets.map((preset) => (
                  <DropdownOption key={preset.name} type="button" onClick={() => importOperationPreset(preset)}>
                    {preset.name}
                  </DropdownOption>
                )) : (
                  <DropdownOption type="button" disabled>Nenhum preset salvo</DropdownOption>
                )}
              </Dropdown>
              <SE.PresetExportButton type="button" onClick={() => openPresetNameWindow("operation")}>
                Exportar
              </SE.PresetExportButton>
            </SE.PresetToolbar>
            <SE.FrequencyForm>
            <Dropdown
              title={`Stem: ${availableStems.find((stem) => stem.id === editingOperation.stemId)?.name ?? "Nenhum"}`}
              width="100%"
              isOpen={isWindowStemOpen}
              onClick={() => {
                setIsWindowStemOpen((isOpen) => !isOpen);
                setIsPresetDropdownOpen(false);
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
                setIsPresetDropdownOpen(false);
                setIsWindowStemOpen(false);
                setIsWindowTransitionOpen(false);
              }}
            >
              {([undefined, "scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"] as const).map((operation) => (
                <DropdownOption key={operation ?? "none"} onClick={() => { updateEditingOperation((currentOperation) => ({ ...currentOperation, operation })); setIsWindowOperationOpen(false); }}>{operation ? stemResponseOperationLabels[operation] : "Nenhuma"}</DropdownOption>
              ))}
            </Dropdown>
            <Dropdown
              title={`Transição: ${editingOperation.transition ? stemResponseTransitionLabels[editingOperation.transition] : "Nenhuma"}`}
              width="100%"
              isOpen={isWindowTransitionOpen}
              onClick={() => {
                setIsWindowTransitionOpen((isOpen) => !isOpen);
                setIsPresetDropdownOpen(false);
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
            {editingOperation.operation === "random" ? (
              <RandomOperationInputs operation={editingOperation} onChange={setEditingOperationNumber} />
            ) : editingOperation.operation === "wander" ? (
              <WanderOperationInputs operation={editingOperation} onChange={setEditingOperationNumber} />
            ) : editingOperation.operation === "translation" || editingOperation.operation === "wiggle" ? (
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
            </SE.FrequencyForm>
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
      <Window
        isVisible={isPresetNameWindowVisible}
        onClose={() => {
          if (isSavingPreset) return;
          setIsPresetNameWindowVisible(false);
          setPresetName("");
        }}
        title="Salvar preset"
        height="160px"
        width="320px"
        disableClose={isSavingPreset}
      >
        <SE.PresetNameBody>
          <TitledInput
            title="Nome do preset"
            value={presetName}
            autoFocus
            maxLength={80}
            onChange={(event) => setPresetName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveOperationPreset();
            }}
          />
          <SE.OperationActions>
            <SE.OperationSaveButton type="button" disabled={isSavingPreset} onClick={() => void saveOperationPreset()}>
              {isSavingPreset ? "Salvando..." : "Salvar"}
            </SE.OperationSaveButton>
            <SE.OperationDeleteButton type="button" disabled={isSavingPreset} onClick={() => {
              setIsPresetNameWindowVisible(false);
              setPresetName("");
            }}>
              Cancelar
            </SE.OperationDeleteButton>
          </SE.OperationActions>
        </SE.PresetNameBody>
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
              <PixiScenarioRenderer
                ref={pixiRendererRef}
                width={scenario.width}
                height={scenario.height}
                backgroundColor={scenario.backgroundColor}
                elements={elements}
                responsesRef={responsesByElementRef}
                onElementPointerDown={startPixiElementTransform}
                onTransformPointerDown={startPixiTransform}
                onRigElementPointerDown={handleRigElementPointerDown}
                onRigAnchorPointerDown={startRigAnchorDrag}
                isSelectionToolActive={activeTool === "select"}
                isRigToolActive={activeTool === "rig"}
                selectedElementIds={selectedElementIds}
                selectedElementId={selectedElementId}
                smartGuides={smartGuides}
                marqueeSelection={marqueeSelection}
                zoom={view.zoom}
                view={view}
              />
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
              onClick={() => { setRigDraft(undefined); setActiveTool("select"); }}
            >
              {Icons.selectIcon}
            </SE.ToolButton>
            <SE.ToolButton
              type="button"
              data-tool="hand"
              aria-label="Mover visualização"
              aria-pressed={activeTool === "hand"}
              $active={activeTool === "hand"}
              onClick={() => { setRigDraft(undefined); setActiveTool("hand"); }}
            >
              {Icons.handIcon}
            </SE.ToolButton>
            <SE.ToolButton
              type="button"
              data-tool="rig"
              aria-label={rigDraft ? "Selecione o componente filho do rig" : "Criar vínculo de rig (R)"}
              title={rigDraft ? "Agora clique no filho" : "Rig: pai → filho (R)"}
              aria-pressed={activeTool === "rig"}
              $active={activeTool === "rig"}
              onClick={() => { setRigDraft(undefined); setActiveTool("rig"); }}
            >
              {Icons.rigIcon}
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
                <ScenarioLayerRowView
                  key={element.id}
                  element={element}
                  selected={selectedElementIdsSet.has(element.id)}
                  dragging={isLocalDragging(element.id)}
                  draggableRef={getLayerDraggableRef(element.id)}
                  actions={stableLayerUiActions}
                />
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
