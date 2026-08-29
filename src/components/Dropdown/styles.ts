import styled, { css, keyframes } from "styled-components";
import { DftScroll } from "../DefaultComponents/styles";

const dropdownGrow = keyframes`
  from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
  to { opacity: 1; max-height: 200px; padding-top: 4px; padding-bottom: 4px; }
`;

const dropdownShrink = keyframes`
  from { opacity: 1; max-height: 200px; padding-top: 4px; padding-bottom: 4px; }
  to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
`;

export const DropdownBody = styled.div<{
  $isOpen: boolean;
  $width?: string;
  $maxHeight?: string;
  $disabled?: boolean;
}>`
  height: 30px;
  width: ${({ $width }) => $width ?? "70px"};
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 0 10px;
  border-radius: 4px;
  background-color: var(--black-300);
  color: var(--white);
  font-size: 11px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  user-select: none;

  ${({ $isOpen }) =>
    $isOpen &&
    css`
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    `}

  ${({ $maxHeight }) =>
    $maxHeight &&
    css`
      max-height: ${$maxHeight};
    `}
  ${({ $disabled }) =>
    !$disabled &&
    css`
      &:hover {
        background-color: var(--black-400);
      }
    `}
`;

export const DropdownTitle = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
`;

export const DropdownTitleNode = styled.div`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const DropdownContainer = styled.div`
  position: absolute;
  top: 29px;
  left: 0;
  width: 100%;
  z-index: 10;
`;

export const DropdownAnimatedContainer = styled.div<{ $isOpen: boolean }>`
  width: 100%;
  max-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden auto;
  padding: 4px;
  box-sizing: border-box;
  border: 1px solid var(--black-400);
  border-radius: 0 0 4px 4px;
  background-color: var(--black-200);
  box-shadow: var(--box-shadow);
  animation: ${({ $isOpen }) => ($isOpen ? dropdownGrow : dropdownShrink)} 0.18s
    ease-in-out forwards;
  ${DftScroll}
`;

export const DropdownOption = styled.button`
  width: 100%;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--white);
  font-size: 11px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background-color: var(--black-400);
  }
`;

export const DropdownArrow = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: rotate 0.2s ease-in-out;
  rotate: ${({ $isOpen }) => ($isOpen ? "270deg" : "90deg")};
  pointer-events: none;

  svg {
    width: 16px;
    height: 16px;
  }
`;
