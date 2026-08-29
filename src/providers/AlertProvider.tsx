import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, type AlertData } from "../components/Alert";
import { registerAlertHandler } from "../components/Alert/alertBus";
import { AlertContext } from "../contexts/AlertContext";

const ALERT_DURATION_MS = 8000;

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertData>();
  const clearAlert = useCallback(() => setAlert(undefined), []);

  useEffect(() => {
    if (!alert) return;
    const timeout = window.setTimeout(clearAlert, ALERT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [alert, clearAlert]);

  useEffect(() => {
    registerAlertHandler(setAlert);
    return () => registerAlertHandler(undefined);
  }, []);

  return (
    <AlertContext.Provider value={{ alert, setAlert, clearAlert }}>
      <Alert />
      {children}
    </AlertContext.Provider>
  );
}
