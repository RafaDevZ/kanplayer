import { Icon } from "@iconify/react";
import { useContext } from "react";
import { AlertContext } from "../../contexts/AlertContext";
import { AlertBox, AlertIcon, AlertMessage } from "./styles";

export type AlertType = "success" | "error" | "warning";
export interface AlertData {
  message: string;
  type: AlertType;
  mode?: "compact" | "normal";
}

const alertIcons: Record<AlertType, string> = {
  success: "mi:circle-check",
  error: "mi:circle-error",
  warning: "mi:circle-warning",
};

export function Alert() {
  const alert = useContext(AlertContext)?.alert;
  if (!alert) return null;

  return (
    <AlertBox $type={alert.type} $mode={alert.mode ?? "normal"}>
      <AlertIcon>
        <Icon icon={alertIcons[alert.type]} />
      </AlertIcon>
      <AlertMessage>{alert.message}</AlertMessage>
    </AlertBox>
  );
}
