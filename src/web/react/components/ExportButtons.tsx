import React, { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";

// Snapshot of any view. CSV downloads. The share link is a styled page an agent or a colleague can open.
export const ExportButtons: React.FC<{ component: string; filter?: unknown }> = ({ component, filter }) => {
  const [copied, setCopied] = useState(false);
  const query = (format: string) => `/api/v1/snapshot/${encodeURIComponent(component)}?format=${format}${filter ? `&filter=${encodeURIComponent(JSON.stringify(filter))}` : ""}`;
  return (
    <>
      <Button size="sm" variant="ghost" label="CSV" icon={<Download size={14} />} onClick={() => { window.location.assign(query("csv")); }} />
      <Button
        size="sm"
        variant="ghost"
        label={copied ? "Link copied" : "Share"}
        icon={<Share2 size={14} />}
        onClick={() => {
          void navigator.clipboard.writeText(`${window.location.origin}${query("html")}`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => window.open(query("html"), "_blank"));
        }}
      />
    </>
  );
};
