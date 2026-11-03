import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { storageDriver } from "./storage-driver.js";

const MEMORY_BASE_DIR = resolve(process.cwd(), "data/memory");
const ENTITIES_DIR = resolve(MEMORY_BASE_DIR, "entities");
const KNOWLEDGE_DIR = resolve(MEMORY_BASE_DIR, "knowledge");

function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function parseMarkdownWithFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content.trim() };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content.trim() };
  }

  const rawFrontmatter = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 4).trim();

  const frontmatter = {};
  for (const line of rawFrontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      if (value.startsWith("[") && value.endsWith("]")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map(v => v.trim().replace(/^['"]|['"]$/g, ""));
      } else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (!isNaN(Number(value)) && value.length > 0) {
        value = Number(value);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export function serializeMarkdownWithFrontmatter(frontmatter, body) {
  const lines = ["---"];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.map(v => `"${v}"`).join(", ")}]`);
    } else if (typeof val === "string") {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push(body.trim());
  lines.push("");
  return lines.join("\n");
}

export class InstinctFileSystem {
  constructor(baseDir = MEMORY_BASE_DIR) {
    this.baseDir = baseDir;
    this.entitiesDir = resolve(baseDir, "entities");
    this.knowledgeDir = resolve(baseDir, "knowledge");
    this.initDefaultMemory();
  }

  initDefaultMemory() {
    ensureDirectory(this.entitiesDir);
    ensureDirectory(this.knowledgeDir);

    const defaultEntities = [
      {
        id: "sme_austin_01",
        type: "organization",
        aliases: ["austin", "bakery", "artisan", "flour", "sourdough"],
        title: "Austin Artisan Bakery",
        facts: [
          "Commercial artisan bakery producing organic sourdough in Austin, Texas.",
          "Hard spend ceiling is 150000 cents ($1,500.00 USD).",
          "Step-up KYC verification required for any order exceeding 100000 cents ($1,000.00 USD).",
          "Credit tier is verified as Tier A (KYB verified).",
          "Active group purchasing coalition: [[coalition_flour_01]]"
        ]
      },
      {
        id: "sme_bean_02",
        type: "organization",
        aliases: ["bean", "leaf", "coffee", "roasters", "espresso"],
        title: "Bean & Leaf Coffee Roasters",
        facts: [
          "Specialty commercial coffee roaster and cafe supplier in Seattle, Washington.",
          "Hard spend ceiling is 300000 cents ($3,000.00 USD).",
          "Step-up KYC verification required for any order exceeding 200000 cents ($2,000.00 USD).",
          "Credit tier is verified as Tier A.",
          "Active group purchasing coalition: [[coalition_flour_01]]"
        ]
      },
      {
        id: "sme_green_03",
        type: "organization",
        aliases: ["greenleaf", "organics", "cafe", "bistro", "pastry"],
        title: "GreenLeaf Organics Cafe",
        facts: [
          "Organic cafe and farm-to-table bistro in Portland, Oregon.",
          "Hard spend ceiling is 100000 cents ($1,000.00 USD).",
          "Step-up KYC verification required for any order exceeding 80000 cents ($800.00 USD).",
          "Credit tier is verified as Tier A."
        ]
      }
    ];

    for (const ent of defaultEntities) {
      const filePath = resolve(this.entitiesDir, `${ent.id}.md`);
      if (!existsSync(filePath)) {
        const body = [`# ${ent.title} (${ent.id})`, ""].concat(
          ent.facts.map(f => `- ${f}`)
        ).join("\n");
        const content = serializeMarkdownWithFrontmatter(
          {
            id: ent.id,
            type: ent.type,
            aliases: ent.aliases,
            updatedAt: new Date().toISOString()
          },
          body
        );
        writeFileSync(filePath, content, "utf-8");
      }
    }

    const defaultCatalog = [
      {
        id: "catalog_flour_50lb",
        type: "catalog",
        aliases: ["flour", "organic-flour-50lb", "wheat", "grain", "bakery-raw"],
        title: "Golden Fields Organic Hard Red Wheat Flour (50 lb Bag)",
        facts: [
          "Wholesale base price is 1000 cents ($10.00 USD) per unit.",
          "Tier 1 discount: 100+ units at 1000 cents ($10.00 USD) with 0% discount.",
          "Tier 2 discount: 500+ units at 720 cents ($7.20 USD) with 28% discount.",
          "Tier 3 discount: 1000+ units at 580 cents ($5.80 USD) with 42% discount.",
          "Standard MOQ for producer batch run is 500 units."
        ]
      }
    ];

    for (const cat of defaultCatalog) {
      const filePath = resolve(this.knowledgeDir, `${cat.id}.md`);
      if (!existsSync(filePath)) {
        const body = [`# ${cat.title} (${cat.id})`, ""].concat(
          cat.facts.map(f => `- ${f}`)
        ).join("\n");
        const content = serializeMarkdownWithFrontmatter(
          {
            id: cat.id,
            type: cat.type,
            aliases: cat.aliases,
            updatedAt: new Date().toISOString()
          },
          body
        );
        writeFileSync(filePath, content, "utf-8");
      }
    }
  }

  grepMemory(query) {
    const q = (query || "").toLowerCase().trim();
    const results = [];
    const scanDirs = [this.entitiesDir, this.knowledgeDir];

    for (const dir of scanDirs) {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const filePath = join(dir, file);
        const raw = readFileSync(filePath, "utf-8");
        const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);

        const idMatches = (frontmatter.id || "").toLowerCase().includes(q);
        const aliasMatches = Array.isArray(frontmatter.aliases) &&
          frontmatter.aliases.some(a => String(a).toLowerCase().includes(q));
        const bodyMatches = body.toLowerCase().includes(q);

        if (idMatches || aliasMatches || bodyMatches) {
          results.push({
            id: frontmatter.id || file.replace(".md", ""),
            type: frontmatter.type || "unknown",
            aliases: frontmatter.aliases || [],
            filePath,
            snippet: body.slice(0, 300)
          });
        }
      }
    }

    return results;
  }

  readEntity(id) {
    const cleanId = id.replace(".md", "").replace(/^\[\[|\]\]$/g, "");
    const scanDirs = [this.entitiesDir, this.knowledgeDir];

    for (const dir of scanDirs) {
      const filePath = resolve(dir, `${cleanId}.md`);
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);

        const links = [];
        const linkMatches = body.matchAll(/\[\[(.*?)\]\]/g);
        for (const match of linkMatches) {
          links.push(match[1]);
        }

        return {
          id: cleanId,
          frontmatter,
          body,
          links,
          filePath
        };
      }
    }

    return null;
  }

  writeEntity(id, type, aliases, title, facts, extraFrontmatter = {}, customBody = null) {
    const isEntity = type === "organization" || type === "person";
    const targetDir = isEntity ? this.entitiesDir : this.knowledgeDir;
    ensureDirectory(targetDir);

    const filePath = resolve(targetDir, `${id}.md`);
    const factsList = Array.isArray(facts) ? facts : [];
    const body = customBody || [`# ${title} (${id})`, ""].concat(
      factsList.map(f => `- ${f}`)
    ).join("\n");

    const content = serializeMarkdownWithFrontmatter(
      {
        id,
        type,
        aliases: Array.isArray(aliases) ? aliases : [],
        ...extraFrontmatter,
        updatedAt: new Date().toISOString()
      },
      body
    );

    storageDriver.writeAtomic(filePath, content);
    return { id, filePath, content };
  }

  commitMemory(message) {
    try {
      execSync("git add data/memory/", { cwd: process.cwd(), stdio: "ignore" });
      execSync(`git commit -m "${message}"`, { cwd: process.cwd(), stdio: "ignore" });
      return { committed: true };
    } catch {
      return { committed: false, reason: "No changes to commit or git working tree clean." };
    }
  }
}

export const instinctFs = new InstinctFileSystem();
