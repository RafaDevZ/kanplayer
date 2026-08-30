import z from "zod";
import {
  scenarioElementSchema,
  type ScenarioElementProps,
} from "./ScenarioElement";

export interface ScenarioProps {
  id: number;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  elements: ScenarioElementProps[];
}

export const scenarioSchema = z.object({
  id: z.number().int().default(0),
  name: z.string().trim().min(1).default(""),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  backgroundColor: z.string().trim().min(1).default("#1e1e1e"),
  elements: z.array(scenarioElementSchema).default([]),
});
