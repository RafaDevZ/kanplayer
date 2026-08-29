import { Icon } from "@iconify/react/dist/iconify.js";
import { NoDataBody, NoDataContainer } from "./styles";

export default function NoData({ message }: { message: string }) {
  return(
    <NoDataBody>
      <NoDataContainer>
        <Icon icon="tabler:cloud-x" />
        {`${message}`}
      </NoDataContainer>
    </NoDataBody>
  )
}