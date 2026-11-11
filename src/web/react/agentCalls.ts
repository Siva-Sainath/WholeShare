import { toolMeta } from "./toolMeta";

export interface AgentCall { agent: string; tool: string; at: string }

const EXTRA: Record<string, string> = {
  ask_mosaic: "Asked Mosaic",
  request_pledge_approval: "Asked for a PayPal approval link",
  query: "Looked up data",
  resolve: "Found a group",
  compare_groups: "Compared groups",
  join_group: "Prepared a pledge",
  track_shipment: "Checked a shipment"
};

// What an outside agent did, in words a person would use.
export function describeAgentCall(call: AgentCall): string {
  const label = EXTRA[call.tool] ?? toolMeta(call.tool).running;
  return `${call.agent || "An agent"}: ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}
