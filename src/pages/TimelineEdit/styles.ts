import styled from "styled-components";
import {
  DftScrollX,
  HeaderBlueprint,
} from "../../components/DefaultComponents/styles";

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

export const Container = styled.div`
  flex: 1;
  display: flex;
  gap: 4px;
  padding: 10px;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
`;

export const LeftPanel = styled.div`
  width: 200px;
  background-color: var(--black-300);
  border-radius: 4px;
`;

export const CenterPanel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const CenterTop = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  background-color: var(--black-300);
  border-radius: 4px;
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
  height: 260px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--black-300);
  border-radius: 4px;
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;
`;

export const TimelineHeader = styled.div`
  height: 32px;
  min-height: 32px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background-color: var(--black-200);
  border-radius: 4px;
`;

export const TimelineHeaderSpacer = styled.div`
  flex: 1;
`;

export const SnapControl = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;

  > div {
    height: 24px;

    > div:first-child {
      font-size: 10px;
    }
  }
`;

export const Timeline = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const TimelineRuler = styled.div`
  height: 26px;
  min-height: 26px;
  display: flex;
  border-bottom: 1px solid var(--blue-100);
`;

export const RulerLayersSpacer = styled.div`
  width: 130px;
  min-width: 130px;
  box-sizing: border-box;
  background-color: var(--black-200);
  border-radius: 4px 0 0;
  border-right: 1px solid var(--black-400);
`;

export const RulerViewport = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
`;

export const RulerTrack = styled.div<{
  $barGridPercent: number;
  $subdivisionGridPercent?: number;
  $contentScale: number;
}>`
  height: 100%;
  width: ${({ $contentScale }) => $contentScale * 100}%;
  min-width: ${({ $contentScale }) => $contentScale * 100}%;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  border-radius: 0 4px 0 0;
  background-color: var(--black-200);
  background-image: ${({ $subdivisionGridPercent }) =>
    $subdivisionGridPercent
      ? "linear-gradient(to right, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px),"
      : ""}
    linear-gradient(to right, rgba(255, 255, 255, 0.22) 0 1px, transparent 1px);
  background-size: ${({ $subdivisionGridPercent }) =>
    $subdivisionGridPercent ? `${$subdivisionGridPercent}% 100%,` : ""}
    ${({ $barGridPercent }) => $barGridPercent}% 100%;
  background-repeat: repeat-x;
`;

export const RulerPlayhead = styled.div<{ $position: number }>`
  position: absolute;
  bottom: 8px;
  left: calc(${({ $position }) => $position}% - 1px);
  width: 5px;
  cursor: pointer;
  z-index: 1;

  svg {
    position: absolute;
    top: -10px;
    left: -8px;
    width: 16px;
    height: 16px;
    color: var(--blue-100);
    transform: rotate(0deg);
  }
`;

export const RulerTick = styled.span<{
  $position: number;
}>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $position }) => $position}%;
  color: var(--white);
  font-size: 10px;
  line-height: 14px;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(2px);
  box-sizing: border-box;
`;

export const TimelineTracks = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  overflow: hidden;
  border-radius: 0 0 4px 4px;
`;

export const Layers = styled.div`
  width: 130px;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background-color: var(--black-200);
`;

export const Layer = styled.div`
  height: 48px;
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  box-sizing: border-box;
  border-right: 1px solid var(--black-400);
  background-color: var(--black-200);
  color: var(--white);
  font-size: 12px;
  text-transform: capitalize;

  &:not(:last-child) {
    border-bottom: 1px solid var(--black-400);
  }

  &:first-child {
    border-radius: 4px 0 0;
  }

  &:last-child {
    border-bottom: 1px solid var(--black-400);
  }
`;

export const EventsViewport = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background-color: var(--black-200);
  ${DftScrollX}
`;

export const EventsCanvas = styled.div<{ $contentScale: number }>`
  width: ${({ $contentScale }) => $contentScale * 100}%;
  min-width: ${({ $contentScale }) => $contentScale * 100}%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
`;

export const EventLane = styled.div<{
  $barGridPercent: number;
  $subdivisionGridPercent?: number;
  $playheadPercent: number;
}>`
  height: 48px;
  min-height: 48px;
  width: 100%;
  flex: 0 0 48px;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  cursor: crosshair;
  background-color: var(--black-200);
  background-image: ${({ $subdivisionGridPercent }) =>
    $subdivisionGridPercent
      ? "linear-gradient(to right, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px),"
      : ""}
    linear-gradient(to right, rgba(255, 255, 255, 0.22) 0 1px, transparent 1px);
  background-size: ${({ $subdivisionGridPercent }) =>
    $subdivisionGridPercent ? `${$subdivisionGridPercent}% 100%,` : ""}
    ${({ $barGridPercent }) => $barGridPercent}% 100%;
  background-repeat: repeat-x;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(${({ $playheadPercent }) => $playheadPercent}% - 1px);
    width: 1px;
    background-color: var(--blue-100);
    pointer-events: none;
    z-index: 1;
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    height: 1px;
    background-color: var(--black-400);
    pointer-events: none;
  }

  &:not(:last-child) {
    border-bottom: 1px solid var(--black-400);
  }

  &:first-child {
    border-radius: 0 4px 0 0;
  }

  &:last-child {
    border-bottom: 1px solid var(--black-400);
  }
`;

export const EventMarker = styled.span<{ $color: string }>`
  height: 10px;
  width: 10px;
  position: absolute;
  top: 50%;
  border-radius: 50%;
  background-color: ${({ $color }) => $color};
  transform: translate(-50%, -50%);
  z-index: 1;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

export const RightPanel = styled.div`
  width: 200px;
  background-color: var(--black-300);
  border-radius: 4px;
`;
