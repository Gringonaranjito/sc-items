import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_EXPORT_ROOT = "C:/Users/juanc/Documents/Codex/2026-06-19/i/scminersdb/data";
const exportRoot = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_EXPORT_ROOT;
const manifestPath = path.join(exportRoot, "runs", "latest.json");
const jsonRoot = path.join(exportRoot, "json");
const outputPath = path.resolve("scminersdb_local_bundle.js");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const entries = Array.isArray(manifest?.exports) ? manifest.exports.filter((entry) => entry?.file) : [];

const exportsByFile = {};
const fileIndex = {};
for (const entry of entries) {
  const fileName = String(entry.file || "").trim();
  if (!fileName) continue;
  const filePath = path.join(jsonRoot, fileName);
  exportsByFile[fileName] = JSON.parse(await fs.readFile(filePath, "utf8"));
  fileIndex[fileName] = `./json/${fileName}`;
  fileIndex[fileName.toLowerCase()] = `./json/${fileName}`;
  if (entry.category) fileIndex[String(entry.category).trim().toLowerCase()] = `./json/${fileName}`;
}

const signature = entries.map((entry) => `${entry.file}:${entry.record_count || entry.size || ""}`).join("|");
const bundle = {
  source: "bundled",
  generatedAt: new Date().toISOString(),
  manifest,
  files: entries,
  exports: exportsByFile,
  fileIndex,
  signature,
  status: `bundled · ${entries.length} exports`,
};

const script = `window.SC_MINERS_DB_BUNDLED = ${JSON.stringify(bundle)};\n`;
await fs.writeFile(outputPath, script, "utf8");
console.log(`Wrote ${outputPath}`);
