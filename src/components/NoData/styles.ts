import styled from "styled-components";

export const NoDataBody = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

export const NoDataContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: fit-content;
  width: fit-content;
  gap: 10px;
  font-size: 12px;
  color: var(--primary-mid-color);
  font-weight: 450;
  pointer-events: none;
  user-select: none;
  white-space: pre-line;
  text-align: center;
  white-space: pre-line;
  scale: 1;

  svg {
    height: 40px;
    width: 40px;
  }
`