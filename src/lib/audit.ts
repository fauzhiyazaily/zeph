type AuditEvent = {
  event: string;
  userId?: string;
  route?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export function logAuditEvent(payload: AuditEvent) {
  const entry = {
    at: new Date().toISOString(),
    ...payload,
  };

  // In Story 1.4 baseline, console logging acts as auditable trace.
  // This will be replaced by persistent audit storage in later stories.
  console.warn("[AUDIT]", JSON.stringify(entry));
}
