import React from "react";
import { Settings } from "../../types";
import { Stack } from "../../lib/stacks";
import { ModelPreset } from "../../lib/models";
import UnifiedInputPane from "../unified-input/UnifiedInputPane";
import { ProjectContextPanel } from "../../features/project-context/ProjectContextPanel";
import ModelPresetSelector from "../../features/model-preset/ModelPresetSelector";

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
  const handlePresetChange = (preset: ModelPreset) => {
    setSettings((prev) => ({ ...prev, modelPreset: preset }));
  };

  return (
    <div className="flex flex-col justify-center items-center py-8">
      {/* Pre-generation project context: surfaced here so users can point the
          Forge at their target repo before the first prompt. The brief we
          derive from the scan feeds into the very first generation's system
          prompt, so alignment with the app starts on turn one rather than
          only after an ugly first round. */}
      <div className="mb-4 w-full max-w-4xl px-4 space-y-3">
        <ProjectContextPanel variant="prominent" />
        {/* Generation preset: picks the 4-model slate used for the variant
            grid. Placed below the project context so users can scan their
            repo first (which is the higher-leverage decision) and adjust
            the preset right before they type their prompt. */}
        <ModelPresetSelector
          value={settings.modelPreset}
          onChange={handlePresetChange}
          variant="prominent"
        />
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
