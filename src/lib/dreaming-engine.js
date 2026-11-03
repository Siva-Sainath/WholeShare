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

        const tokenFact = `Onboarded with ACP Token [[${toolResult.tokenId}]] on ${new Date().toISOString().slice(0, 10)}.`;
        const spendFact = `Max authorized spend ceiling: ${toolResult.maxAuthorizedCents} cents.`;
        if (!facts.includes(tokenFact)) facts.push(tokenFact);
        if (!facts.includes(spendFact)) facts.push(spendFact);

        const existingAliases = Array.isArray(existing?.frontmatter?.aliases) ? existing.frontmatter.aliases : [];
        const mergedAliases = Array.from(new Set([
          ...existingAliases,
          smeId,
          toolArgs.name || "buyer",
          "sme",
          "procurement"
        ].filter(Boolean)));

        this.fs.writeEntity(
          smeId,
          "organization",
          mergedAliases,
          toolArgs.name || smeId,
          facts
        );
        if (!updates.some(u => u.entity === smeId && u.action === "SPAWNED_OR_UPDATED")) {
          updates.push({ entity: smeId, action: "SPAWNED_OR_UPDATED" });
        }
      }

      if (toolName === "authorize_paypal_escrow" && toolResult.coalitionId) {
        const cid = toolResult.coalitionId;
        const existing = this.fs.readEntity(cid);
        const facts = existing ? existing.body.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2)) : [];

        const escrowFacts = [
          `Escrow locked via Orders v2 soft authorizations on ${new Date().toISOString().slice(0, 10)}.`,
          `Total locked escrow: ${toolResult.totalEscrowCents} integer cents.`,
          `Participating members: ${toolResult.membersCount} verified buyers.`,
          "Status advanced to: LOCKED."
        ];
        for (const fact of escrowFacts) {
          if (!facts.includes(fact)) facts.push(fact);
        }

        this.fs.writeEntity(
          cid,
          "coalition",
          [cid, "coalition", "escrow", "locked"],
          `Group Escrow Coalition (${cid})`,
          facts
        );
        if (!updates.some(u => u.entity === cid && u.action === "ESCROW_LOCKED")) {
          updates.push({ entity: cid, action: "ESCROW_LOCKED" });
        }
      }

      if (toolName === "register_shipment_tracking" && toolResult.orderId) {
        const cid = "shipment_tracking_log";
        const existing = this.fs.readEntity(cid);
        const facts = existing ? existing.body.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2)) : [];

        const trackFacts = [
          `Carrier ${toolResult.carrier} tracking number ${toolResult.trackingNumber} registered for order ${toolResult.orderId}.`,
          `Fulfillment status: ${toolResult.statusLabel || "SHIPPED"} on ${new Date().toISOString().slice(0, 10)}.`
        ];
        for (const fact of trackFacts) {
          if (!facts.includes(fact)) facts.push(fact);
        }

        this.fs.writeEntity(
          cid,
          "tracking",
          [cid, "tracking", "logistics", toolResult.trackingNumber],
          `Fulfillment Tracking Record`,
          facts
        );
        if (!updates.some(u => u.entity === cid && u.action === "TRACKING_LOGGED")) {
          updates.push({ entity: cid, action: "TRACKING_LOGGED" });
        }
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
