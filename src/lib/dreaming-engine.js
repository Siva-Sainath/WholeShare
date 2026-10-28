import { instinctFs } from "./instinct-fs.js";

export class InstinctDreamingEngine {
  constructor(fs = instinctFs) {
    this.fs = fs;
  }

  async reconcileSession(sessionTrajectory) {
    if (!sessionTrajectory || !Array.isArray(sessionTrajectory.steps)) {
      return { reconciled: false, reason: "No valid trajectory steps to reconcile." };
    }

    const updates = [];
    const sessionId = sessionTrajectory.id || `sess_${Date.now()}`;

    for (const step of sessionTrajectory.steps) {
      const toolName = step.toolName;
      const toolArgs = step.toolArgs || {};
      const toolResult = step.toolResult || {};

      if (toolName === "spawn_sme_mandate" && toolResult.smeId) {
        const smeId = toolResult.smeId;
        const existing = this.fs.readEntity(smeId);
        const facts = existing ? existing.body.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2)) : [];

        facts.push(`Onboarded with ACP Token [[${toolResult.tokenId}]] on ${new Date().toISOString().slice(0, 10)}.`);
        facts.push(`Max authorized spend ceiling: ${toolResult.maxAuthorizedCents} cents.`);

        this.fs.writeEntity(
          smeId,
          "organization",
          [smeId, toolArgs.name || "buyer", "sme", "procurement"],
          toolArgs.name || smeId,
          facts
        );
        updates.push({ entity: smeId, action: "SPAWNED_OR_UPDATED" });
      }

      if (toolName === "authorize_paypal_escrow" && toolResult.coalitionId) {
        const cid = toolResult.coalitionId;
        const facts = [
          `Escrow locked via Orders v2 soft authorizations on ${new Date().toISOString().slice(0, 10)}.`,
          `Total locked escrow: ${toolResult.totalEscrowCents} integer cents.`,
          `Participating members: ${toolResult.membersCount} verified buyers.`,
          "Status advanced to: LOCKED."
        ];

        this.fs.writeEntity(
          cid,
          "coalition",
          [cid, "coalition", "escrow", "locked"],
          `Group Escrow Coalition (${cid})`,
          facts
        );
        updates.push({ entity: cid, action: "ESCROW_LOCKED" });
      }

      if (toolName === "register_shipment_tracking" && toolResult.orderId) {
        const cid = "shipment_tracking_log";
        const facts = [
          `Carrier ${toolResult.carrier} tracking number ${toolResult.trackingNumber} registered for order ${toolResult.orderId}.`,
          `Fulfillment status: ${toolResult.statusLabel || "SHIPPED"} on ${new Date().toISOString().slice(0, 10)}.`
        ];

        this.fs.writeEntity(
          cid,
          "tracking",
          [cid, "tracking", "logistics", toolResult.trackingNumber],
          `Fulfillment Tracking Record`,
          facts
        );
        updates.push({ entity: cid, action: "TRACKING_LOGGED" });
      }
    }

    let gitCommit = { committed: false };
    if (updates.length > 0) {
      gitCommit = this.fs.commitMemory(`dream: reconcile session ${sessionId} (${updates.length} updates)`);
    }

    return {
      reconciled: true,
      sessionId,
      updatesCount: updates.length,
      updates,
      gitCommit
    };
  }
}

export const dreamingEngine = new InstinctDreamingEngine();
