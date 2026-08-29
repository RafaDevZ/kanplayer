import { darken } from "polished";
import styled, { createGlobalStyle, css } from "styled-components";

export const TippyContextStyle = createGlobalStyle`
  .tippy-box[data-theme~="context-box"] { background-color: var(--context-box-color, var(--red-100)); color: var(--white); font-size: 11px; font-family: "Montserrat", sans-serif; }
`;

export const DftScroll = css`
  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--blue-200);
    border-radius: 4px;
  }
`;

export const DftScrollX = css`
  &::-webkit-scrollbar {
    height: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--blue-200);
    border-radius: 4px;
  }
`;

export const Input = styled.input.attrs({
  spellCheck: "false",
  autoComplete: "new-password",
})`
  border-radius: 8px;
  border: 1px solid var(--black-400) !important;
  min-height: 30px;
  text-align: center;
  outline: none;
  width: auto;
  font-size: 12px;
  font-family: "Montserrat", sans-serif;
  flex-shrink: 0;
  box-sizing: border-box;
  background-color: var(--black-200);
  color: var(--white);
  &:focus {
    border-color: var(--blue-100) !important;
  }
  &[type="date"] {
    height: 30px;
  }
`;

export const FileInputDropZone = styled.label<{
  $disabled?: boolean;
  $dragging?: boolean;
}>`
  min-height: 100px;
  width: 100%;
  border: 1px solid var(--black-400);
  border-radius: 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  background-color: ${({ $dragging }) =>
    $dragging ? "var(--black-300)" : "var(--black-200)"};
  color: var(--white);
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;

  &:focus-within,
  &:hover {
    border-color: var(--blue-100);
  }

  ${({ $dragging }) =>
    $dragging &&
    css`
      border-style: dashed;
      border-width: 2px;
    `}

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
`;

export const FileInputIcon = styled.div`
  color: var(--blue-100);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    height: 28px;
    width: 28px;
  }
`;

export const FileInputText = styled.span`
  width: 100%;
  padding: 0 10px;
  box-sizing: border-box;
  font-size: 10px;
  font-weight: 500;
  text-align: center;
`;

export const TitledDivContent = styled.div<{ $disabled?: boolean }>`
  border-radius: 8px;
  border: 1px solid var(--black-400) !important;
  min-height: 30px;
  text-align: center;
  outline: none;
  width: auto;
  font-size: 12px;
  font-family: "Montserrat", sans-serif;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  position: relative;
  overflow: hidden;
  background-color: var(--black-200);
  color: var(--white);
  &:after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background-color: var(--blue-100);
  }
  & > svg {
    height: 16px;
    width: 16px;
    flex-shrink: 0;
  }
  ${(props) =>
    props.$disabled &&
    css`
      background-color: var(--black-300);
      opacity: 0.6;
      pointer-events: none;
    `}
`;

export const ButtonBase = styled.button<{
  $obrigatory?: boolean;
  $headerBtn?: boolean;
  $disabled?: boolean;
  $cancel?: boolean;
  $confirm?: boolean;
  $neutral?: boolean;
}>`
  height: 30px;
  width: fit-content;
  border-radius: 8px;
  border: none;
  background-color: var(--blue-100);
  color: var(--white);
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  position: relative;
  & > * {
    pointer-events: none;
  }
  &:hover:not(:disabled) {
    background-color: ${darken(0.1, "#00a8ff")};
  }
  &:disabled {
    cursor: not-allowed;
    background-color: var(--black-400) !important;
  }
  & > svg {
    height: 16px;
    width: 16px;
  }
  ${(props) =>
    props.$obrigatory &&
    css`
      &::after {
        content: "";
        height: 100%;
        width: 100%;
        pointer-events: none;
        position: absolute;
        left: 0;
        top: 0;
        border-radius: 8px;
        border-right: solid 4px var(--red-100);
        box-sizing: border-box;
      }
    `}
  ${(props) =>
    props.$headerBtn &&
    css`
      width: 60px;
      background-color: var(--blue-100);
      svg {
        flex-shrink: 0;
        height: 18px;
        width: 18px;
      }
    `}
  ${(props) =>
    props.$cancel &&
    css`
      background-color: var(--red-200);
      &:hover:not(:disabled) {
        background-color: ${darken(0.1, "#d32f2f")};
      }
    `}
  ${(props) =>
    props.$confirm &&
    css`
      background-color: var(--green-300);
      &:hover:not(:disabled) {
        background-color: ${darken(0.1, "#2e7d32")};
      }
    `}
  ${(props) =>
    props.$neutral &&
    css`
      background-color: var(--black-200);
      border: solid 1px var(--black-400);
    `}
`;

export const TitledInputBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
  position: relative;
