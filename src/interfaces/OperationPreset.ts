import z from "zod";
import type { FrequencyResponseProps, ScenarioElementOperationProps, VocalResponseProps } from "./ScenarioElement";

export const operationPresetCategorySchema = z.enum(["operation", "frequency", "vocal"]);
export type OperationPresetCategory = z.infer<typeof operationPresetCategorySchema>;
export type OperationPresetConfiguration =
  | ScenarioElementOperationProps
  | FrequencyResponseProps
  | VocalResponseProps;

export const operationPresetSchema = z.object({
  name: z.string().trim().min(1),
  category: operationPresetCategorySchema.default("operation"),
  // A categoria define o contrato aplicado pela tela. Mantemos o JSON sem
  // normalizar campos de outra categoria para não misturar os três formatos.
  operation: z.object({}).passthrough(),
}).transform((preset) => ({
  ...preset,
  operation: preset.operation as OperationPresetConfiguration,
}));

export type OperationPresetProps = z.infer<typeof operationPresetSchema>;
