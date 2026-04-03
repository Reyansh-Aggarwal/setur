import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Boot from "./pages/Boot";
import Manager from "./pages/Manager";

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === null) return null; // brief flash prevention

  if (windowLabel === "boot") return <Boot />;

  return (
    <Manager />
  );
}

export default App;
