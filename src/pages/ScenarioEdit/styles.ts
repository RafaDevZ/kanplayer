import styled from "styled-components";
import { HeaderBlueprint } from "../../components/DefaultComponents/styles";

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
  padding: 10px 0 0;
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

export const ScenarioElement = styled.div<{
  $x: number;
  $y: number;
  $scaleX: number;
  $scaleY: number;
  $responseScale: number;
  $rotation: number;
  $responseRotation: number;
  $isSelected: boolean;
}>`
  position: absolute;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  width: ${({ $scaleX, $responseScale }) => 40 * $scaleX * $responseScale}px;
  height: ${({ $scaleY, $responseScale }) => 40 * $scaleY * $responseScale}px;
  border: 0;
  border-radius: 50%;
  box-sizing: border-box;
  transform: translate3d(-50%, -50%, 0)
    rotate(${({ $rotation, $responseRotation }) => $rotation + $responseRotation}deg);
  transform-origin: center;
  cursor: pointer;
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

export const TransformBox = styled.div<{ $zoom: number }>`
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: ${({ $zoom }) => 1 / $zoom}px dashed var(--white);
  pointer-events: none;
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

export const LayerItem = styled.button<{ $isSelected: boolean }>`
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

  &:active { cursor: grabbing; }
  &:hover { background-color: ${({ $isSelected }) => ($isSelected ? "var(--blue-300)" : "var(--black-400)")}; }
`;

export const RightBottom = styled.div`
  min-height: 0;
  border-radius: 4px;
  height: 200px;
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

export const OperationListHeader = styled.div`
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--white);
  font-size: 12px;
  background-color: transparent !important;
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

export const OperationWindowBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 0 0;
  box-sizing: border-box;
  min-height: 100%;
  flex: 1;
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
