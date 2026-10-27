import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type IdempotencyStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "NEEDS_REVIEW";
export type OperationType = "AUTHORIZATION" | "CAPTURE" | "REFUND" | "VOID" | "PAYOUT" | "DISPUTE_OFFER";

export interface IdempotencyRecord {
  id: string;
  operationKey: string;
  operationType: OperationType | string;
  clanId: string;
  memberId: string | null;
  stage: string;
  referenceId: string | null;
  paypalReference: string | null;
  status: IdempotencyStatus;
  firstSentAt: string;
  lastCheckedAt: string;
  recheckCount: number;
  createdAt: string;
}

export type CreateIdempotencyRecordInput = {
  operationKey: string;
  operationType: OperationType | string;
  clanId: string;
  memberId?: string | null;
  stage: string;
  referenceId?: string | null;
  paypalReference?: string | null;
  status?: IdempotencyStatus;
  firstSentAt?: string;
  lastCheckedAt?: string;
  recheckCount?: number;
  createdAt?: string;
};

export class IdempotencyRecordConflictError extends Error {
  readonly operationKey: string;

  constructor(operationKey: string, message: string) {
    super(`[IdempotencyConflict]: ${message} (key: ${operationKey})`);
    this.name = "IdempotencyRecordConflictError";
    this.operationKey = operationKey;
  }
}

export class IdempotencyStorage {
  private ledgerPath: string;
  private records: Map<string, IdempotencyRecord> = new Map();
  private loaded = false;

  constructor(customPath?: string) {
    this.ledgerPath =
      customPath ||
      path.resolve(
        process.cwd(),
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "idempotency-ledger.json"
      );
  }

  public getLedgerPath(): string {
    return this.ledgerPath;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    if (fs.existsSync(this.ledgerPath)) {
      try {
        const raw = fs.readFileSync(this.ledgerPath, "utf8");
        const list: IdempotencyRecord[] = JSON.parse(raw);
        this.records.clear();
        for (const item of list) {
          this.records.set(item.operationKey, item);
        }
      } catch (err) {
        console.warn(`[WARN] Failed to parse idempotency ledger from ${this.ledgerPath}, starting fresh:`, err);
        this.records.clear();
      }
    } else {
      this.persistSync();
    }

    this.loaded = true;
  }

  private persistSync(): void {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const items = Array.from(this.records.values());
    fs.writeFileSync(this.ledgerPath, JSON.stringify(items, null, 2), "utf8");
  }

  public async get(operationKey: string): Promise<IdempotencyRecord | null> {
    this.ensureLoaded();
    const record = this.records.get(operationKey);
    return record ? { ...record } : null;
  }

  public async getById(id: string): Promise<IdempotencyRecord | null> {
    this.ensureLoaded();
    for (const record of this.records.values()) {
      if (record.id === id) {
        return { ...record };
      }
    }
    return null;
  }

  public async create(input: CreateIdempotencyRecordInput): Promise<IdempotencyRecord> {
    this.ensureLoaded();

    const existing = this.records.get(input.operationKey);
    if (existing) {
      throw new IdempotencyRecordConflictError(
        input.operationKey,
        `Record with operationKey '${input.operationKey}' already exists with status '${existing.status}'`
      );
    }

    const now = new Date().toISOString();
    const record: IdempotencyRecord = {
      id: crypto.randomUUID(),
      operationKey: input.operationKey,
      operationType: input.operationType,
      clanId: input.clanId,
      memberId: input.memberId ?? null,
      stage: input.stage,
      referenceId: input.referenceId ?? null,
      paypalReference: input.paypalReference ?? null,
      status: input.status || "PENDING",
      firstSentAt: input.firstSentAt || now,
      lastCheckedAt: input.lastCheckedAt || now,
      recheckCount: input.recheckCount ?? 0,
      createdAt: input.createdAt || now,
    };

    this.records.set(record.operationKey, record);
    this.persistSync();

    return { ...record };
  }

  public async update(
    operationKey: string,
    updates: Partial<Omit<IdempotencyRecord, "id" | "operationKey" | "createdAt">>
  ): Promise<IdempotencyRecord> {
    this.ensureLoaded();

    const existing = this.records.get(operationKey);
    if (!existing) {
      throw new Error(`Cannot update idempotency record: key '${operationKey}' does not exist.`);
    }

    const now = new Date().toISOString();
    const updated: IdempotencyRecord = {
      ...existing,
      ...updates,
      lastCheckedAt: updates.lastCheckedAt || now,
    };

    this.records.set(operationKey, updated);
    this.persistSync();

    return { ...updated };
  }

