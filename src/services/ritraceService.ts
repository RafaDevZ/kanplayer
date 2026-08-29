import { invoke } from "@tauri-apps/api/core";
import {
  ritraceRenderResultSchema,
  type RitraceRenderProps,
} from "../interfaces/Ritrace";

export const ritraceService = {
  render: async (input: RitraceRenderProps) =>
    ritraceRenderResultSchema.parse(
      await invoke<unknown>("render_ritrace", { input }),
    ),
  cancel: (jobId: string) =>
    invoke<void>("cancel_ritrace_render", { jobId }),
};
