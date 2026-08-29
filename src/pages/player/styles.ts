import styled from "styled-components";

export const Body = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const PlayerAudio = styled.audio`
  display: none;
`;

export const PlayerContainer = styled.div`
  display: flex;
  position: relative;
  height: 50px;
  width: 100%;
  background-color: var(--black-200a);
  bottom: 0;
  justify-content: center;
`;

export const PlayerControls = styled.div`
  display: flex;
  height: 100%;
  width: 300px;
  gap: 10px;
  align-items: center;
  justify-content: center;
`;

export const TrackName = styled.div`
  height: 100%;
  width: 40%;
  position: absolute;
  left: 16px;
  display: flex;
  align-items: center;
  overflow: hidden;
  color: var(--white);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

export const VolumeContainer = styled.div`
  position: absolute;
  right: 16px;
  width: 120px;
  height: 100%;
  display: flex;
  align-items: center;
`;

export const PlayerControlButton = styled.button`
  height: 36px;
  width: 36px;
  background-color: var(--black-300);
  border: none;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;

  svg {
    height: 20px;
    width: 20px;
    color: var(--white);
  }

  &:hover {
    background-color: var(--black-400);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

export const TimelineContainer = styled.div`
  position: relative;
  bottom: 0;
  height: 20px;
  width: 100%;
  margin-top: auto;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  display: flex;
  padding: 0px 10px;
  box-sizing: border-box;
`;

export const TimelineThumbTrack = styled.div`
  position: absolute;
  top: 0;
  right: 17px;
  bottom: 0;
  left: 17px;
  pointer-events: none;
`;

export const TimelineThumb = styled.div`
  --progress: 0%;

  position: absolute;
  top: 50%;
  left: var(--progress);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--white);
  transform: translate(-50%, -50%);
  will-change: left;
`;

export const TimelineInput = styled.input.attrs({ type: "range" })<{
  $hideThumb?: boolean;
}>`
  --progress: 0%;

  appearance: none;
  width: 100%;
  height: 20px;
  margin: 0;
  background: transparent;
  cursor: pointer;

  &::-webkit-slider-runnable-track {
    height: 4px;
    background: linear-gradient(
      to right,
      var(--blue-100) 0%,
      var(--blue-100) var(--progress),
      var(--black-100) var(--progress),
      var(--black-100) 100%
    );
    border-radius: 999px;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: none;
    border-radius: 50%;
    background: var(--white);
    opacity: ${({ $hideThumb }) => ($hideThumb ? 0 : 1)};
  }

  &::-moz-range-track {
    height: 4px;
    background: var(--black-100);
    border-radius: 999px;
  }

  &::-moz-range-progress {
    height: 4px;
    background: var(--blue-100);
    border-radius: 9999px;
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--white);
    opacity: ${({ $hideThumb }) => ($hideThumb ? 0 : 1)};
  }
`;

export const ListContainer = styled.div<{ $open: boolean }>`
  height: 100%;
  width: 200px;
  background-color: var(--black-300);
  position: absolute;
  z-index: 2;
  display: flex;
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.24);

  transform: translateX(${({ $open }) => ($open ? 0 : -200)}px);
  transition: transform 0.2s ease-in-out;
`;

export const TrackList = styled.div`
  width: 100%;
  overflow-y: auto;
  padding: 12px 8px;
  box-sizing: border-box;
`;

export const TrackItem = styled.button<{ $active: boolean }>`
  width: 100%;
  padding: 8px;
  overflow: hidden;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--white);
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${({ $active }) => $active && "background-color: var(--black-400);"}

  &:hover {
    background-color: var(--black-400);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const ListMessage = styled.p`
  margin: 0;
  padding: 8px;
  color: var(--white);
  font-size: 14px;
`;

export const ListContainerManager = styled.button`
  height: 30px;
  width: 30px;
  background-color: var(--black-300);
  position: absolute;
  right: -40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  padding: 0;
  border-radius: 8px;
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.24);

  svg {
    height: 20px;
    width: 20px;
    color: var(--white);
  }
`;
