import { invoke } from "@tauri-apps/api/core";
import { timelineStemSchema, type TimelineStemProps } from "../interfaces/TimelineStem";

const toStemInput = (stem: Pick<TimelineStemProps, "name" | "color">) => ({
  name: stem.name,
  color: stem.color,
});

export const stemService = {
  list: async () => timelineStemSchema.array().parse(await invoke<unknown>("list_stems")),
  create: async (stem: Pick<TimelineStemProps, "name" | "color">) =>
    timelineStemSchema.parse(await invoke<unknown>("create_stem", { stem: toStemInput(stem) })),
  update: async (stem: TimelineStemProps) =>
    timelineStemSchema.parse(await invoke<unknown>("update_stem", {
      stemId: stem.id,
      stem: toStemInput(stem),
    })),
  delete: (stemId: number) => invoke<void>("delete_stem", { stemId }),
};
