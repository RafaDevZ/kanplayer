import { invoke } from "@tauri-apps/api/core";
import {
  operationPresetSchema,
  type OperationPresetCategory,
  type OperationPresetConfiguration,
  type OperationPresetProps,
} from "../interfaces/OperationPreset";

export const operationPresetService = {
  list: async (category: OperationPresetCategory) => operationPresetSchema.array().parse(
    await invoke<unknown>("list_operation_presets", { category }),
  ),
  save: async (
    name: string,
    category: OperationPresetCategory,
    operation: OperationPresetConfiguration,
  ): Promise<OperationPresetProps> => operationPresetSchema.parse(
    await invoke<unknown>("save_operation_preset", { name, category, operation }),
  ),
};
