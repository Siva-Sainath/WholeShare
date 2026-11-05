import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MemberDebtLiability } from "../domain/clan-governance.ts";

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
  private supplierFilePath: string;
  private memberFilePath: string;

  constructor(customSupplierPath?: string, customMemberPath?: string) {
    this.supplierFilePath =
      customSupplierPath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "supplier-debt-ledger.json"
      );
    this.memberFilePath =
      customMemberPath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "member-debt-ledger.json"
      );
    this.ensureFilesExist();
  }

  private ensureFilesExist(): void {
    for (const filePath of [this.supplierFilePath, this.memberFilePath]) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf8");
      }
    }
  }

  public getAll(): SupplierRepaymentDebt[] {
    try {
      const data = fs.readFileSync(this.supplierFilePath, "utf8");
      return JSON.parse(data) as SupplierRepaymentDebt[];
    } catch {
      return [];
    }
  }

  private saveAll(records: SupplierRepaymentDebt[]): void {
    fs.writeFileSync(this.supplierFilePath, JSON.stringify(records, null, 2), "utf8");
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

  // Member Debt Liability Storage
  public getAllMemberDebts(): MemberDebtLiability[] {
    try {
      const data = fs.readFileSync(this.memberFilePath, "utf8");
      return JSON.parse(data) as MemberDebtLiability[];
    } catch {
      return [];
    }
  }

  private saveAllMemberDebts(debts: MemberDebtLiability[]): void {
    fs.writeFileSync(this.memberFilePath, JSON.stringify(debts, null, 2), "utf8");
  }

  public getMemberDebts(smeId?: string): MemberDebtLiability[] {
    const debts = this.getAllMemberDebts();
    if (!smeId) return debts;
    return debts.filter((d) => d.smeId === smeId);
  }

  public getOutstandingDebtTotalCents(smeId: string): number {
    if (!smeId) return 0;
    const debts = this.getMemberDebts(smeId).filter((d) => d.status === "OUTSTANDING");
    return debts.reduce((sum, d) => sum + d.amountCents, 0);
  }

  public createMemberDebt(debt: MemberDebtLiability): void {
    const debts = this.getAllMemberDebts();
    if (debts.some((d) => d.debtId === debt.debtId)) {
      throw new Error(`Member debt with ID '${debt.debtId}' already exists.`);
    }
    debts.push(debt);
    this.saveAllMemberDebts(debts);
  }

  public settleMemberDebt(debtId: string): MemberDebtLiability | null {
    const debts = this.getAllMemberDebts();
    const index = debts.findIndex((d) => d.debtId === debtId);
    if (index === -1) return null;
    debts[index].status = "SETTLED";
    debts[index].updatedAt = new Date().toISOString();
    this.saveAllMemberDebts(debts);
    return debts[index];
  }

  public clear(): void {
    this.saveAll([]);
    this.saveAllMemberDebts([]);
  }
}

let defaultRepaymentStorage: RepaymentStorage | null = null;

export function getRepaymentStorage(): RepaymentStorage {
  if (!defaultRepaymentStorage) {
    defaultRepaymentStorage = new RepaymentStorage();
  }
  return defaultRepaymentStorage;
}
