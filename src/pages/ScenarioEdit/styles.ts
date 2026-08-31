import styled from "styled-components";
import { DftScroll, HeaderBlueprint } from "../../components/DefaultComponents/styles";

type TransformHandlePosition =
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west";

export const Body = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const Header = styled(HeaderBlueprint)``;

export const HeaderButton = styled.button`
  height: 30px;
  width: 60px;
  border: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
  background-color: var(--black-200);
  color: var(--white);

  svg {
    height: 24px;
    width: 24px;
  }

  &:hover {
    background-color: var(--black-400);
  }
`;

export const HeaderActions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
`;

export const HeaderSaveButton = styled.button`
  height: 30px;
  border: 0;
  border-radius: 4px;
  padding: 0 12px;
  background-color: var(--blue-100);
  color: var(--white);
  font: inherit;
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: var(--blue-200);
  }

  &:disabled {
    cursor: not-allowed;
    background-color: var(--black-400);
  }
`;

export const Container = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  gap: 4px;
  padding: 10px;
  box-sizing: border-box;
`;

export const LeftPanel = styled.div`
  width: 160px;
  min-width: 160px;
  border-radius: 4px;
  background-color: var(--black-300);
  padding: 8px;
  box-sizing: border-box;
`;

export const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const TimelineButton = styled.button<{ $isSelected: boolean }>`
  width: 100%;
  min-height: 32px;
  border: 0;
  border-radius: 4px;
  padding: 0 8px;
  overflow: hidden;
  background-color: ${({ $isSelected }) =>
    $isSelected ? "var(--blue-200)" : "var(--black-200)"};
  color: var(--white);
  font: inherit;
  font-size: 11px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background-color: ${({ $isSelected }) =>
      $isSelected ? "var(--blue-300)" : "var(--black-400)"};
  }
`;

export const ToolButton = styled.button<{ $active: boolean }>`
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ $active }) => ($active ? "var(--blue-100)" : "var(--black-400)")};
  color: var(--white);
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background-color: ${({ $active }) => ($active ? "var(--blue-200)" : "var(--black-400)")};
  }
`;

export const CenterPanel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const CenterTop = styled.div<{ $isHandActive: boolean }>`
  flex: 1;
  min-width: 0;
  min-height: 0;
  border-radius: 4px;
  background-color: var(--black-300);
  position: relative;
  overflow: hidden;
  cursor: ${({ $isHandActive }) => ($isHandActive ? "grab" : "default")};

  &:active {
    cursor: ${({ $isHandActive }) => ($isHandActive ? "grabbing" : "default")};
  }
`;

export const ZoomControl = styled.div`
  position: absolute;
  bottom: 4px;
  left: 4px;
  z-index: 10;

  .half {
    font-size: 10px;
  }

  > div {
    height: 26px;
    padding: 0 4px;
    background-color: var(--black-200);
    font-size: 10px;
  }

  > div > div:first-child {
    padding-right: 10px;
    font-size: 10px;
  }

  > div > div:last-child svg {
    width: 13px;
    height: 13px;
  }
`;

export const ScenarioToolsHeader = styled.div`
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 10;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 4px;
  background-color: var(--black-200);
`;

export const ScenarioToolButton = styled.button`
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--black-300);
  color: var(--white);
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover:not(:disabled) {
    background-color: var(--black-400);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

export const CenterPlayer = styled.div`
  height: 70px;
  min-height: 70px;
  min-width: 0;
  overflow: hidden;
  border-radius: 4px;
  background-color: var(--black-300);
`;

export const ScenarioCanvas = styled.div<{ $x: number; $y: number; $zoom: number }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform: translate3d(${({ $x }) => $x}px, ${({ $y }) => $y}px, 0)
    scale(${({ $zoom }) => $zoom});
  transform-origin: top left;
  will-change: transform;
`;

