import ReactDOM from "react-dom/client";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";
import styled from "styled-components";
import "./index.css";
import { AlertProvider } from "./providers/AlertProvider";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import AppRoutes from "./routes";

const queryClient = new QueryClient();

const AppShell = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const NavigationHeader = styled.header`
  height: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  box-sizing: border-box;
  background-color: var(--black-100);
`;

const NavigationButton = styled.button<{ $active: boolean }>`
  height: 24px;
  border: 0;
  border-radius: 4px;
  padding: 0 8px;
  background-color: ${({ $active }) =>
    $active ? "var(--blue-200)" : "transparent"};
  color: var(--white);
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;

  &:hover {
    background-color: ${({ $active }) =>
      $active ? "var(--blue-200)" : "var(--black-300)"};
  }
`;

const PageArea = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
`;

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", preventNativeContextMenu);
    return () =>
      document.removeEventListener("contextmenu", preventNativeContextMenu);
  }, []);

  return (
    <AppShell>
      <NavigationHeader>
        <NavigationButton
          type="button"
          $active={location.pathname.startsWith("/timelines")}
          onClick={() => navigate("/timelines")}
        >
          Timelines
        </NavigationButton>
        <NavigationButton
          type="button"
          $active={location.pathname.startsWith("/scenarios")}
          onClick={() => navigate("/scenarios")}
        >
          Cenários
        </NavigationButton>
      </NavigationHeader>
      <PageArea>
        <AppRoutes />
      </PageArea>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AlertProvider>
    </QueryClientProvider>
  </AppErrorBoundary>,
);
