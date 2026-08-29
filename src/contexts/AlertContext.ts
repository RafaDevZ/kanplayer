import { createContext } from "react";
import type { AlertData } from "../components/Alert";

export interface AlertContextValue {
  alert?: AlertData;
  setAlert: (alert: AlertData) => void;
  clearAlert: () => void;
}

export const AlertContext = createContext<AlertContextValue | undefined>(
  undefined,
);