export const ScenarioSurface = styled.div<{
  $width: number;
  $height: number;
  $backgroundColor: string;
}>`
  width: ${({ $width }) => $width}px;
  min-width: ${({ $width }) => $width}px;
  height: ${({ $height }) => $height}px;
  min-height: ${({ $height }) => $height}px;
  background-color: ${({ $backgroundColor }) => $backgroundColor};
  position: relative;
  box-sizing: border-box;
  border: 1px solid var(--white);
  border-radius: 4px;
`;

export const ScenarioVisualLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  border-radius: inherit;
`;

export const ScenarioControlsLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
`;

export const ScenarioElement = styled.div<{
  $pivotWorldX: number;
  $pivotWorldY: number;
  $pivotLocalX: number;
  $pivotLocalY: number;
  $responseTranslateX: number;
  $responseTranslateY: number;
  $responseTranslateZ: number;
  $scaleX: number;
  $scaleY: number;
  $responseScale: number;
  $rotation: number;
  $responseRotation: number;
  $isSelected: boolean;
  $layerZIndex: number;
}>`
  position: absolute;
  left: 0;
  top: 0;
  width: ${({ $scaleX, $responseScale }) => 40 * $scaleX * $responseScale}px;
  height: ${({ $scaleY, $responseScale }) => 40 * $scaleY * $responseScale}px;
  border: 0;
  border-radius: 50%;
  box-sizing: border-box;
  transform: translate3d(${({ $pivotWorldX, $responseTranslateX }) => $pivotWorldX + $responseTranslateX}px, ${({ $pivotWorldY, $responseTranslateY }) => $pivotWorldY + $responseTranslateY}px, ${({ $responseTranslateZ }) => $responseTranslateZ}px)
    rotate(${({ $rotation, $responseRotation }) => $rotation + $responseRotation}deg)
    translate3d(${({ $pivotLocalX }) => -$pivotLocalX}px, ${({ $pivotLocalY }) => -$pivotLocalY}px, 0);
  transform-origin: top left;
  z-index: ${({ $layerZIndex }) => $layerZIndex};
  cursor: pointer;
`;

export const ScenarioElementControl = styled(ScenarioElement)`
  pointer-events: none;
  cursor: default;
`;

export const ScenarioElementCircle = styled.div<{ $color: string }>`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: ${({ $color }) => $color};

  &::after {
    content: "";
    position: absolute;
    top: 10%;
    left: 50%;
    width: 10%;
    height: 10%;
    border-radius: 50%;
    background-color: var(--white);
    transform: translateX(-50%);
  }
`;

export const ScenarioElementImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
  pointer-events: none;
`;

export const TransformBox = styled.div<{ $zoom: number }>`
  position: absolute;
  inset: ${({ $zoom }) => -10 / $zoom}px;
  box-sizing: border-box;
  border: ${({ $zoom }) => 1 / $zoom}px dashed var(--white);
  // A caixa não deve bloquear o hit-test do elemento que estiver visualmente
  // acima dela. Apenas handles e pivô (filhos com pointer-events próprios)
  // precisam capturar o ponteiro.
  pointer-events: none;
`;

export const SelectedElementOutline = styled.div<{ $zoom: number }>`
  position: absolute;
  inset: ${({ $zoom }) => -10 / $zoom}px;
  box-sizing: border-box;
  border: ${({ $zoom }) => 1 / $zoom}px dashed var(--blue-100);
  pointer-events: none;
`;

export const ScenarioSmartGuide = styled.div<{
  $axis: "width" | "height";
  $position: number;
  $width: number;
  $height: number;
}>`
  position: absolute;
  z-index: 5;
  pointer-events: none;
  background-color: var(--blue-100);
  ${({ $axis, $position, $width, $height }) => $axis === "height"
    ? `left: 0; top: ${$position}px; width: ${$width}px; height: 1px;`
    : `left: ${$position}px; top: 0; width: 1px; height: ${$height}px;`}
