import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export type ApprovalStatus = "PENDING" | "APPROVED" | "DECLINED";

export interface DisputeOfferApproval {
  id: string;
  disputeId: string;
  clanId: string;
  memberId: string;
  captureId: string;
  supplierEmail: string;
  disputeAmount: number;
  claimedAmount: number;
  approvedOfferAmount: number;
  offerType: "REFUND" | "REFUND_WITH_RETURN";
  status: ApprovalStatus;
  supplierNotes?: string;
  reviewedAt: string | null;
  createdAt: string;
}

export class DisputeApprovalStorage {
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "dispute-approvals.json"
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

  public getAll(): DisputeOfferApproval[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data) as DisputeOfferApproval[];
    } catch {
      return [];
    }
  }

  private saveAll(records: DisputeOfferApproval[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }

  public getById(id: string): DisputeOfferApproval | null {
    const records = this.getAll();
    return records.find((r) => r.id === id) || null;
  }

  public getByDisputeId(disputeId: string): DisputeOfferApproval | null {
    const records = this.getAll();
    return records.find((r) => r.disputeId === disputeId) || null;
  }

  public create(record: DisputeOfferApproval): void {
    const records = this.getAll();
    if (records.some((r) => r.id === record.id)) {
      throw new Error(`Dispute approval with ID '${record.id}' already exists.`);
    }
    records.push(record);
    this.saveAll(records);
  }

  public update(record: DisputeOfferApproval): void {
    const records = this.getAll();
    const index = records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      throw new Error(`Cannot update non-existent dispute approval '${record.id}'.`);
    }
    records[index] = record;
    this.saveAll(records);
  }

  public clear(): void {
    this.saveAll([]);
  }
}

let defaultDisputeApprovalStorage: DisputeApprovalStorage | null = null;

export function getDisputeApprovalStorage(): DisputeApprovalStorage {
  if (!defaultDisputeApprovalStorage) {
    defaultDisputeApprovalStorage = new DisputeApprovalStorage();
  }
  return defaultDisputeApprovalStorage;
}
