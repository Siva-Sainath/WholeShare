import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export type ClaimStatus =
  | "DRAFT"
  | "BUYER_APPROVED"
  | "SUPPLIER_COUNTERED"
  | "SETTLED"
  | "REJECTED";

export interface DamageEvidence {
  photoUrls: string[];
  description: string;
}

export interface SupplierClaimResponse {
  action: "ACCEPT" | "COUNTER" | "REJECT";
  counterAmount?: number;
  notes?: string;
  respondedAt: string;
}

export interface DamageClaimRecord {
  claimId: string;
  clanId: string;
  memberId: string;
  orderId: string;
  captureId: string;
  damagedUnits: number;
  unitPrice: number;
  orderValue: number;
  claimedAmount: number;
  evidence: DamageEvidence;
  status: ClaimStatus;
  buyerApprovedAt: string | null;
  supplierResponse: SupplierClaimResponse | null;
  agreedRefundAmount: number | null;
  refundId: string | null;
  refundTransaction: Record<string, unknown> | null;
  reducedSupplierPayout: number | null;
  createdAt: string;
  updatedAt: string;
}

export class ClaimsStorage {
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "claim-records.json"
      );
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), "utf8");
    }
  }

  public getAll(): DamageClaimRecord[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data) as DamageClaimRecord[];
    } catch {
      return [];
    }
  }

  private saveAll(records: DamageClaimRecord[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }

  public getById(claimId: string): DamageClaimRecord | null {
    const records = this.getAll();
    return records.find((r) => r.claimId === claimId) || null;
  }

  public getByMember(clanId: string, memberId: string): DamageClaimRecord[] {
    const records = this.getAll();
    return records.filter((r) => r.clanId === clanId && r.memberId === memberId);
  }

  public getByCaptureId(captureId: string): DamageClaimRecord[] {
    const records = this.getAll();
    return records.filter((r) => r.captureId === captureId);
  }

  public create(record: DamageClaimRecord): void {
    const records = this.getAll();
    if (records.some((r) => r.claimId === record.claimId)) {
      throw new Error(`Claim with ID '${record.claimId}' already exists.`);
    }
    records.push(record);
    this.saveAll(records);
  }

  public update(record: DamageClaimRecord): void {
    const records = this.getAll();
    const index = records.findIndex((r) => r.claimId === record.claimId);
    if (index === -1) {
      throw new Error(`Cannot update non-existent claim '${record.claimId}'.`);
    }
    records[index] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    this.saveAll(records);
  }

  public clear(): void {
    this.saveAll([]);
  }
}

let defaultClaimsStorage: ClaimsStorage | null = null;

export function getClaimsStorage(): ClaimsStorage {
  if (!defaultClaimsStorage) {
    defaultClaimsStorage = new ClaimsStorage();
  }
  return defaultClaimsStorage;
}
