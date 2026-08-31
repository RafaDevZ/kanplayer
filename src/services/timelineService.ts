import { invoke } from "@tauri-apps/api/core";
import { timelineSchema, type TimelineProps } from "../interfaces/Timeline";

const toTrackInput = (track: TimelineProps["track"]) => ({
  name: track.name,
  path: track.path,
  durationSeconds: track.durationSeconds,
  audioSha256: track.audioSha256,
});

const toTimelineSaveInput = (timeline: TimelineProps) => ({
  name: timeline.name,
  track: toTrackInput(timeline.track),
  bpm: timeline.bpm,
  firstBeatSeconds: timeline.firstBeatSeconds,
  beatIntervalSeconds: timeline.beatIntervalSeconds,
  snap: timeline.snap,
  followPlayhead: timeline.followPlayhead,
  vocalPath: timeline.vocalPath,
  stems: timeline.stems.map(({ id, name, color }) => ({ id, name, color })),
  events: timeline.events.map(({ stem, stemId, timeSeconds, confidence, origin }) => ({
    stem,
    stemId,
    timeSeconds,
    confidence,
    origin,
  })),
});

export const timelineService = {
  list: async () =>
    timelineSchema.array().parse(await invoke<unknown>("list_timelines")),
  getForTrack: async (trackPath: string) => {
    const response = await invoke<unknown>("get_timeline_for_track", {
      trackPath,
    });
    return response === null ? undefined : timelineSchema.parse(response);
  },
  create: async (timeline: TimelineProps) =>
    timelineSchema.parse(
      await invoke<unknown>("create_timeline", {
        timeline: {
          name: timeline.name,
          music: toTrackInput(timeline.track),
          bpm: timeline.bpm,
        },
      }),
    ),
  update: async (timeline: TimelineProps) =>
    timelineSchema.parse(
      await invoke<unknown>("update_timeline", {
        timelineId: timeline.id,
        timeline: toTimelineSaveInput(timeline),
      }),
    ),
  delete: (timeline: TimelineProps) =>
    invoke<void>("delete_timeline", { timelineId: timeline.id }),
};
