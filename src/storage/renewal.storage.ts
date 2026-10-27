import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export type CommodityCategory = "FAST" | "MEDIUM" | "SPECIALTY";
export type RenewalStatus =
  | "PENDING_CHECKIN"
  | "AWAITING_RENEWAL"
  | "RENEWED"
  | "OPTED_OUT"
  | "VOIDED";

export interface RenewalCheckInRecord {
  id: string;
  clanId: string;
  memberId: string;
  orderId: string;
  commodityCategory: CommodityCategory;
  checkInIntervalDays: number;
  lastCheckInAt: string;
  nextCheckInAt: string;
  optOutDeadlineAt: string;
  status: RenewalStatus;
  currentAuthorizationId: string;
  priorAuthorizationIds: string[];
  orderAmount: number;
  requiresQrStepUp: boolean;
  qrCodeBase64?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export class RenewalStorage {
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "renewal-records.json"
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

  public getAll(): RenewalCheckInRecord[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data) as RenewalCheckInRecord[];
    } catch {
      return [];
    }
  }

  private saveAll(records: RenewalCheckInRecord[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }

  public getById(id: string): RenewalCheckInRecord | null {
    const records = this.getAll();
    return records.find((r) => r.id === id) || null;
  }

  public getByMember(clanId: string, memberId: string): RenewalCheckInRecord | null {
    const records = this.getAll();
    return records.find((r) => r.clanId === clanId && r.memberId === memberId) || null;
  }

  public create(record: RenewalCheckInRecord): void {
    const records = this.getAll();
    if (records.some((r) => r.id === record.id)) {
      throw new Error(`Renewal record with ID '${record.id}' already exists.`);
    }
    records.push(record);
    this.saveAll(records);
  }

  public update(record: RenewalCheckInRecord): void {
    const records = this.getAll();
    const index = records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      throw new Error(`Cannot update non-existent renewal record '${record.id}'.`);
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

let defaultRenewalStorage: RenewalStorage | null = null;

export function getRenewalStorage(): RenewalStorage {
  if (!defaultRenewalStorage) {
    defaultRenewalStorage = new RenewalStorage();
  }
  return defaultRenewalStorage;
}
