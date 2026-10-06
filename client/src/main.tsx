import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Back-compat: links sent before the switch to path-based routing look like
// https://thefvc.is/#/auth?invite=TOKEN. Rewrite the fragment into a real
// path before the router mounts, so invites already sent out keep working.
if (location.hash.startsWith("#/")) {
  history.replaceState(null, "", location.hash.slice(1));
}

createRoot(document.getElementById("root")!).render(<App />);
