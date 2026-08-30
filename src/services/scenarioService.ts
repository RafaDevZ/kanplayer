import { invoke } from "@tauri-apps/api/core";
import { scenarioSchema, type ScenarioProps } from "../interfaces/Scenario";

const toScenarioInput = (scenario: ScenarioProps) => ({
  name: scenario.name,
  width: scenario.width,
  height: scenario.height,
  backgroundColor: scenario.backgroundColor,
  elements: scenario.elements.map((element) => ({ ...element })),
});

export const scenarioService = {
  list: async () =>
    scenarioSchema.array().parse(await invoke<unknown>("list_scenarios")),
  create: async (scenario: ScenarioProps) =>
    scenarioSchema.parse(
      await invoke<unknown>("create_scenario", {
        scenario: toScenarioInput(scenario),
      }),
    ),
  update: async (scenario: ScenarioProps) =>
    scenarioSchema.parse(
      await invoke<unknown>("update_scenario", {
        scenarioId: scenario.id,
        scenario: toScenarioInput(scenario),
      }),
    ),
  delete: (scenario: ScenarioProps) =>
    invoke<void>("delete_scenario", { scenarioId: scenario.id }),
};
