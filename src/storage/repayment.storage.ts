import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export type RepaymentStatus = "OUTSTANDING" | "PARTIALLY_REPAID" | "SETTLED" | "WRITTEN_OFF";

export interface SupplierRepaymentDebt {
  id: string;
  clanId: string;
  memberId: string;
  disputeId: string;
  captureId: string;
  supplierEmail: string;
  disputeAmount: number;
  debtAmount: number;
  reason: string;
  status: RepaymentStatus;
  repaidAmount: number;
  createdAt: string;
  updatedAt: string;
}

export class RepaymentStorage {
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "supplier-debt-ledger.json"
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

  public getAll(): SupplierRepaymentDebt[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data) as SupplierRepaymentDebt[];
    } catch {
      return [];
    }
  }

  private saveAll(records: SupplierRepaymentDebt[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }

  public getById(id: string): SupplierRepaymentDebt | null {
    const records = this.getAll();
    return records.find((r) => r.id === id) || null;
  }

  public getBySupplier(email: string): SupplierRepaymentDebt[] {
    const records = this.getAll();
    return records.filter((r) => r.supplierEmail === email);
  }

  public getByDisputeId(disputeId: string): SupplierRepaymentDebt | null {
    const records = this.getAll();
    return records.find((r) => r.disputeId === disputeId) || null;
  }

  public create(record: SupplierRepaymentDebt): void {
    const records = this.getAll();
    if (records.some((r) => r.id === record.id)) {
      throw new Error(`Supplier repayment debt with ID '${record.id}' already exists.`);
    }
    records.push(record);
    this.saveAll(records);
  }

  public update(record: SupplierRepaymentDebt): void {
    const records = this.getAll();
    const index = records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      throw new Error(`Cannot update non-existent supplier repayment debt '${record.id}'.`);
    }
    records[index] = record;
    this.saveAll(records);
  }

  public clear(): void {
    this.saveAll([]);
  }
}

let defaultRepaymentStorage: RepaymentStorage | null = null;

export function getRepaymentStorage(): RepaymentStorage {
  if (!defaultRepaymentStorage) {
    defaultRepaymentStorage = new RepaymentStorage();
  }
  return defaultRepaymentStorage;
}
