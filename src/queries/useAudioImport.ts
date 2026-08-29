import { useMutation } from "@tanstack/react-query";
import { audioImportService } from "../services/audioImportService";
import type { AudioFileProps } from "../interfaces/AudioFile";
import { useAlert } from "../utils/Utils";

export function useAudioImport(onImported?: (audio: AudioFileProps) => void) {
  const { setAlert } = useAlert();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const file = files[0];
      if (!file) throw new Error("Selecione um arquivo de áudio.");
      return audioImportService.import(file);
    },
    onSuccess: onImported,
    onError: (error) =>
      setAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível importar a música.",
      }),
  });
}
