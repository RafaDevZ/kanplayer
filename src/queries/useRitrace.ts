import { useMutation } from "@tanstack/react-query";
import type { RitraceRenderProps } from "../interfaces/Ritrace";
import { ritraceService } from "../services/ritraceService";
import { useAlert } from "../utils/Utils";

export function useRitraceRender() {
  const { setAlert } = useAlert();
  return useMutation({
    mutationFn: (input: RitraceRenderProps) => ritraceService.render(input),
    onError: (error) => {
      if (error instanceof Error && error.message.includes("cancelada")) return;
      setAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível renderizar com RiTrace.",
      });
    },
  });
}

export function useRitraceCancel() {
  const { setAlert } = useAlert();
  return useMutation({
    mutationFn: (jobId: string) => ritraceService.cancel(jobId),
    onError: (error) =>
      setAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível cancelar o RiTrace.",
      }),
  });
}
