import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ClanConstitution,
  type GovernanceProposal,
  type ClanVote,
  DEFAULT_CLAN_RULES
} from "../domain/clan-governance.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

interface PersistedGovernanceData {
  constitutions: Record<string, ClanConstitution>;
  proposals: Record<string, GovernanceProposal>;
  votes: Record<string, ClanVote[]>;
}

export class ClanGovernanceStorage {
  private filePath: string | null;
  private constitutions = new Map<string, ClanConstitution>();
  private proposals = new Map<string, GovernanceProposal>();
  private votes = new Map<string, ClanVote[]>();

  constructor(customFilePath?: string | null) {
    if (customFilePath === null) {
      this.filePath = null;
    } else {
      this.filePath =
        customFilePath ||
        path.join(
          ROOT_DIR,
          ".scratch",
          "developer-2-escrow-settlement-disputes",
          "clan-governance.json"
        );
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const parsed: PersistedGovernanceData = JSON.parse(raw);
        if (parsed.constitutions) {
          for (const [k, v] of Object.entries(parsed.constitutions)) {
            this.constitutions.set(k, v);
          }
        }
        if (parsed.proposals) {
          for (const [k, v] of Object.entries(parsed.proposals)) {
            this.proposals.set(k, v);
          }
        }
        if (parsed.votes) {
          for (const [k, v] of Object.entries(parsed.votes)) {
            this.votes.set(k, v);
          }
        }
      }
    } catch {
      // Ignore disk load errors
    }
  }

  private saveToDisk(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: PersistedGovernanceData = {
        constitutions: Object.fromEntries(this.constitutions),
        proposals: Object.fromEntries(this.proposals),
        votes: Object.fromEntries(this.votes)
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Ignore disk save errors
    }
  }

  public getConstitution(coalitionId: string): ClanConstitution {
    let constitution = this.constitutions.get(coalitionId);
    if (!constitution) {
      constitution = {
        coalitionId,
        version: 1,
        rules: { ...DEFAULT_CLAN_RULES },
        updatedAt: new Date().toISOString()
      };
      this.constitutions.set(coalitionId, constitution);
      this.saveToDisk();
    }
    return constitution;
  }

  public saveConstitution(constitution: ClanConstitution): ClanConstitution {
    this.constitutions.set(constitution.coalitionId, { ...constitution });
    this.saveToDisk();
    return constitution;
  }

  public saveProposal(proposal: GovernanceProposal): GovernanceProposal {
    this.proposals.set(proposal.id, { ...proposal });
    this.saveToDisk();
    return proposal;
  }

  public getProposal(proposalId: string): GovernanceProposal | null {
    const prop = this.proposals.get(proposalId);
    return prop ? { ...prop } : null;
  }

  public listProposals(coalitionId: string): GovernanceProposal[] {
    return Array.from(this.proposals.values())
      .filter((p) => p.coalitionId === coalitionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public saveVote(vote: ClanVote): void {
    const existing = this.votes.get(vote.proposalId) || [];
    existing.push({ ...vote });
    this.votes.set(vote.proposalId, existing);
    this.saveToDisk();
  }

  public getVotes(proposalId: string): ClanVote[] {
    const list = this.votes.get(proposalId);
    return list ? [...list] : [];
  }

  public hasMemberVoted(proposalId: string, smeId: string): boolean {
    const list = this.votes.get(proposalId) || [];
    return list.some((v) => v.smeId === smeId);
  }

  public reset(): void {
    this.constitutions.clear();
    this.proposals.clear();
    this.votes.clear();
    this.saveToDisk();
  }
}

let globalStorage: ClanGovernanceStorage | null = null;

export function getClanGovernanceStorage(): ClanGovernanceStorage {
  if (!globalStorage) {
    globalStorage = new ClanGovernanceStorage();
  }
  return globalStorage;
}
