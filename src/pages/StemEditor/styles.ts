import styled from "styled-components";
import { Card as ScenarioCard } from "../ScenarioEditor/styles";

export const Card = styled(ScenarioCard)`
  justify-content: flex-start;
  gap: 8px;
`;

export const Actions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: auto;

  > button {
    flex: 1;
  }
`;
