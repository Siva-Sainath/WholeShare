import { copyFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = resolve('/Users/siva/.gemini/antigravity-ide/scratch/wholeshare');
const htmlPath = resolve(projectRoot, 'docs/SYNDICATE_SPEC.html');
const pdfPath = resolve(projectRoot, 'docs/SYNDICATE_SPEC.pdf');
const artifactDir = '/Users/siva/.gemini/antigravity-ide/brain/4928d23e-8385-4bb9-869b-d60a8d668b2d';
const artifactPdfPath = resolve(artifactDir, 'SYNDICATE_SPEC.pdf');

console.log('Rendering SYNDICATE_SPEC.pdf from:', htmlPath);

const chromeCmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --virtual-time-budget=8000 --print-to-pdf="${pdfPath}" "${htmlPath}"`;
execSync(chromeCmd, { stdio: 'inherit' });

copyFileSync(pdfPath, artifactPdfPath);
const stats = statSync(pdfPath);
console.log(`PDF generated: ${pdfPath} (${stats.size} bytes)`);
console.log(`Artifact mirror: ${artifactPdfPath}`);
