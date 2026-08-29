import styled from "styled-components";
import { FormContainerBlueprint } from "../../components/DefaultComponents/styles";

export const Body = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`

export const Header = styled.div`
  height: 50px;
  width: 100%;
  background-color: var(--black-300);
  display: flex;
  align-items: center;
  padding: 0px 10px;
  box-sizing: border-box;
`

export const HeaderButton = styled.div`
  height: 30px;
  width: 60px;
  background-color: var(--black-200);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    height: 24px;
    width: 24px;
    color: var(--white);
  }

  &:hover {
    background-color: var(--black-400);
  }
`

export const Form = styled(FormContainerBlueprint)`
  padding-top: 10px;
`

export const Container = styled.div`
  flex: 1;
  display: flex;
  padding: 10px;
  box-sizing: border-box;
  gap: 10px;
`

export const CreateBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;

  .submit {
    width: 100%;
  }
`

export const Card = styled.div`
  height: 100px;
  width: 160px;
  background-color: var(--black-300);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background-color: var(--black-400);
  }
`

export const CardTitle = styled.div`

`