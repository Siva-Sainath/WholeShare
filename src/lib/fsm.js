export const ALLOWED_TRANSITIONS = {
  FORMING: ["THRESHOLD_MET"],
  THRESHOLD_MET: ["AWAITING_STEP_UP", "LOCKED"],
  AWAITING_STEP_UP: ["LOCKED"],
  LOCKED: ["FULFILLING"],
  FULFILLING: ["SETTLED"],
  SETTLED: []
};

export function canTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(nextStatus);
}

export function transitionCoalitionState(coalition, nextStatus, metadata = {}) {
  const currentStatus = coalition.status;

  if (!canTransition(currentStatus, nextStatus)) {
    throw new Error(`Illegal state transition from ${currentStatus} to ${nextStatus}.`);
  }

  const updatedCoalition = {
    ...coalition,
    status: nextStatus,
    updatedAt: new Date().toISOString()
  };

  const auditEvent = {
    coalitionId: coalition.id,
    eventType: `COALITION_STATE_CHANGED_${nextStatus}`,
    fromStatus: currentStatus,
    toStatus: nextStatus,
    metadata,
    timestamp: new Date().toISOString()
  };

  return {
    coalition: updatedCoalition,
    auditEvent
  };
}
