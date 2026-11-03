import fs from "node:fs";
import path from "node:path";
import { SERVING_TARGET } from "../src/lib/serving-target.js";

const outputDir = path.resolve("artifacts");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, "serving-target.json");
fs.writeFileSync(outputPath, JSON.stringify(SERVING_TARGET, null, 2), "utf8");

console.log(`Serving target exported to ${outputPath}`);
console.log(`Model: ${SERVING_TARGET.hfId} (H=${SERVING_TARGET.hiddenSize}, V=${SERVING_TARGET.vocabSize}, L=${SERVING_TARGET.numLayers})`);

