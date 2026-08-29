import z from "zod";

export interface AudioFileProps {
  name: string;
  path: string;
}

export const audioFileSchema = z.object({
  name: z.string().default(""),
  path: z.string().default(""),
});
