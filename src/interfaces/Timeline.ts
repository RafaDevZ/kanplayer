import z from "zod";
import { trackSchema, type TrackProps } from "./Track";
import { timelineEventSchema, type TimelineEventProps } from "./TimelineEvent";
import {
  defaultTimelineStems,
  timelineStemSchema,
  type TimelineStemProps,
} from "./TimelineStem";

export interface TimelineProps {
  id: number;
  name: string;
  track: TrackProps;
  bpm?: number;
  firstBeatSeconds?: number;
  beatIntervalSeconds?: number;
  snap: string;
  followPlayhead: boolean;
  vocalPath?: string;
  stems: TimelineStemProps[];
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
  snap: z.string().default("1/16"),
  followPlayhead: z.boolean().default(false),
  vocalPath: z.string().nullish().transform((value) => value ?? undefined),
  stems: z.array(timelineStemSchema).default(() => defaultTimelineStems),
  events: z.array(timelineEventSchema).default([]),
});
