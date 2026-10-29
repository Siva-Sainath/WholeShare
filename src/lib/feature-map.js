import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";

const FEATURE_DIRS = [
  resolve(process.cwd(), ".cursor/skills/verify-syndicate/references/features"),
  resolve(process.cwd(), ".cursor/skills/verify-paypal/references/features"),
  resolve(process.cwd(), ".cursor/skills/verify-ingestion/references/features"),
  resolve(process.cwd(), ".cursor/skills/verify-datalake/references/features")
];

export function parseFeatureMarkdown(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  let title = "";
  let summary = "";
  let currentSection = "";
  const subFeatures = [];
  let userPov = "";
  let driving = "";
  let gotchas = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("# Feature:")) {
      title = line.replace("# Feature:", "").trim();
      continue;
    }

    if (line.startsWith("## Sub-features")) {
      currentSection = "sub-features";
      continue;
    }

    if (line.startsWith("## How to get to it (user POV)")) {
      currentSection = "user-pov";
      continue;
    }

    if (line.startsWith("## Driving it with control-syndicate")) {
      currentSection = "driving";
      continue;
    }

    if (line.startsWith("## Gotchas")) {
      currentSection = "gotchas";
      continue;
    }

    if (!currentSection && line && !title.startsWith(line)) {
      summary = summary ? `${summary} ${line}` : line;
      continue;
    }

    if (currentSection === "sub-features") {
      if (line.startsWith("-")) {
        const match = line.match(/^-\s*`([^`]+)`:\s*(.+)$/);
        if (match) {
          subFeatures.push({ slug: match[1], description: match[2].trim() });
        } else {
          subFeatures.push({ slug: line.replace(/^-\s*/, ""), description: "" });
        }
      }
    } else if (currentSection === "user-pov") {
      if (line) {
        userPov = userPov ? `${userPov}\n${line}` : line;
      }
    } else if (currentSection === "driving") {
      if (line) {
        driving = driving ? `${driving}\n${line}` : line;
      }
    } else if (currentSection === "gotchas") {
      if (line) {
        gotchas = gotchas ? `${gotchas}\n${line}` : line;
      }
    }
  }

  const id = basename(filePath, ".md");
  return {
    id,
    title,
    summary,
    subFeatures,
    userPov,
    driving,
    gotchas
  };
}

export function loadAllFeatures() {
  const allFeatures = [];
  for (const dir of FEATURE_DIRS) {
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter(f => f.endsWith(".md") && f !== "README.md")
        .sort();
      for (const f of files) {
        allFeatures.push(parseFeatureMarkdown(resolve(dir, f)));
      }
    }
  }
  return allFeatures;
}

export function generateFeatureMapPromptContext() {
  const features = loadAllFeatures();

  const lines = [
    "=== WHOLESHARE PLATFORM FEATURE MAP ===",
    "Platform capabilities available on the web dashboard:"
  ];

  for (const feat of features) {
    lines.push(`- ${feat.title} (${feat.id}): ${feat.summary}`);
  }

  lines.push("=== END FEATURE MAP ===");
  return lines.join("\n");
}
