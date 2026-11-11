import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

export type DeliverySource = "supplier" | "buyer" | "auto_confirmed" | "simulated";

export interface DeliveryRecord {
  id: string;
  clanId: string;
  memberId: string;
  trackingNumber: string;
  carrierName: string;
  supplierDeliveredAt: string | null;
  buyerDeliveredAt: string | null;
  inspectionWindowEndsAt: string | null;
  source: DeliverySource;
  conditionNotes: string | null;
  createdAt: string;
}

export class DeliveryStorage {
  private filePath: string;

  constructor(customFilePath?: string) {
    this.filePath =
      customFilePath ||
      path.join(
        ROOT_DIR,
        ".scratch",
        "developer-2-escrow-settlement-disputes",
        "delivery-records.json"
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

  public getAll(): DeliveryRecord[] {
    try {
      const data = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(data) as DeliveryRecord[];
    } catch {
      return [];
    }
  }

  private saveAll(records: DeliveryRecord[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }

  public getByMember(clanId: string, memberId: string): DeliveryRecord | null {
    const records = this.getAll();
    return records.find((r) => r.clanId === clanId && r.memberId === memberId) || null;
  }

  // Drops every record that belongs to one member, used when a generated workspace is replaced or cleared.
  public removeByMember(memberId: string): number {
    const records = this.getAll();
    const kept = records.filter((record) => record.memberId !== memberId);
    if (kept.length !== records.length) this.saveAll(kept);
    return records.length - kept.length;
  }

  public upsert(record: DeliveryRecord): void {
    const records = this.getAll();
    const index = records.findIndex(
      (r) => r.clanId === record.clanId && r.memberId === record.memberId
    );
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }
    this.saveAll(records);
  }

  public clear(): void {
    this.saveAll([]);
  }
}

let defaultStorage: DeliveryStorage | null = null;

export function getDeliveryStorage(): DeliveryStorage {
  if (!defaultStorage) {
    defaultStorage = new DeliveryStorage();
  }
  return defaultStorage;
}
