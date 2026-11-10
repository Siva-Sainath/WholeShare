import React from "react";
import { Switch } from "@astryxdesign/core/Switch";
import { InfoTip } from "@astryxdesign/core/InfoTip";

export interface MosaicPermissions {
  allowAutonomousQuotePrep: boolean;
  allowAutonomousFilterSort: boolean;
  allowAutonomousDraftMessages: boolean;
  allowAutonomousResearch: boolean;
  allowAutonomousScheduleChanges: boolean;
}

interface Props {
  value: MosaicPermissions;
  onChange: (next: MosaicPermissions) => void;
  isDisabled?: boolean;
}

const ROWS: Array<{ key: keyof MosaicPermissions; label: string; description: string }> = [
  { key: "allowAutonomousFilterSort", label: "Search and filter groups", description: "Mosaic can open Discover, search the catalog and rank groups for you." },
  { key: "allowAutonomousQuotePrep", label: "Prepare pledge quotes", description: "Mosaic can calculate a quote and prefill a pledge. You still approve it in PayPal." },
  { key: "allowAutonomousDraftMessages", label: "Draft messages and claims", description: "Mosaic can write supplier messages and start a damage claim as a draft for you to review." },
  { key: "allowAutonomousResearch", label: "Research suppliers on the web", description: "Mosaic can open supplier and market pages in a cloud browser and show you what it read." },
  { key: "allowAutonomousScheduleChanges", label: "Change delivery schedules", description: "Mosaic can move delivery dates, set inspection windows and book receiving slots. Every change is logged and can be undone." }
];

export const PermissionsPanel: React.FC<Props> = ({ value, onChange, isDisabled }) => (
  <div className="ws-perms">
    {ROWS.map((row) => (
      <Switch
        key={row.key}
        label={row.label}
        description={row.description}
        value={value[row.key]}
        isDisabled={isDisabled}
        onChange={(checked) => onChange({ ...value, [row.key]: checked })}
      />
    ))}
    <div className="ws-perms-locked">
      <Switch label="Approve money movement" description="Always off. Only you can approve in PayPal." value={false} isDisabled disabledMessage="Mosaic can never approve payments." onChange={() => undefined} />
      <InfoTip label="Why these are locked" content="Pledges, captures and payouts always need your own approval. This cannot be turned on." />
    </div>
  </div>
);
