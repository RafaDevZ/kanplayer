import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioProps } from "../interfaces/Scenario";
import { scenarioService } from "../services/scenarioService";
import { useAlert } from "../utils/Utils";

export const scenarioKeys = {
  all: ["scenarios"] as const,
};

export function useScenarios() {
  return useQuery({ queryKey: scenarioKeys.all, queryFn: scenarioService.list });
}

export function useCreateScenario(onCreated?: () => void) {
  const queryClient = useQueryClient();
  const { setAlert } = useAlert();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.create(scenario),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
      setAlert({ type: "success", message: "Cenário criado." });
      onCreated?.();
    },
    onError: (error) =>
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar o cenário.",
      }),
  });
}

export function useUpdateScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.update(scenario),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.delete(scenario),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}
