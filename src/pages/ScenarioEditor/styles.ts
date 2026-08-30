import styled from "styled-components";
import {
  FormContainerBlueprint,
  HeaderBlueprint,
} from "../../components/DefaultComponents/styles";

export const Body = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const Header = styled(HeaderBlueprint)``;

export const HeaderButton = styled.button`
  height: 30px;
  width: 60px;
  border: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
  background-color: var(--black-200);
  color: var(--white);

  svg {
    height: 24px;
    width: 24px;
  }

  &:hover {
    background-color: var(--black-400);
  }
`;

export const CreateBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;

  .submit {
    width: 100%;
  }
`;

export const Form = styled(FormContainerBlueprint)`
  padding-top: 10px;
`;

export const ColorPickerButton = styled.button`
  width: 100%;
  padding: 0;
  border: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: var(--white);
  font: inherit;
  cursor: pointer;
  text-transform: uppercase;
`;

export const ColorPreview = styled.span<{ $color: string }>`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 1px solid var(--black-400);
  border-radius: 50%;
  background-color: ${({ $color }) => $color};
`;

export const ColorPickerPanel = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px;
  border: 1px solid var(--black-400);
  border-radius: 4px;
  background-color: var(--black-200);

  .react-colorful {
    width: 100%;
    height: 140px;
  }

  .react-colorful__saturation {
    border-radius: 3px 3px 0 0;
  }

  .react-colorful__hue {
    margin-top: 6px;
    border-radius: 3px;
  }
`;

export const Workspace = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  background-color: var(--black-200);
  display: flex;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
`;

export const Card = styled.button`
  height: 100px;
  width: 160px;
  border: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
  background-color: var(--black-300);
  color: var(--white);
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background-color: var(--black-400);
  }
`;

export const CardTitle = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
