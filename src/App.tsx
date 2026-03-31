import "./App.css";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Boot from "./pages/Boot";
import Manager from "./pages/Manager";
import Builder from "./pages/Builder";

type View =
  | { type: "manager" }
  | { type: "builder"; presetId?: string };

function MainWindow() {
  const [view, setView] = useState<View>({ type: "manager" });

  if (view.type === "builder") {
    return (
      <Builder
        presetId={view.presetId}
        onSaved={() => setView({ type: "manager" })}
        onCancel={() => setView({ type: "manager" })}
      />
    );
  }

  return (
    <Manager
      onCreateNew={() => setView({ type: "builder" })}
      onEdit={(id) => setView({ type: "builder", presetId: id })}
    />
  );
}

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === null) return null; // brief flash prevention

  if (windowLabel === "boot") return <Boot />;

  return (
    <div className="w-screen h-screen">
      <MainWindow />
    </div>
  );
}

export default App;
