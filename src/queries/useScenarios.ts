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

export function useUpdateScenario(onUpdated?: (scenario: ScenarioProps) => void) {
  const queryClient = useQueryClient();
  const { setAlert } = useAlert();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.update(scenario),
    onMutate: async (scenario) => {
      await queryClient.cancelQueries({ queryKey: scenarioKeys.all });
      const previousScenarios = queryClient.getQueryData<ScenarioProps[]>(scenarioKeys.all);
      queryClient.setQueryData<ScenarioProps[]>(scenarioKeys.all, (currentScenarios) =>
        currentScenarios?.map((currentScenario) =>
          currentScenario.id === scenario.id ? scenario : currentScenario,
        ),
      );
      return { previousScenarios };
    },
    onError: (error, _scenario, context) => {
      if (context?.previousScenarios) {
        queryClient.setQueryData(scenarioKeys.all, context.previousScenarios);
      }
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar o cenário.",
      });
    },
    onSuccess: (scenario) => {
      queryClient.setQueryData<ScenarioProps[]>(scenarioKeys.all, (currentScenarios) =>
        currentScenarios?.map((currentScenario) =>
          currentScenario.id === scenario.id ? scenario : currentScenario,
        ),
      );
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
      setAlert({ type: "success", message: "Cenário salvo." });
      onUpdated?.(scenario);
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.delete(scenario),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}
