import { build } from "esbuild";
import { readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

// Group product photos by type so a group picks one of several photos of the same kind of product.
// Photos are .jpg. Drawn illustrations for products with no good photo are .svg and keep their extension.
const photos = readdirSync("src/web/public/img/products").filter((name) => name.endsWith(".jpg") || name.endsWith(".svg"));
const manifest = {};
for (const name of photos) {
  const isSvg = name.endsWith(".svg");
  const base = name.replace(/\.(jpg|svg)$/, "").replace(/-\d+$/, "");
  (manifest[base] ??= []).push(isSvg ? name : name.replace(/\.jpg$/, ""));
}
for (const list of Object.values(manifest)) list.sort();
writeFileSync("src/web/react/productImageManifest.json", JSON.stringify(manifest, null, 1));

const licenseKey = process.env.BRYNTUM_LICENSE_KEY || "";
const agLicenseKey = process.env.AG_LICENSE_KEY || process.env.AG_GRID_LICENSE_KEY || "";
const agStudioKey = process.env.AG_STUDIO_LICENSE_KEY || agLicenseKey;
if (!licenseKey) {
  console.warn("BRYNTUM_LICENSE_KEY is not set. Bryntum components will render in unlicensed mode.");
}
if (!agLicenseKey) {
  console.warn("AG_LICENSE_KEY is not set. AG Grid and AG Studio will render in unlicensed mode.");
}

await build({
  entryPoints: ["src/web/react/index.tsx"],
  bundle: true,
  outfile: "src/web/public/app.bundle.js",
  format: "iife",
  minify: true,
  legalComments: "none",
  jsx: "automatic",
  target: "es2022",
  define: {
    "process.env.BRYNTUM_LICENSE_KEY": JSON.stringify(licenseKey),
    "process.env.AG_LICENSE_KEY": JSON.stringify(agLicenseKey),
    "process.env.AG_STUDIO_LICENSE_KEY": JSON.stringify(agStudioKey)
  },
  logLevel: "info"
});

await build({
  entryPoints: ["src/web/bryntum-styles.css"],
  bundle: true,
  outfile: "src/web/public/bryntum.css",
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  logLevel: "info"
});

// Precompress the large files once at build time. The server sends them when the browser accepts brotli or gzip.
for (const file of ["src/web/public/app.bundle.js", "src/web/public/app.bundle.css", "src/web/public/bryntum.css"]) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file);
  writeFileSync(`${file}.br`, brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
  writeFileSync(`${file}.gz`, gzipSync(raw, { level: 9 }));
}
