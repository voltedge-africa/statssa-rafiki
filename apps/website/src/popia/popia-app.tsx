import { PopiaNav } from "./nav.tsx";
import { MyRequestsView } from "./views/my-requests-view.tsx";
import { SubmitView } from "./views/submit-view.tsx";
import { TrackView } from "./views/track-view.tsx";

export type PopiaView = "submit" | "track" | "mine";

function viewFromPath(path: string): PopiaView {
  if (path === "/popia/track") return "track";
  if (path === "/popia/my") return "mine";
  return "submit";
}

export function PopiaApp({ path }: { path: string }) {
  const view = viewFromPath(path.toLowerCase());

  return (
    <div className="flex flex-col">
      <PopiaNav view={view} />
      {view === "submit" ? <SubmitView /> : null}
      {view === "track" ? <TrackView /> : null}
      {view === "mine" ? <MyRequestsView /> : null}
    </div>
  );
}
