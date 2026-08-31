import z from "zod";

export interface TimelineEventProps {
  id: number;
  stem: string;
  stemId: number;
  timeSeconds: number;
  confidence?: number;
  origin: string;
}

export interface TimelineEventInputProps {
  stem: string;
  stemId?: number;
  timeSeconds: number;
  confidence?: number;
  origin?: string;
}

export const timelineEventSchema = z.object({
  id: z.number().int().default(0),
  stem: z.string().default("kick"),
  stemId: z.number().int().default(0),
  timeSeconds: z.number().nonnegative().default(0),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullish()
    .transform((value) => value ?? undefined),
  origin: z.string().default("manual"),
});