  public async list(filter?: {
    clanId?: string;
    status?: IdempotencyStatus;
    memberId?: string;
  }): Promise<IdempotencyRecord[]> {
    this.ensureLoaded();
    let items = Array.from(this.records.values());

    if (filter?.clanId) {
      items = items.filter((r) => r.clanId === filter.clanId);
    }
    if (filter?.status) {
      items = items.filter((r) => r.status === filter.status);
    }
    if (filter?.memberId) {
      items = items.filter((r) => r.memberId === filter.memberId);
    }

    return items.map((r) => ({ ...r }));
  }

  public async count(): Promise<number> {
    this.ensureLoaded();
    return this.records.size;
  }

  public getAll(): IdempotencyRecord[] {
    this.ensureLoaded();
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  public getRecord(operationKey: string): IdempotencyRecord | null {
    this.ensureLoaded();
    const record = this.records.get(operationKey);
    return record ? { ...record } : null;
  }

  public createRecord(input: CreateIdempotencyRecordInput): IdempotencyRecord {
    this.ensureLoaded();
    const existing = this.records.get(input.operationKey);
    if (existing) {
      throw new IdempotencyRecordConflictError(
        input.operationKey,
        `Record with operationKey '${input.operationKey}' already exists with status '${existing.status}'`
      );
    }
    const now = new Date().toISOString();
    const record: IdempotencyRecord = {
      id: crypto.randomUUID(),
      operationKey: input.operationKey,
      operationType: input.operationType,
      clanId: input.clanId,
      memberId: input.memberId ?? null,
      stage: input.stage,
      referenceId: input.referenceId ?? null,
      paypalReference: input.paypalReference ?? null,
      status: input.status || "PENDING",
      firstSentAt: input.firstSentAt || now,
      lastCheckedAt: input.lastCheckedAt || now,
      recheckCount: input.recheckCount ?? 0,
      createdAt: input.createdAt || now,
    };
    this.records.set(record.operationKey, record);
    this.persistSync();
    return { ...record };
  }

  public updateStatus(
    operationKey: string,
    status: IdempotencyStatus,
    paypalReference?: string | null
  ): IdempotencyRecord {
    this.ensureLoaded();
    const existing = this.records.get(operationKey);
    if (!existing) {
      throw new Error(`Cannot update status: record '${operationKey}' does not exist.`);
    }
    const now = new Date().toISOString();
    const updated: IdempotencyRecord = {
      ...existing,
      status,
      paypalReference:
        paypalReference !== undefined ? paypalReference : existing.paypalReference,
      lastCheckedAt: now,
    };
    this.records.set(operationKey, updated);
    this.persistSync();
    return { ...updated };
  }

  public incrementRecheck(operationKey: string): IdempotencyRecord {
    this.ensureLoaded();
    const existing = this.records.get(operationKey);
    if (!existing) {
      throw new Error(`Cannot increment recheck: record '${operationKey}' does not exist.`);
    }
    const now = new Date().toISOString();
    const updated: IdempotencyRecord = {
      ...existing,
      recheckCount: existing.recheckCount + 1,
      lastCheckedAt: now,
    };
    this.records.set(operationKey, updated);
    this.persistSync();
    return { ...updated };
  }

  public async clear(): Promise<void> {
    this.ensureLoaded();
    this.records.clear();
    this.persistSync();
  }

  public async verifySchema(): Promise<boolean> {
    this.ensureLoaded();
    const REQUIRED_KEYS: (keyof IdempotencyRecord)[] = [
      "id",
      "operationKey",
      "operationType",
      "clanId",
      "memberId",
      "stage",
      "referenceId",
      "paypalReference",
      "status",
      "firstSentAt",
      "lastCheckedAt",
      "recheckCount",
      "createdAt",
    ];

    for (const record of this.records.values()) {
      for (const req of REQUIRED_KEYS) {
        if (!(req in record)) {
          throw new Error(`Idempotency record ${record.id} is missing required field '${req}'`);
        }
      }
    }

    return true;
  }
}

let defaultStorageInstance: IdempotencyStorage | null = null;

export function getIdempotencyStorage(customPath?: string): IdempotencyStorage {
  if (customPath) {
    return new IdempotencyStorage(customPath);
  }
  if (!defaultStorageInstance) {
    defaultStorageInstance = new IdempotencyStorage();
  }
  return defaultStorageInstance;
}