`;

export const ScenarioSelectionBox = styled.div<{
  $left: number;
  $top: number;
  $width: number;
  $height: number;
}>`
  position: absolute;
  z-index: 6;
  left: ${({ $left }) => $left}px;
  top: ${({ $top }) => $top}px;
  width: ${({ $width }) => $width}px;
  height: ${({ $height }) => $height}px;
  box-sizing: border-box;
  border: 1px solid var(--blue-100);
  border-radius: 4px;
  background-color: rgb(0 168 255 / 15%);
  pointer-events: none;
`;

export const PivotMarker = styled.button<{ $x: number; $y: number; $zoom: number }>`
  position: absolute;
  /* TransformBox extends 10px beyond the element on every side. Offset the
     percentage back to the element's real geometry so the visual pivot and
     its stored local coordinates remain identical. */
  left: ${({ $x, $zoom }) => `calc(${$x * 100}% + ${(10 - 20 * $x) / $zoom}px)`};
  top: ${({ $y, $zoom }) => `calc(${$y * 100}% + ${(10 - 20 * $y) / $zoom}px)`};
  width: ${({ $zoom }) => `${10 / $zoom}px`};
  height: ${({ $zoom }) => `${10 / $zoom}px`};
  transform: translate(-50%, -50%) rotate(45deg);
  border: 1px solid var(--white);
  border-radius: 1px;
  background-color: #a855f7;
  padding: 0;
  pointer-events: auto;
  cursor: move;
`;

export const TransformHandle = styled.button<{
  $type: "resize" | "rotate";
  $position: TransformHandlePosition;
  $zoom: number;
}>`
  position: absolute;
  z-index: 1;
  width: ${({ $type, $zoom }) => ($type === "resize" ? 8 : 10) / $zoom}px;
  height: ${({ $type, $zoom }) => ($type === "resize" ? 8 : 10) / $zoom}px;
  padding: 0;
  border: ${({ $zoom }) => 1 / $zoom}px solid var(--white);
  border-radius: ${({ $type }) => ($type === "resize" ? "1px" : "50%")};
  background-color: var(--blue-100);
  pointer-events: auto;
  cursor: ${({ $type, $position }) => {
    if ($type === "rotate") return "crosshair";
    if ($position === "north-west" || $position === "south-east") return "nwse-resize";
    if ($position === "north-east" || $position === "south-west") return "nesw-resize";
    if ($position === "north" || $position === "south") return "ns-resize";
    return "ew-resize";
  }};

  ${({ $type, $position, $zoom }) => {
    const externalOffset = -14 / $zoom;
    const positions = {
      "north-west": "top: 0; left: 0; transform: translate(-50%, -50%);",
      north: "top: 0; left: 50%; transform: translate(-50%, -50%);",
      "north-east": "top: 0; right: 0; transform: translate(50%, -50%);",
      east: "top: 50%; right: 0; transform: translate(50%, -50%);",
      "south-east": "right: 0; bottom: 0; transform: translate(50%, 50%);",
      south: "bottom: 0; left: 50%; transform: translate(-50%, 50%);",
      "south-west": "bottom: 0; left: 0; transform: translate(-50%, 50%);",
      west: "top: 50%; left: 0; transform: translate(-50%, -50%);",
    };
    if ($type === "resize") return positions[$position];

    const rotationPositions = {
      "north-west": `top: ${externalOffset}px; left: ${externalOffset}px; transform: translate(-50%, -50%);`,
      north: "",
      "north-east": `top: ${externalOffset}px; right: ${externalOffset}px; transform: translate(50%, -50%);`,
      east: "",
      "south-east": `right: ${externalOffset}px; bottom: ${externalOffset}px; transform: translate(50%, 50%);`,
      south: "",
      "south-west": `bottom: ${externalOffset}px; left: ${externalOffset}px; transform: translate(-50%, 50%);`,
      west: "",
    };
    return rotationPositions[$position];
  }}
`;

export const CenterBottom = styled.div`
  height: 100px;
  min-height: 100px;
  min-width: 0;
  border-radius: 4px;
  background-color: var(--black-300);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 4px;
  box-sizing: border-box;
  gap: 4px;
