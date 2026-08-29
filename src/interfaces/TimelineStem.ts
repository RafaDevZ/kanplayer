import { hsl } from "polished";
import z from "zod";

export interface TimelineStemProps {
  id: number;
  name: string;
  color: string;
}

const defaultStemDefinitions = [
  { name: "kick", color: hsl(0, 0.78, 0.6) },
  { name: "snare", color: hsl(205, 0.82, 0.62) },
  { name: "hihat", color: hsl(48, 0.9, 0.62) },
] as const;

export const defaultTimelineStems: TimelineStemProps[] =
  defaultStemDefinitions.map((stem, index) => ({
    id: -(index + 1),
    ...stem,
  }));

export const createTimelineStem = (
  name: string,
  existingStems: TimelineStemProps[],
): TimelineStemProps => ({
  id: 0,
  name,
  color: hsl((existingStems.length * 137.508) % 360, 0.75, 0.6),
});

export const timelineStemSchema = z.object({
  id: z.number().int().default(0),
  name: z.string().trim().min(1).default("stem"),
  color: z.string().trim().min(1).default(hsl(0, 0.78, 0.6)),
});
