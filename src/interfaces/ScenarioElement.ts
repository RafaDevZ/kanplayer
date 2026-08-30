import z from "zod";

export type StemResponseOperation = "scale" | "rotation" | "translation" | "wiggle";
export type StemResponseTransition = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";

export interface ScenarioElementOperationProps {
  id: string;
  stemId?: number;
  operation?: StemResponseOperation;
  transition?: StemResponseTransition;
  value?: number;
  translationX?: number;
  translationY?: number;
  translationZ?: number;
  repetitions?: number;
  attackSeconds?: number;
  releaseSeconds?: number;
}

export const scenarioElementOperationSchema = z.object({
  id: z.string().trim().min(1).default(""),
  stemId: z.number().int().nullish().transform((value) => value ?? undefined),
  operation: z.enum(["scale", "rotation", "translation", "wiggle"]).nullish().transform((value) => value ?? undefined),
  transition: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).nullish().transform((value) => value ?? undefined),
  value: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
  translationX: z.number().finite().nullish().transform((value) => value ?? undefined),
  translationY: z.number().finite().nullish().transform((value) => value ?? undefined),
  translationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
  repetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  attackSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
  releaseSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
});

export interface ScenarioElementProps {
  id: string;
  name: string;
  type: "circle";
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  pivotX: number;
  pivotY: number;
  color: string;
  linkedTimelineId?: number;
  linkedStemId?: number;
  operations: ScenarioElementOperationProps[];
  stemResponseOperation?: StemResponseOperation;
  stemResponseValue?: number;
  stemResponseAttackSeconds?: number;
  stemResponseReleaseSeconds?: number;
}

export const scenarioElementSchema = z.object({
  id: z.string().trim().min(1).default(""),
  name: z.string().trim().default(""),
  type: z.literal("circle").default("circle"),
  x: z.number().finite().default(200),
  y: z.number().finite().default(200),
  scaleX: z.number().positive().finite().default(1),
  scaleY: z.number().positive().finite().default(1),
  rotation: z.number().finite().default(0),
  pivotX: z.number().min(0).max(1).finite().default(0.5),
  pivotY: z.number().min(0).max(1).finite().default(0.5),
  color: z.string().trim().min(1).default("#00a8ff"),
  linkedTimelineId: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  linkedStemId: z.number().int().nullish().transform((value) => value ?? undefined),
  stemResponseOperation: z
    .enum(["scale", "rotation", "translation", "wiggle"])
    .nullish()
    .transform((value) => value ?? undefined),
  stemResponseValue: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
  stemResponseAttackSeconds: z
    .number()
    .nonnegative()
    .finite()
    .nullish()
    .transform((value) => value ?? undefined),
  stemResponseReleaseSeconds: z
    .number()
    .nonnegative()
    .finite()
    .nullish()
    .transform((value) => value ?? undefined),
  operations: z.array(scenarioElementOperationSchema).default([]),
});
