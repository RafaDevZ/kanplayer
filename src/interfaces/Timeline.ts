import z from "zod";
import { trackSchema, type TrackProps } from "./Track";
import { timelineEventSchema, type TimelineEventProps } from "./TimelineEvent";

export interface TimelineProps {
  id: number;
  name: string;
  track: TrackProps;
  bpm?: number;
  firstBeatSeconds?: number;
  beatIntervalSeconds?: number;
  events: TimelineEventProps[];
}

export const timelineSchema = z.object({
  id: z.number().int().default(0),
  name: z.string().default(""),
  track: trackSchema.default(() => trackSchema.parse({})),
  bpm: z
    .number()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  firstBeatSeconds: z
    .number()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  beatIntervalSeconds: z
    .number()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined),
  events: z.array(timelineEventSchema).default([]),
});
