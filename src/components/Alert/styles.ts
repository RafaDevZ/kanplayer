import styled, { css } from "styled-components";
import type { AlertType } from "./index";

const alertColor = (type: AlertType) => {
  switch (type) {
    case "success":
      return "var(--green-100)";
    case "error":
      return "var(--red-100)";
    case "warning":
      return "var(--yellow-100)";
  }
};

export const AlertBox = styled.div<{
  $type: AlertType;
  $mode: "compact" | "normal";
}>`
  min-height: 65px;
  width: 260px;
  position: fixed;
  z-index: 10000000;
  right: 10px;
  bottom: 10px;
  overflow: hidden;
  display: flex;
  box-sizing: border-box;
  padding: 10px;
  border-radius: 8px;
  background-color: ${({ $type }) => alertColor($type)};
  color: var(--black-100);
  animation: alert-enter 0.2s ease-out;

  &::after {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    width: 100%;
    content: "";
    background-color: var(--black-200);
    animation: alert-progress 8s linear;
  }

  @keyframes alert-enter {
    from {
      transform: translateX(calc(100% + 10px));
    }
    to {
      transform: translateX(0);
    }
  }
  @keyframes alert-progress {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }

  ${({ $mode }) =>
    $mode === "compact" &&
    css`
      min-height: 40px;
      width: 60px;
      padding: 5px;
    `}
`;

export const AlertIcon = styled.div`
  min-width: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  svg {
    height: 30px;
    width: 30px;
  }
`;

export const AlertMessage = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
`;
