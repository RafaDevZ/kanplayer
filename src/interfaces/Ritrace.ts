import z from "zod";

export interface RitraceRenderProps {
  jobId: string;
  audioPath: string;
  kickMinConfidence: number;
  snareMinConfidence: number;
  hihatMinConfidence: number;
  vocalOnly?: boolean;
  timelineId?: number;
}

export interface RitraceCancelProps {
  jobId: string;
}

export interface RitraceProgressProps {
  jobId: string;
  stage: string;
  percent: number;
  elapsedSeconds: number;
  remainingSeconds?: number;
}

export interface RitraceEventProps {
  stem: string;
  timeSeconds: number;
  confidence: number;
  origin: string;
}

export interface RitraceRenderResultProps {
  bpm: number;
  firstBeatSeconds: number;
  beatIntervalSeconds: number;
  events: RitraceEventProps[];
  vocalPath?: string;
}

export const ritraceRenderResultSchema = z.object({
  bpm: z.number().positive(),
  firstBeatSeconds: z.number().nonnegative(),
  beatIntervalSeconds: z.number().positive(),
  events: z.array(
    z.object({
      stem: z.enum(["kick", "snare", "hihat"]),
      timeSeconds: z.number().nonnegative(),
      confidence: z.number().min(0).max(1),
      origin: z.string().default("ritrace"),
    }),
  ),
  vocalPath: z.string().nullish().transform((value) => value ?? undefined),
});

export const ritraceProgressSchema = z.object({
  jobId: z.string(),
  stage: z.string(),
  percent: z.number().min(0).max(100),
  elapsedSeconds: z.number().nonnegative(),
  remainingSeconds: z.number().nonnegative().nullish().transform((value) => value ?? undefined),
});
