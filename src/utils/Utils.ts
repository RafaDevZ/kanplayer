import { useContext } from "react";
import { z } from "zod";
import { AlertContext } from "../contexts/AlertContext";

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context)
    throw new Error("useAlert deve ser usado dentro de AlertProvider.");
  return context;
}

export function useZodValidate<S extends z.ZodType>(
  schema: S,
  data?: z.infer<S>,
  onSuccess?: () => void,
  fieldErrorHandlers?: Record<string, () => void>,
) {
  const { setAlert } = useAlert();
  const formatIssueMessage = (issue: z.core.$ZodIssue) => {
    const field = issue.path.join(".");
    return issue.code === "invalid_type" && field
      ? `${field}: ${issue.message}`
      : issue.message;
  };

  return (arg?: unknown) => {
    const isEvent =
      arg &&
      typeof arg === "object" &&
      ("nativeEvent" in arg || "currentTarget" in arg);
    const callback = !isEvent && typeof arg === "function" ? arg : undefined;
    const result = schema.safeParse(data);

    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".");
      fieldErrorHandlers?.[field]?.();
      setAlert({ type: "warning", message: formatIssueMessage(issue) });
      return;
    }

    (callback ?? onSuccess)?.();
  };
}