`;

export const RightPanel = styled.div`
  width: 260px;
  min-width: 260px;
  min-height: 0;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const RightTop = styled.div`
  flex: 1;
  min-height: 0;
  border-radius: 4px;
  background-color: var(--black-300);
  overflow: hidden;
`;

export const LayersPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
  overflow-y: auto;
`;

export const LayerItem = styled.button<{ $isSelected: boolean; $isDragging: boolean }>`
  width: 100%;
  min-height: 30px;
  flex-shrink: 0;
  border: 0;
  border-radius: 4px;
  padding: 0 8px;
  background-color: ${({ $isSelected }) => ($isSelected ? "var(--blue-200)" : "var(--black-200)")};
  color: var(--white);
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: grab;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.55 : 1)};

  &:active { cursor: grabbing; }
  &:hover { background-color: ${({ $isSelected }) => ($isSelected ? "var(--blue-300)" : "var(--black-400)")}; }
`;

export const RightBottom = styled.div`
  min-height: 0;
  border-radius: 4px;
  height: 174px;
  background-color: var(--black-300);
`;

export const StemBindingPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;

  > div:not(.stem-response-input) {
    background-color: var(--black-200);

    > div:first-child,
    button {
      font-size: 10px;
    }
  }

  .stem-response-input {
    background-color: transparent;

    > span {
      background-color: var(--black-300);
      font-size: 10px;
      border-radius: 4px;
    }

    input {
      background-color: var(--black-200);
      border-color: var(--black-400) !important;
      border-radius: 4px;
      font-size: 10px;
    }
  }
`;

export const OperationListHeader = styled.div<{ $accent?: string }>`
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--white);
  font-size: 12px;
  background-color: transparent !important;
  color: ${({ $accent }) => ($accent === "frequency" ? "var(--purple-100)" : "var(--white)")};
`;

export const OperationAddButton = styled.button`
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background-color: var(--black-100);
  color: var(--white);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  svg { width: 16px; height: 16px; }
`;

export const OperationItem = styled.button`
  width: 100%;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background-color: var(--black-200);
  color: var(--white);
  font: inherit;
  font-size: 10px;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
`;

export const FrequencyWindowBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  color: var(--white);
`;

export const FrequencyForm = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px;
  box-sizing: border-box;
  ${DftScroll}
`;

export const FrequencySpectrum = styled.div`
  position: relative;
  height: 60px;
  min-height: 60px;
  flex-shrink: 0;
  border: 1px solid var(--black-400);
  border-radius: 4px;
  overflow: hidden;
  background: var(--black-200);

  canvas { width: 100%; height: 100%; display: block; }
`;

export const FrequencyRange = styled.div`
  position: absolute;
  inset-block: 0;
  background: rgba(199, 125, 255, 0.22);
  border-inline: 1px solid var(--purple-100);
  pointer-events: none;
`;

export const FrequencyHandle = styled.button`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  padding: 0;
  border: 0;
  transform: translateX(-50%);
  background: var(--purple-100);
  cursor: ew-resize;
  touch-action: none;
`;

export const FrequencyLabels = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
`;

export const FrequencyOperationItem = styled(OperationItem)`
  color: var(--purple-100);
`;

export const OperationWindowBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 0 0;
  box-sizing: border-box;
  min-height: 100%;
  flex: 1;
`;

export const VocalExtractionStatus = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px;
  color: var(--white);
  box-sizing: border-box;

  span {
    font-size: 11px;
    line-height: 16px;
  }

  strong {
    color: var(--blue-100);
    font-size: 14px;
    line-height: 18px;
  }
`;

export const OperationActions = styled.div`
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  flex-shrink: 0;
`;

export const OperationSaveButton = styled.button`
  flex: 1;
  height: 30px;
  border: 0;
  border-radius: 4px;
  background-color: var(--blue-200);
  color: var(--white);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
`;

export const OperationDeleteButton = styled.button`
  flex: 1;
  height: 30px;
  border: 0;
  border-radius: 4px;
  background-color: var(--red-200);
  color: var(--white);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
`;
