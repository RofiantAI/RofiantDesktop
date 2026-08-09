import type { AppSettings, Density, FontSize, Theme, UiScale } from "../../lib/settings";
import { Dropdown, Row, SegmentedControl, Toggle } from "./shared";

export function AppearanceSection({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <div>
      <h1 className="text-[18px] font-medium mb-6">Appearance</h1>
      <div>
        <Row label="Theme">
          <SegmentedControl<Theme>
            value={settings.theme}
            onChange={(v) => onChange({ theme: v })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
          />
        </Row>
        {/* <Row label="UI style" description="Visual style for panels, cards, and buttons">
          <Dropdown<UiStyle>
            value={settings.uiStyle}
            onChange={(v) => onChange({ uiStyle: v })}
            options={[
              { value: "default", label: "Default" },
              { value: "clay", label: "Clay" },
              { value: "glass", label: "Liquid Glass" },
            ]}
          />
        </Row> */}
        <Row label="Font size">
          <SegmentedControl<FontSize>
            value={settings.fontSize}
            onChange={(v) => onChange({ fontSize: v })}
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Large" },
            ]}
          />
        </Row>
        <Row label="Message density">
          <SegmentedControl<Density>
            value={settings.density}
            onChange={(v) => onChange({ density: v })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
            ]}
          />
        </Row>
        <Row label="Interface scale" description="Zoom the entire app in or out">
          <Dropdown<UiScale>
            value={settings.uiScale}
            onChange={(v) => onChange({ uiScale: v })}
            options={[
              { value: "80", label: "80%" },
              { value: "90", label: "90%" },
              { value: "100", label: "100%" },
              { value: "110", label: "110%" },
              { value: "125", label: "125%" },
              { value: "150", label: "150%" },
            ]}
          />
        </Row>
        <Row label="Show timestamps" description="Display time under each message">
          <Toggle checked={settings.showTimestamps} onChange={(v) => onChange({ showTimestamps: v })} />
        </Row>
        <Row label="Reduce motion" description="Turn off UI transitions and animations">
          <Toggle checked={settings.reduceMotion} onChange={(v) => onChange({ reduceMotion: v })} />
        </Row>
      </div>
    </div>
  );
}
