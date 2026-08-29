import styled, { css } from "styled-components";
import { motion } from "framer-motion";
import { LineBlueprint } from "../DefaultComponents/styles";

export const WindowBody = styled(motion.div)<{ $isDragging?: boolean }>`
  position: fixed;
  inset: 0;
  display: grid;
  height: 100dvh;
  width: 100dvw;
  place-items: center;
  background-color: ${props => props.$isDragging ? "transparent" : "#00000010"};
  backdrop-filter: ${props => props.$isDragging ? "none" : "blur(2px)"};
  z-index: 1000;
  pointer-events: all !important;
  contain: layout paint style;
  transition: background-color 0.1s ease-in-out, backdrop-filter 0.1s ease-in-out;

  .return {
    display: none;
  }
`;

export const WindowContainer = styled(motion(LineBlueprint))<{ $height?: string; $width?: string; $isDragging?: boolean }>`
  height: ${props => props.$height || "80dvh"};
  max-height: ${props => props.$height || "80dvh"};
  width: ${props => props.$width || "80dvw"};
  max-width: ${props => props.$width || "80dvw"};
  background-color: var(--black-200) !important;
  border-radius: 8px;
  box-shadow: var(--box-shadow);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  contain: layout paint style;
  will-change: transform, opacity;
  border: solid 1px #ffffff0c;
  transition: ${props => props.$isDragging
    ? "transform 0.08s ease-out"
    : "width 0.22s ease-in-out, max-width 0.22s ease-in-out, height 0.22s ease-in-out, max-height 0.22s ease-in-out"};
`;

export const WindowIconsBox = styled.div`
  height: 100%;
  display: flex;
  position: absolute;
  left: 0;
  align-items: center;
  padding-left: 4px;
  pointer-events: none;
`;

export const WindowHeader = styled.header`
  height: 30px;
  width: 100%;
  background-color: var(--black-300);
  box-shadow: var(--box-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  box-sizing: border-box;
  position: relative;
  font-size: 12px;
  color: white;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  svg {
    color: var(--white) !important;
    height: 20px;
    width: 20px;
    left: 6px;
  }
`;

export const ChildrenContainer = styled.div<{ $noPadding?: boolean }>`
  flex: 1;
  padding: 10px;
  padding-top: 0px;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
  min-height: 0;
  min-width: 0;

  ${props => props.$noPadding && css`
    padding: 0 !important;
  `}
`;

export const CloseButton = styled.div`
  position: absolute;
  right: 4px;
  height: 22px;
  width: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 100%;

  svg {
    height: 13px !important;
    width: 13px !important;
    pointer-events: none;
    position: static;
  }
`;
