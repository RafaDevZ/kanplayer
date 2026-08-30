import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import MusicEditor from "../pages/MusicEditor";
import ScenarioEditor from "../pages/ScenarioEditor";
import ScenarioEdit from "../pages/ScenarioEdit";
import TimelineEdit from "../pages/TimelineEdit";

function TimelineEditRoute() {
  const navigate = useNavigate();
  const { trackPath } = useParams();
  if (!trackPath) return <Navigate to="/timelines" replace />;
  return <TimelineEdit trackPath={trackPath} onBack={() => navigate("/timelines")} />;
}

function ScenarioEditRoute() {
  const navigate = useNavigate();
  const { scenarioId } = useParams();
  const parsedScenarioId = Number(scenarioId);
  if (!Number.isInteger(parsedScenarioId) || parsedScenarioId <= 0)
    return <Navigate to="/scenarios" replace />;
  return (
    <ScenarioEdit
      scenarioId={parsedScenarioId}
      onBack={() => navigate("/scenarios")}
    />
  );
}

export default function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/timelines"
        element={
          <MusicEditor
            onOpenTimeline={(trackPath) =>
              navigate(`/timelines/${encodeURIComponent(trackPath)}`)
            }
          />
        }
      />
      <Route path="/timelines/:trackPath" element={<TimelineEditRoute />} />
      <Route
        path="/scenarios"
        element={
          <ScenarioEditor
            onOpenScenario={(scenarioId) => navigate(`/scenarios/${scenarioId}`)}
          />
        }
      />
      <Route path="/scenarios/:scenarioId" element={<ScenarioEditRoute />} />
      <Route path="*" element={<Navigate to="/scenarios" replace />} />
    </Routes>
  );
}
