import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Button, TitledDiv, TitledInput } from "../../components/DefaultComponents";
import { Icons } from "../../components/Icons";
import Window from "../../components/Window";
import type { TimelineStemProps } from "../../interfaces/TimelineStem";
import { useCreateStem, useDeleteStem, useStems, useUpdateStem } from "../../queries/useStems";
import { useAlert } from "../../utils/Utils";
import * as SE from "../ScenarioEditor/styles";
import * as STE from "./styles";

const createDraft = (): TimelineStemProps => ({ id: 0, name: "", color: "#00a8ff" });

export default function StemEditor() {
  const { data: stems } = useStems();
  const { mutate: createStem, isPending: isCreating } = useCreateStem();
  const { mutate: updateStem, isPending: isUpdating } = useUpdateStem();
  const { mutate: deleteStem, isPending: isDeleting } = useDeleteStem();
  const { setAlert } = useAlert();
  const [draft, setDraft] = useState<TimelineStemProps>(createDraft);
  const [isWindowVisible, setIsWindowVisible] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const closeWindow = () => {
    setDraft(createDraft());
    setIsColorPickerOpen(false);
    setIsWindowVisible(false);
  };

  const openCreate = () => {
    setDraft(createDraft());
    setIsColorPickerOpen(false);
    setIsWindowVisible(true);
  };

  const openEdit = (stem: TimelineStemProps) => {
    setDraft(stem);
    setIsColorPickerOpen(false);
    setIsWindowVisible(true);
  };

  const saveStem = () => {
    const name = draft.name.trim();
    if (!name) {
      setAlert({ type: "error", message: "Digite um nome para o stem." });
      return;
    }
    const callbacks = {
      onSuccess: () => closeWindow(),
      onError: (error: unknown) => setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar o stem.",
      }),
    };
    if (draft.id > 0) updateStem({ ...draft, name }, callbacks);
    else createStem({ name, color: draft.color }, callbacks);
  };

  const removeStem = () => {
    if (draft.id <= 0) return;
    deleteStem(draft.id, {
      onSuccess: () => closeWindow(),
      onError: (error) => setAlert({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível excluir o stem.",
      }),
    });
  };

  const isPending = isCreating || isUpdating || isDeleting;

  return (
    <SE.Body>
      <Window
        isVisible={isWindowVisible}
        onClose={() => !isPending && closeWindow()}
        title={draft.id > 0 ? "Editar stem" : "Criar novo stem"}
        width="400px"
        height="360px"
        icon={Icons.addIcon}
      >
        <SE.CreateBody>
          <SE.Form>
            <TitledInput
              title="Nome"
              obrigatory
              value={draft.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setDraft((stem) => ({ ...stem, name }));
              }}
            />
            <TitledDiv title="Cor">
              <SE.ColorPickerButton type="button" onClick={() => setIsColorPickerOpen((open) => !open)}>
                <SE.ColorPreview $color={draft.color} />
                {draft.color}
              </SE.ColorPickerButton>
            </TitledDiv>
            {isColorPickerOpen && (
              <SE.ColorPickerPanel>
                <HexColorPicker color={draft.color} onChange={(color) => setDraft((stem) => ({ ...stem, color }))} />
              </SE.ColorPickerPanel>
            )}
          </SE.Form>
          <STE.Actions>
            <Button type="button" loading={isCreating || isUpdating} onClick={saveStem}>Salvar</Button>
            {draft.id > 0 && (
              <Button type="button" $cancel loading={isDeleting} onClick={removeStem}>Excluir</Button>
            )}
          </STE.Actions>
        </SE.CreateBody>
      </Window>
      <SE.Header>
        <SE.HeaderButton type="button" title="Criar stem" aria-label="Criar stem" onClick={openCreate}>
          {Icons.addIcon}
        </SE.HeaderButton>
      </SE.Header>
      <SE.Workspace>
        {stems?.map((stem) => (
          <STE.Card key={stem.id} onClick={() => openEdit(stem)}>
            <SE.ColorPreview $color={stem.color} />
            <SE.CardTitle title={stem.name}>{stem.name}</SE.CardTitle>
            <SE.CardDeleteButton
              type="button"
              title="Excluir stem"
              aria-label={`Excluir ${stem.name}`}
              disabled={isDeleting}
              onClick={(event) => {
                event.stopPropagation();
                deleteStem(stem.id, {
                  onError: (error) => setAlert({
                    type: "error",
                    message: error instanceof Error ? error.message : "Não foi possível excluir o stem.",
                  }),
                });
              }}
            >
              {Icons.deleteIcon}
            </SE.CardDeleteButton>
          </STE.Card>
        ))}
      </SE.Workspace>
    </SE.Body>
  );
}
