import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TimelineStemProps } from "../interfaces/TimelineStem";
import { stemService } from "../services/stemService";
import { timelineKeys } from "./useTimelines";

export const stemKeys = { all: ["stems"] as const };

const refreshStemConsumers = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: stemKeys.all });
  queryClient.invalidateQueries({ queryKey: timelineKeys.all });
  queryClient.invalidateQueries({ queryKey: ["scenarios"] });
};

export const useStems = () => useQuery({ queryKey: stemKeys.all, queryFn: stemService.list });

export const useCreateStem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stemService.create,
    onSuccess: () => refreshStemConsumers(queryClient),
  });
};

export const useUpdateStem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stem: TimelineStemProps) => stemService.update(stem),
    onSuccess: () => refreshStemConsumers(queryClient),
  });
};

export const useDeleteStem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stemService.delete,
    onSuccess: () => refreshStemConsumers(queryClient),
  });
};
