import z from "zod";

export interface TrackProps {
  id: number;
  name: string;
  path: string;
  durationSeconds?: number;
  audioSha256?: string;
}

export interface TrackInputProps {
  name: string;
  path: string;
  durationSeconds?: number;
  audioSha256?: string;
}

export const trackSchema = z.object({
  id: z.number().int().default(0),
  name: z.string().default(""),
  path: z.string().default(""),
  durationSeconds: z
    .number()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  audioSha256: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
