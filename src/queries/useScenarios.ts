import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioProps } from "../interfaces/Scenario";
import { scenarioService } from "../services/scenarioService";
import { useAlert } from "../utils/Utils";

export const scenarioKeys = {
  all: ["scenarios"] as const,
  detail: (scenarioId: number) => [...scenarioKeys.all, scenarioId] as const,
};

export function useScenarios() {
  return useQuery({ queryKey: scenarioKeys.all, queryFn: scenarioService.list });
}

export function useScenario(scenarioId: number) {
  return useQuery({
    queryKey: scenarioKeys.detail(scenarioId),
    queryFn: () => scenarioService.get(scenarioId),
  });
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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: scenarioKeys.all, exact: true }),
        queryClient.cancelQueries({ queryKey: scenarioKeys.detail(scenario.id) }),
      ]);
      const previousScenarios = queryClient.getQueryData<ScenarioProps[]>(scenarioKeys.all);
      const previousScenario = queryClient.getQueryData<ScenarioProps>(scenarioKeys.detail(scenario.id));
      queryClient.setQueryData<ScenarioProps[]>(scenarioKeys.all, (currentScenarios) =>
        currentScenarios?.map((currentScenario) =>
          currentScenario.id === scenario.id ? { ...scenario, elements: [] } : currentScenario,
        ),
      );
      queryClient.setQueryData(scenarioKeys.detail(scenario.id), scenario);
      return { previousScenarios, previousScenario };
    },
    onError: (error, scenario, context) => {
      if (context?.previousScenarios) {
        queryClient.setQueryData(scenarioKeys.all, context.previousScenarios);
      }
      if (context?.previousScenario) {
        queryClient.setQueryData(scenarioKeys.detail(scenario.id), context.previousScenario);
      }
      setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar o cenário.",
      });
    },
    onSuccess: (scenario) => {
      queryClient.setQueryData(scenarioKeys.detail(scenario.id), scenario);
      queryClient.setQueryData<ScenarioProps[]>(scenarioKeys.all, (currentScenarios) =>
        currentScenarios?.map((currentScenario) =>
          currentScenario.id === scenario.id ? { ...scenario, elements: [] } : currentScenario,
        ),
      );
      setAlert({ type: "success", message: "Cenário salvo." });
      onUpdated?.(scenario);
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: ScenarioProps) => scenarioService.delete(scenario),
    onSuccess: (_result, scenario) => {
      queryClient.removeQueries({ queryKey: scenarioKeys.detail(scenario.id) });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all, exact: true });
    },
  });
}
