import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import {
  Button,
  TitledDiv,
  TitledInput,
} from "../../components/DefaultComponents";
import { Icons } from "../../components/Icons";
import Window from "../../components/Window";
import { scenarioSchema, type ScenarioProps } from "../../interfaces/Scenario";
import { useCreateScenario, useDeleteScenario, useScenarios } from "../../queries/useScenarios";
import { useAlert, useZodValidate } from "../../utils/Utils";
import * as SE from "./styles";
import z from "zod";

interface ScenarioEditorProps {
  onOpenScenario: (scenarioId: number) => void;
}

export default function ScenarioEditor({ onOpenScenario }: ScenarioEditorProps) {
  const [isCreateVisible, setIsCreateVisible] = useState(false);
  const [isBackgroundColorPickerOpen, setIsBackgroundColorPickerOpen] =
    useState(false);
  const [scenario, setScenario] = useState<ScenarioProps>(() =>
    scenarioSchema.parse({}),
  );
  const { mutate: createScenario, isPending: isCreatingScenario } =
    useCreateScenario(() => closeCreateWindow());
  const { data: scenarios } = useScenarios();
  const { mutate: deleteScenario, isPending: isDeletingScenario } =
    useDeleteScenario();
  const { setAlert } = useAlert();
  const validate = useZodValidate(
    z.object({
      name: z.string().trim().min(1, "Digite um nome para o cenário."),
      width: z.number().int().positive("Informe uma largura válida."),
      height: z.number().int().positive("Informe uma altura válida."),
    }),
    scenario,
    () => createScenario(scenario),
  );

  const closeCreateWindow = () => {
    setIsCreateVisible(false);
    setIsBackgroundColorPickerOpen(false);
    setScenario(scenarioSchema.parse({}));
  };

  const removeScenario = (scenarioData: ScenarioProps) => {
    deleteScenario(scenarioData, {
      onError: (error) =>
        setAlert({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível excluir o cenário.",
        }),
    });
  };

  return (
    <SE.Body>
      <Window
        isVisible={isCreateVisible}
        onClose={closeCreateWindow}
        title="Criar novo cenário"
        width="400px"
        height="500px"
        icon={Icons.addIcon}
      >
        <SE.CreateBody>
          <SE.Form>
            <TitledInput
              title="Nome"
              obrigatory
              value={scenario.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setScenario((currentScenario) => ({
                  ...currentScenario,
                  name,
                }));
              }}
            />
            <TitledInput
              title="Largura"
              type="number"
              min="1"
              value={scenario.width}
              onChange={(event) => {
                const width = Number(event.currentTarget.value);
                setScenario((currentScenario) => ({
                  ...currentScenario,
                  width,
                }));
              }}
            />
            <TitledInput
              title="Altura"
              type="number"
              min="1"
              value={scenario.height}
              onChange={(event) => {
                const height = Number(event.currentTarget.value);
                setScenario((currentScenario) => ({
                  ...currentScenario,
                  height,
                }));
              }}
            />
            <TitledDiv title="Cor de fundo">
              <SE.ColorPickerButton
                type="button"
                onClick={() =>
                  setIsBackgroundColorPickerOpen((isOpen) => !isOpen)
                }
              >
                <SE.ColorPreview $color={scenario.backgroundColor} />
                {scenario.backgroundColor}
              </SE.ColorPickerButton>
            </TitledDiv>
            {isBackgroundColorPickerOpen && (
              <SE.ColorPickerPanel>
                <HexColorPicker
                  color={scenario.backgroundColor}
                  onChange={(backgroundColor) =>
                    setScenario((currentScenario) => ({
                      ...currentScenario,
                      backgroundColor,
                    }))
                  }
                />
              </SE.ColorPickerPanel>
            )}
          </SE.Form>
          <Button
            className="submit"
            type="button"
            disabled={!scenario.name.trim()}
            loading={isCreatingScenario}
            onClick={validate}
          >
            Criar cenário
          </Button>
        </SE.CreateBody>
      </Window>
      <SE.Header>
        <SE.HeaderButton
          type="button"
          title="Criar cenário"
          aria-label="Criar cenário"
          onClick={() => setIsCreateVisible(true)}
        >
          {Icons.addIcon}
        </SE.HeaderButton>
      </SE.Header>
      <SE.Workspace>
        {scenarios?.map((scenarioData) => (
          <SE.Card
            key={scenarioData.id}
            onClick={() => onOpenScenario(scenarioData.id)}
          >
            <SE.CardTitle title={scenarioData.name}>
              {scenarioData.name}
            </SE.CardTitle>
            <SE.CardDeleteButton
              type="button"
              title="Excluir cenário"
              aria-label={`Excluir ${scenarioData.name}`}
              disabled={isDeletingScenario}
              onClick={(event) => {
                event.stopPropagation();
                removeScenario(scenarioData);
              }}
            >
              {Icons.deleteIcon}
            </SE.CardDeleteButton>
          </SE.Card>
        ))}
      </SE.Workspace>
    </SE.Body>
  );
}
