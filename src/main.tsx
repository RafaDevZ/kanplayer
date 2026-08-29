import ReactDOM from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AlertProvider } from "./providers/AlertProvider";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import Editor from "./pages/MusicEditor";
import TimelineEdit from "./pages/TimelineEdit";

const queryClient = new QueryClient();

function App() {
  const [timelineTrackPath, setTimelineTrackPath] = useState<string>();

  if (timelineTrackPath) {
    return (
      <TimelineEdit
        trackPath={timelineTrackPath}
        onBack={() => setTimelineTrackPath(undefined)}
      />
    );
  }

  return <Editor onOpenTimeline={setTimelineTrackPath} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <App />
      </AlertProvider>
    </QueryClientProvider>
  </AppErrorBoundary>,
);
