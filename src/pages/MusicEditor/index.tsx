import { useState } from "react";
import {
  Button,
  TitledFileInput,
  TitledInput,
} from "../../components/DefaultComponents";
import { Icons } from "../../components/Icons";
import Window from "../../components/Window";
import { timelineSchema, type TimelineProps } from "../../interfaces/Timeline";
import { useCreateTimeline, useTimelines } from "../../queries/useTimelines";
import { useAudioImport } from "../../queries/useAudioImport";
import * as ME from "./styles";
import { useZodValidate } from "../../utils/Utils";
import z from "zod";

interface MusicEditorProps {
  onOpenTimeline: (trackPath: string) => void;
}

export default function MusicEditor({ onOpenTimeline }: MusicEditorProps) {
  const [timelineData, setTimelineData] = useState<TimelineProps>(() =>
    timelineSchema.parse({}),
  );

  const { data: timelines } = useTimelines();
  const { mutate: createTimeline, isPending: isCreatingTimeline } =
    useCreateTimeline();
  const { mutate: importAudio, isPending: isImportingAudio } = useAudioImport(
    (audio) =>
      setTimelineData((timeline) => ({
        ...timeline,
        track: { ...timeline.track, ...audio },
      })),
  );

  const timelineValidateSchema = z.object({
    name: z.string().min(1, "Digite um nome para a timeline."),
    track: z.object({
      name: z.string().min(1, "Selecione uma música para a timeline."),
      path: z.string().min(1, "Selecione uma música para a timeline."),
    }),
  });

  const validate = useZodValidate(timelineValidateSchema, timelineData, () => {
    createTimeline(timelineData);
  });

  const [createVisible, setCreateVisible] = useState<boolean>(false);

  return (
    <ME.Body>
      <Window
        isVisible={createVisible}
        onClose={() => setCreateVisible(false)}
        title="Criar nova timeline"
        width={"400px"}
        height={"500px"}
        icon={Icons.timelineIcon}
      >
        <ME.CreateBody>
          <ME.Form>
            <TitledInput
              title="Nome"
              obrigatory
              disabled={isImportingAudio}
              value={timelineData.name}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setTimelineData((timeline) => ({
                  ...timeline,
                  name: value,
                }));
              }}
            />
            <TitledFileInput
              title="Música"
              obrigatory
              accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/mp4,audio/aac"
              onImport={importAudio}
            />
            <TitledInput
              title="BPM"
              type="number"
              value={timelineData.bpm ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setTimelineData((timeline) => ({
                  ...timeline,
                  bpm: value ? Number(value) : undefined,
                }));
              }}
            />
          </ME.Form>
          <Button
            className="submit"
            type="button"
            disabled={!timelineData.track.path}
            loading={isCreatingTimeline || isImportingAudio}
            onClick={validate}
          >
            Criar timeline
          </Button>
        </ME.CreateBody>
      </Window>
      <ME.Header>
        <ME.HeaderButton onClick={() => setCreateVisible(true)}>
          {Icons.addIcon}
        </ME.HeaderButton>
      </ME.Header>
      <ME.Container>
        {timelines?.map((timeline) => (
          <TimelineCard
            key={timeline.id}
            timelineData={timeline}
            onOpen={() => onOpenTimeline(timeline.track.path)}
          />
        ))}
      </ME.Container>
    </ME.Body>
  );
}

interface TimelineCardProps {
  timelineData: TimelineProps;
  onOpen: () => void;
}

function TimelineCard({ timelineData, onOpen }: TimelineCardProps) {
  return (
    <ME.Card onClick={onOpen}>
      <ME.CardTitle>{timelineData.name}</ME.CardTitle>
    </ME.Card>
  );
}
