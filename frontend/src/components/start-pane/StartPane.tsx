import React from "react";
import { Settings } from "../../types";
import { Stack } from "../../lib/stacks";
import UnifiedInputPane from "../unified-input/UnifiedInputPane";
import { ProjectContextPanel } from "../../features/project-context/ProjectContextPanel";

interface Props {
  doCreate: (
    images: string[],
    inputMode: "image" | "video",
    textPrompt?: string
  ) => void;
  doCreateFromText: (text: string) => void;
  importFromCode: (code: string, stack: Stack) => void;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

const StartPane: React.FC<Props> = ({
  doCreate,
  doCreateFromText,
  importFromCode,
  settings,
  setSettings,
}) => {
  return (
    <div className="flex flex-col justify-center items-center py-8">
      {/* Pre-generation project context: surfaced here so users can point the
          Forge at their target repo before the first prompt. The brief we
          derive from the scan feeds into the very first generation's system
          prompt, so alignment with the app starts on turn one rather than
          only after an ugly first round. */}
      <div className="mb-4 w-full max-w-4xl px-4">
        <ProjectContextPanel variant="prominent" />
      </div>
      <UnifiedInputPane
        doCreate={doCreate}
        doCreateFromText={doCreateFromText}
        importFromCode={importFromCode}
        settings={settings}
        setSettings={setSettings}
      />
    </div>
  );
};

export default StartPane;
