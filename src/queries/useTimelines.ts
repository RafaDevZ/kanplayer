import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TimelineProps } from "../interfaces/Timeline";
import { timelineService } from "../services/timelineService";
import { useAlert } from "../utils/Utils";

export const timelineKeys = {
  all: ["timelines"] as const,
  byTrack: (trackPath: string) =>
    [...timelineKeys.all, "track", trackPath] as const,
};

export function useTimelines() {
  return useQuery({
    queryKey: timelineKeys.all,
    queryFn: timelineService.list,
  });
}

export function useTimeline(trackPath?: string) {
  return useQuery({
    queryKey: timelineKeys.byTrack(trackPath ?? ""),
    queryFn: () => timelineService.getForTrack(trackPath as string),
    enabled: Boolean(trackPath),
  });
}

export function useCreateTimeline(onCreated?: () => void) {
  const queryClient = useQueryClient();
  const { setAlert } = useAlert();
  return useMutation({
    mutationFn: (timeline: TimelineProps) => timelineService.create(timeline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timelineKeys.all });
      setAlert({ type: "success", message: "Timeline criada." });
      onCreated?.();
    },
    onError: (error) =>
      setAlert({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível criar a timeline.",
      }),
  });
}

export function useUpdateTimeline(
  onUpdated?: (timeline: TimelineProps) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timeline: TimelineProps) => timelineService.update(timeline),
    onMutate: async (timeline) => {
      const queryKey = timelineKeys.byTrack(timeline.track.path);
      await queryClient.cancelQueries({ queryKey });
      const previousTimeline =
        queryClient.getQueryData<TimelineProps>(queryKey);
      queryClient.setQueryData(queryKey, timeline);
      return { previousTimeline, queryKey };
    },
    onError: (_error, _timeline, context) => {
      if (context?.previousTimeline) {
        queryClient.setQueryData(context.queryKey, context.previousTimeline);
      }
    },
    onSuccess: (timeline) => {
      queryClient.setQueryData(
        timelineKeys.byTrack(timeline.track.path),
        timeline,
      );
      queryClient.invalidateQueries({ queryKey: timelineKeys.all });
      onUpdated?.(timeline);
    },
  });
}

export function useDeleteTimeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timeline: TimelineProps) => timelineService.delete(timeline),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: timelineKeys.all }),
  });
}
