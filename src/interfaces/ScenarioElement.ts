import z from "zod";

export type StemResponseOperation = "scale" | "width" | "height" | "rotation" | "opacity" | "translation" | "wiggle" | "random" | "wander";
export type StemResponseTransition = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";

export interface FrequencyResponseProps {
  minHz: number;
  maxHz: number;
  operation?: StemResponseOperation;
  transition?: StemResponseTransition;
  value?: number;
  translationX?: number;
  translationY?: number;
  translationZ?: number;
  repetitions?: number;
  randomScale?: number;
  randomRotation?: number;
  randomTranslationX?: number;
  randomTranslationY?: number;
  randomTranslationZ?: number;
  randomWiggleX?: number;
  randomWiggleY?: number;
  randomWiggleZ?: number;
  randomRepetitions?: number;
  wanderRadius?: number;
  wanderRotation?: number;
  wanderRepetitions?: number;
  wanderOpposition?: number;
  strength?: number;
  attackSeconds?: number;
  releaseSeconds?: number;
}

export type VocalResponseProps = Omit<FrequencyResponseProps, "minHz" | "maxHz">;

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
  randomScale?: number;
  randomRotation?: number;
  randomTranslationX?: number;
  randomTranslationY?: number;
  randomTranslationZ?: number;
  randomWiggleX?: number;
  randomWiggleY?: number;
  randomWiggleZ?: number;
  randomRepetitions?: number;
  wanderRadius?: number;
  wanderRotation?: number;
  wanderRepetitions?: number;
  wanderOpposition?: number;
  attackSeconds?: number;
  releaseSeconds?: number;
}

export const scenarioElementOperationSchema = z.object({
  id: z.string().trim().min(1).default(""),
  stemId: z.number().int().nullish().transform((value) => value ?? undefined),
  operation: z.enum(["scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"]).nullish().transform((value) => value ?? undefined),
  transition: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).nullish().transform((value) => value ?? undefined),
  value: z.number().finite().nullish().transform((value) => value ?? undefined),
  translationX: z.number().finite().nullish().transform((value) => value ?? undefined),
  translationY: z.number().finite().nullish().transform((value) => value ?? undefined),
  translationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
  repetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  randomScale: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
  randomRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomTranslationX: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomTranslationY: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomTranslationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomWiggleX: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomWiggleY: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomWiggleZ: z.number().finite().nullish().transform((value) => value ?? undefined),
  randomRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  wanderRadius: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
  wanderRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
  wanderRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  wanderOpposition: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
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
  visible: boolean;
  opacity: number;
  color: string;
  imageData?: string;
  /** URL local apenas para preview durante a sessão; não é persistida. */
  imagePreviewUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  rigParentId?: string;
  rigParentAnchorX?: number;
  rigParentAnchorY?: number;
  rigChildAnchorX?: number;
  rigChildAnchorY?: number;
  linkedTimelineId?: number;
  linkedStemId?: number;
  operations: ScenarioElementOperationProps[];
  stemResponseOperation?: StemResponseOperation;
  stemResponseValue?: number;
  stemResponseAttackSeconds?: number;
  stemResponseReleaseSeconds?: number;
  frequencyResponse?: FrequencyResponseProps;
  vocalResponse?: VocalResponseProps;
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
  visible: z.boolean().nullish().transform((value) => value ?? true),
  opacity: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? 1),
  color: z.string().trim().min(1).default("#00a8ff"),
  imageData: z.string().nullish().transform((value) => value ?? undefined),
  imageWidth: z.number().positive().finite().nullish().transform((value) => value ?? undefined),
  imageHeight: z.number().positive().finite().nullish().transform((value) => value ?? undefined),
  rigParentId: z.string().trim().min(1).nullish().transform((value) => value ?? undefined),
  rigParentAnchorX: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
  rigParentAnchorY: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
  rigChildAnchorX: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
  rigChildAnchorY: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
  linkedTimelineId: z.number().int().positive().nullish().transform((value) => value ?? undefined),
  linkedStemId: z.number().int().nullish().transform((value) => value ?? undefined),
  stemResponseOperation: z
    .enum(["scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"])
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
  frequencyResponse: z
    .object({
      minHz: z.number().nonnegative().finite(),
      maxHz: z.number().positive().finite(),
      operation: z.enum(["scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"]).nullish().transform((value) => value ?? undefined),
      transition: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).nullish().transform((value) => value ?? undefined),
      value: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationX: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationY: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      repetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      randomScale: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      randomRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationX: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationY: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleX: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleY: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      wanderRadius: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      wanderRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
      wanderRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      wanderOpposition: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
      strength: z.number().min(0).max(3).finite().nullish().transform((value) => value ?? undefined),
      attackSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      releaseSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
    })
    .refine((value) => value.maxHz > value.minHz)
    .nullish()
    .transform((value) => value ?? undefined),
  vocalResponse: z
    .object({
      operation: z.enum(["scale", "width", "height", "rotation", "opacity", "translation", "wiggle", "random", "wander"]).nullish().transform((value) => value ?? undefined),
      transition: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).nullish().transform((value) => value ?? undefined),
      value: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationX: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationY: z.number().finite().nullish().transform((value) => value ?? undefined),
      translationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      repetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      randomScale: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      randomRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationX: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationY: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomTranslationZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleX: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleY: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomWiggleZ: z.number().finite().nullish().transform((value) => value ?? undefined),
      randomRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      wanderRadius: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      wanderRotation: z.number().finite().nullish().transform((value) => value ?? undefined),
      wanderRepetitions: z.number().int().positive().nullish().transform((value) => value ?? undefined),
      wanderOpposition: z.number().min(0).max(1).finite().nullish().transform((value) => value ?? undefined),
      strength: z.number().min(0).max(3).finite().nullish().transform((value) => value ?? undefined),
      attackSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
      releaseSeconds: z.number().nonnegative().finite().nullish().transform((value) => value ?? undefined),
    })
    .nullish()
    .transform((value) => value ?? undefined),
  operations: z.array(scenarioElementOperationSchema).default([]),
});