`;
export const TitledInputContextBox = styled.div<{ $color?: string }>`
  height: 18px;
  width: 18px;
  background-color: ${(props) => props.$color || "var(--red-100)"};
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  z-index: 2;
  padding: 3px;
  box-sizing: border-box;
  svg {
    color: var(--white);
  }
`;
export const Obrigatory = styled.span`
  position: absolute;
  height: 100%;
  width: 100%;
  border-right: 4px solid var(--red-200);
  box-sizing: border-box;
  border-radius: 8px;
  pointer-events: none;
`;
export const TitledTitle = styled.span`
  font-weight: 500;
  font-size: 12px;
  color: var(--white);
  z-index: 1;
  background-color: var(--black-200);
  width: fit-content;
  padding: 0 8px;
  border-radius: 8px;
  position: absolute;
  top: -7px;
  left: 14px;
  pointer-events: none;
`;
export const InputBox = styled.div<{ $detail?: boolean }>`
  width: 100%;
  min-width: 0;
  flex: 1;
  display: flex;
  box-sizing: border-box;
  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    flex-shrink: 1;
    ${(props) =>
      props.$detail &&
      css`
        border-left: none !important;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      `}
  }
`;
export const Detail = styled.div`
  flex: 0 0 auto;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--black-400);
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
  padding: 0 4px;
  white-space: nowrap;
  background-color: var(--black-300);
  color: var(--white);
`;
export const TextArea = styled.textarea`
  min-height: 100px;
  width: 100%;
  border-radius: 8px;
  border: solid 1px var(--black-400);
  padding: 10px;
  box-sizing: border-box;
  resize: none;
  font-size: 12px;
  outline: none;
  font-family: "Montserrat", sans-serif;
  background-color: var(--black-200);
  color: var(--white);
  &:focus {
    border-color: var(--blue-100);
  }
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--blue-100);
    border-radius: 4px;
  }
`;
export const SliderBody = styled.div`
  height: 30px;
  width: 60px !important;
  border: 1px solid var(--black-400);
  box-sizing: border-box;
  border-radius: 100px;
  display: flex;
  align-items: center;
  padding: 2px;
  cursor: pointer;
  position: relative;
`;
interface SliderBoxProps {
  $active: boolean | null;
}

export const SliderBox = styled.div<SliderBoxProps>`
  height: 24px;
  width: 24px;
  background-color: var(--black-400);
  border-radius: 100px;
  transition: all 0.2s ease-in-out;
  ${(props) =>
    props.$active &&
    css`
      background-color: var(--blue-100);
      margin-left: 30px;
    `}
`;
export const TabsBody = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;
export const TabsBox = styled.div`
  height: 30px;
  width: 100% !important;
  border-bottom: solid 2px var(--blue-100);
  display: flex;
  align-items: end;
  gap: 4px;
  flex-shrink: 0;
`;
export const TabContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;
interface TabChildrenProps {
  $active: boolean;
}

export const TabChildren = styled.div<TabChildrenProps>`
  display: ${(props) => (props.$active ? "block" : "none")};
  height: 100%;
  width: 100%;
`;
interface TabProps {
  $active: boolean;
  $block: boolean;
}

export const Tab = styled.div<TabProps>`
  height: 25px;
  width: 50px;
  background-color: var(--black-400);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  ${(props) =>
    props.$block &&
    css`
      cursor: not-allowed !important;
      background-color: var(--black-300);
      opacity: 0.6;
    `}
  ${(props) =>
    props.$active &&
    css`
      background-color: var(--blue-100);
      height: 30px;
      svg {
        color: var(--white);
      }
    `}
`;
export const InputFilterBody = styled.div`
  height: 30px;
  width: 160px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  box-sizing: border-box;
  padding: 10px;
  gap: 10px;
  border: solid 1px var(--black-400);
  background-color: var(--black-200);
`;
export const HeaderLabelBody = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--white);
  height: 30px;
  display: flex;
  padding: 0 10px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-left: auto;
  border-radius: 8px;
`;
export const HeaderBlueprint = styled.header`
  width: 100%;
  height: 50px;
  background-color: var(--black-300);
  display: flex;
  align-items: center;
  padding: 10px;
  box-sizing: border-box;
  justify-content: flex-start;
  gap: 10px;
  position: relative;
  flex-shrink: 0;
`;
export const ContainerBlueprint = styled.div`
  flex: 1;
  padding: 10px;
  box-sizing: border-box;
  overflow: auto;
  display: flex;
  position: relative;
`;
export const FormContainerBlueprint = styled.div`
  flex: 1;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-content: flex-start;
  box-sizing: border-box;
  & > * {
    width: 100%;
  }
`;
export const FormBlueprint = styled.form`
  flex: 1;
`;
export const LineBlueprint = styled.div`
  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background-color: var(--blue-100);
  }
`;
export const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  ${ButtonBase} {
    flex-shrink: 0;
  }
`;

export const hidden = css`
  display: none;
`;
