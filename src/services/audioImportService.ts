import { invoke } from "@tauri-apps/api/core";
import { audioFileSchema, type AudioFileProps } from "../interfaces/AudioFile";

export const audioImportService = {
  import: async (file: File): Promise<AudioFileProps> => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return audioFileSchema.parse(
      await invoke<unknown>("import_audio_file", {
        audio: { fileName: file.name, bytes },
      }),
    );
  },
};
