import styled from "styled-components";
import { DftScroll, HeaderBlueprint } from "../../components/DefaultComponents/styles";

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

export const LayerItem = styled.div<{ $isSelected: boolean; $isDragging: boolean }>`
  width: auto;
  flex: 1;
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

export const LayerNameInput = styled.input`
  width: 100%;
  height: 30px;
  border: 0;
  outline: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: inherit;
  text-align: left;
`;

export const LayerRow = styled.div<{ $isVisible: boolean }>`
  display: flex;
  gap: 4px;
  min-height: 30px;
  flex-shrink: 0;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0.58)};
`;

export const LayerVisibilityButton = styled.button`
  width: 30px;
  min-width: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  line-height: 0;
  border: 0;
  border-radius: 4px;
  color: var(--white);
  background-color: var(--black-200);
  cursor: pointer;

  &:hover { background-color: var(--black-400); }
  svg { display: block; width: 15px; height: 15px; margin: auto; }
`;

export const LayerOpacityButton = styled(LayerVisibilityButton)<{ $opacity: number }>`
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  font-size: 8px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: var(--black-200);
  touch-action: none;

  &::before {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 2px;
    background: linear-gradient(to top, rgba(0, 168, 255, ${({ $opacity }) => $opacity}) 0 ${({ $opacity }) => $opacity * 100}%, var(--black-300) ${({ $opacity }) => $opacity * 100}% 100%);
  }

  span { position: relative; z-index: 1; }
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
  cursor: grab;
  touch-action: none;

  &:active { cursor: grabbing; }
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

export const PresetToolbar = styled.div`
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 0 4px;
  box-sizing: border-box;
  flex-shrink: 0;

  > * { flex: 1; min-width: 0; }
`;

export const PresetExportButton = styled.button`
  height: 30px;
  border: 0;
  border-radius: 4px;
  background: var(--black-300);
  color: var(--white);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover { background: var(--black-400); }
`;

export const PresetNameBody = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  box-sizing: border-box;
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
