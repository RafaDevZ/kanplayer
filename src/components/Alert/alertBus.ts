import type { AlertData } from "./index";

type AlertHandler = (alert: AlertData) => void;

let alertHandler: AlertHandler | undefined;

export function registerAlertHandler(handler?: AlertHandler) {
  alertHandler = handler;
}

export function emitAlert(alert: AlertData) {
  alertHandler?.(alert);
}
