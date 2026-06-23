import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SC_ITEMS_PORT || 4173);
const UPDATE_MANIFEST_URL = process.env.SCMINERSDB_UPDATE_MANIFEST_URL || "";
const UPDATE_SOURCE_DIR = process.env.SCMINERSDB_UPDATE_SOURCE_DIR || "";
const UPDATE_WORKSPACE_ROOT = process.env.SCMINERSDB_WORKSPACE_ROOT || "";
const UPDATE_PYTHON = process.env.SCMINERSDB_PYTHON || "";
const BRIDGE_CONFIG_PATH = path.join(ROOT_DIR, "scminersdb_bridge_config.json");
const DEFAULT_EXPORT_ROOTS = [
  process.env.SCMINERSDB_EXPORT_ROOT,
  "C:\\Users\\juanc\\Documents\\Codex\\2026-06-19\\i\\scminersdb\\data",
  "C:\\Users\\juanc\\Documents\\Codex\\2026-06-20\\scminersdb\\data",
];
const DEFAULT_WORKSPACE_ROOTS = [
  UPDATE_WORKSPACE_ROOT,
  path.join(ROOT_DIR, "scminersdb"),
  "C:\\Users\\juanc\\Documents\\Codex\\2026-06-20\\scminersdb",
];

async function pickExportRoot() {
  const candidates = DEFAULT_EXPORT_ROOTS.filter(Boolean).map((value) => path.resolve(value));
  let bestCandidate = "";
  let bestScore = -1;
  for (const candidate of candidates) {
    const manifestPath = path.join(candidate, "runs", "latest.json");
    const jsonDir = path.join(candidate, "json");
    const manifest = await readFileIfExists(manifestPath);
    const files = await listJsonFiles(jsonDir);
    const score = (manifest ? 1000 : 0) + files.length;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  return bestCandidate || path.resolve(DEFAULT_EXPORT_ROOTS.find(Boolean) || candidates[0] || ROOT_DIR);
}

let EXPORT_ROOT = await pickExportRoot();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function cleanPathname(value) {
  return decodeURIComponent(value || "/").split("?")[0];
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store, max-age=0",
    "Access-Control-Allow-Origin": "*",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value, null, 2), {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function safeResolve(baseDir, requestPath) {
  const trimmed = String(requestPath || "").replace(/^[/\\]+/, "");
  const resolved = path.resolve(baseDir, trimmed);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}

function cleanValue(value) {
  return String(value || "").trim();
}

function normalizePathInput(value) {
  return cleanValue(value).replace(/^"(.*)"$/, "$1");
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const fullPath = path.join(dir, entry.name);
    const stat = await statIfExists(fullPath);
    if (!stat) continue;
    files.push({
      name: entry.name,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      url: `/api/scminersdb/json/${encodeURIComponent(entry.name)}`,
    });
  }
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return files;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function fetchJsonFromUrl(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function pathExists(targetPath) {
  if (!targetPath) return false;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(targetPath) {
  const stat = await statIfExists(targetPath);
  return Boolean(stat?.isFile());
}

async function directoryExists(targetPath) {
  const stat = await statIfExists(targetPath);
  return Boolean(stat?.isDirectory());
}

async function pickWorkspaceRoot(explicitRoot = "") {
  const candidates = [explicitRoot, ...DEFAULT_WORKSPACE_ROOTS]
    .filter(Boolean)
    .map((value) => path.resolve(value));
  for (const candidate of candidates) {
    if (await fileExists(path.join(candidate, "python-tool", "src", "scdm", "pipeline.py"))) {
      return candidate;
    }
  }
  return "";
}

async function resolveBundledPython(workspaceRoot) {
  const candidates = [
    UPDATE_PYTHON,
    workspaceRoot ? path.join(workspaceRoot, "Python-3.11.15", "python.exe") : "",
    workspaceRoot ? path.join(workspaceRoot, ".venv", "Scripts", "python.exe") : "",
  ]
    .filter(Boolean)
    .map((value) => path.resolve(value));
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return "python";
}

async function readBridgeConfig() {
  const raw = await readFileIfExists(BRIDGE_CONFIG_PATH);
  const defaults = {
    sourceRoot: UPDATE_SOURCE_DIR,
    manifestUrl: UPDATE_MANIFEST_URL,
    workspaceRoot: UPDATE_WORKSPACE_ROOT,
  };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    return {
      sourceRoot: normalizePathInput(parsed?.sourceRoot || defaults.sourceRoot),
      manifestUrl: cleanValue(parsed?.manifestUrl || defaults.manifestUrl),
      workspaceRoot: normalizePathInput(parsed?.workspaceRoot || defaults.workspaceRoot),
    };
  } catch {
    return defaults;
  }
}

async function writeBridgeConfig(config) {
  const payload = {
    sourceRoot: normalizePathInput(config?.sourceRoot || ""),
    manifestUrl: cleanValue(config?.manifestUrl || ""),
    workspaceRoot: normalizePathInput(config?.workspaceRoot || ""),
  };
  await writeJson(BRIDGE_CONFIG_PATH, payload);
  return payload;
}

async function dataP4kPath(sourceRoot) {
  const normalized = normalizePathInput(sourceRoot);
  if (!normalized) return "";
  return path.join(path.resolve(normalized), "Data.p4k");
}

async function sourceRootStatus(sourceRoot) {
  const normalized = normalizePathInput(sourceRoot);
  if (!normalized) return { sourceRoot: "", exists: false, hasDataP4k: false };
  const resolved = path.resolve(normalized);
  const exists = await directoryExists(resolved);
  const hasDataP4k = exists ? await fileExists(await dataP4kPath(resolved)) : false;
  return { sourceRoot: resolved, exists, hasDataP4k };
}

async function currentBridgeStatus(overrides = {}) {
  const stored = await readBridgeConfig();
  const merged = {
    sourceRoot: normalizePathInput(overrides.sourceRoot ?? stored.sourceRoot ?? ""),
    manifestUrl: cleanValue(overrides.manifestUrl ?? stored.manifestUrl ?? ""),
    workspaceRoot: normalizePathInput(overrides.workspaceRoot ?? stored.workspaceRoot ?? ""),
  };
  const workspaceRoot = await pickWorkspaceRoot(merged.workspaceRoot);
  const sourceStatus = await sourceRootStatus(merged.sourceRoot);
  const exportRoot = workspaceRoot ? path.join(workspaceRoot, "data") : EXPORT_ROOT;
  return {
    ...merged,
    workspaceRoot,
    workspaceReady: Boolean(workspaceRoot),
    sourceRoot: sourceStatus.sourceRoot,
    sourceRootExists: sourceStatus.exists,
    sourceRootHasDataP4k: sourceStatus.hasDataP4k,
    exportRoot,
  };
}

async function runScminersDbSync({ workspaceRoot, sourceRoot }) {
  const pythonExecutable = await resolveBundledPython(workspaceRoot);
  const script = `
import json
import sys
from dataclasses import replace
from pathlib import Path

workspace_root = Path(sys.argv[1])
source_root = Path(sys.argv[2])
sys.path.insert(0, str(workspace_root / "python-tool" / "src"))

from scdm.config import load_workspace_config, save_config, workspace_config_path
from scdm.pipeline import run_default_pipeline

config = load_workspace_config(workspace_root)
save_config(workspace_config_path(workspace_root), replace(config, source_root=source_root))
result = run_default_pipeline(workspace_root, source_root=source_root)
print(json.dumps(result))
`.trim();
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, ["-c", script, workspaceRoot, sourceRoot], {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(cleanValue(stderr || stdout || `SCMinersDB sync exited with code ${code}`)));
        return;
      }
      try {
        resolve(JSON.parse(cleanValue(stdout) || "{}"));
      } catch {
        resolve({ status: "ok", raw: cleanValue(stdout), warnings: cleanValue(stderr) ? [cleanValue(stderr)] : [] });
      }
    });
  });
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function sha1(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function normalizeExportEntries(manifest) {
  const entries = Array.isArray(manifest?.exports) ? manifest.exports : [];
  return entries
    .map((entry) => {
      const file = String(entry?.file || entry?.name || "").trim();
      if (!file.toLowerCase().endsWith(".json")) return null;
      const url = String(entry?.url || entry?.href || "").trim();
      return {
        file,
        url,
        category: String(entry?.category || "").trim(),
      };
    })
    .filter(Boolean);
}

async function syncFromLocalDirectory(sourceDir) {
  const jsonDir = path.join(sourceDir, "json");
  const runDir = path.join(sourceDir, "runs");
  const files = await listJsonFiles(jsonDir);
  for (const file of files) {
    const srcPath = path.join(jsonDir, file.name);
    const dstPath = path.join(EXPORT_ROOT, "json", file.name);
    await ensureDir(path.dirname(dstPath));
    await fs.copyFile(srcPath, dstPath);
  }
  const manifestPath = path.join(runDir, "latest.json");
  const manifestRaw = await readFileIfExists(manifestPath);
  if (manifestRaw) {
    await ensureDir(path.join(EXPORT_ROOT, "runs"));
    await fs.writeFile(path.join(EXPORT_ROOT, "runs", "latest.json"), manifestRaw);
  }
  return {
    source: sourceDir,
    files: files.length,
    manifestCopied: Boolean(manifestRaw),
  };
}

async function syncFromManifestUrl(manifestUrl) {
  const manifest = await fetchJsonFromUrl(manifestUrl);
  const entries = normalizeExportEntries(manifest);
  if (!entries.length) {
    throw new Error("Update manifest did not include any export files.");
  }
  const baseUrl = new URL(".", manifestUrl).toString();
  const written = [];
  for (const entry of entries) {
    const targetUrl = entry.url
      ? new URL(entry.url, baseUrl).toString()
      : new URL(`json/${entry.file}`, baseUrl).toString();
    const payload = await fetchJsonFromUrl(targetUrl);
    const dstPath = path.join(EXPORT_ROOT, "json", entry.file);
    await ensureDir(path.dirname(dstPath));
    await fs.writeFile(dstPath, JSON.stringify(payload, null, 2));
    written.push(entry.file);
  }
  await ensureDir(path.join(EXPORT_ROOT, "runs"));
  await writeJson(path.join(EXPORT_ROOT, "runs", "latest.json"), {
    ...manifest,
    status: manifest.status || "ok",
    updated_at: new Date().toISOString(),
    update_source: manifestUrl,
    json_count: written.length,
    manifest_signature: sha1(JSON.stringify(manifest)),
  });
  return {
    source: manifestUrl,
    files: written.length,
    manifestCopied: true,
  };
}

async function getManifest() {
  const manifestPath = path.join(EXPORT_ROOT, "runs", "latest.json");
  const raw = await readFileIfExists(manifestPath);
  if (!raw) return null;
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (error) {
    return { status: "error", error: String(error?.message || error) };
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/scminersdb/config" && req.method === "GET") {
    return sendJson(res, 200, await currentBridgeStatus());
  }

  if (pathname === "/api/scminersdb/config" && req.method === "POST") {
    try {
      const body = await readJsonBody(req).catch(() => ({}));
      const current = await readBridgeConfig();
      const next = await writeBridgeConfig({
        sourceRoot: body?.sourceRoot ?? current.sourceRoot,
        manifestUrl: body?.manifestUrl ?? current.manifestUrl,
        workspaceRoot: body?.workspaceRoot ?? current.workspaceRoot,
      });
      const status = await currentBridgeStatus(next);
      if (status.workspaceReady) EXPORT_ROOT = status.exportRoot;
      return sendJson(res, 200, { ok: true, config: status });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Config save failed",
        message: String(error?.message || error),
      });
    }
  }

  if (pathname === "/api/scminersdb/manifest") {
    const manifest = await getManifest();
    if (!manifest) return sendJson(res, 404, { error: "SCMinersDB manifest not found." });
    return sendJson(res, 200, manifest);
  }

  if (pathname === "/api/scminersdb/files") {
    const jsonDir = path.join(EXPORT_ROOT, "json");
    const files = await listJsonFiles(jsonDir);
    return sendJson(res, 200, {
      exportRoot: EXPORT_ROOT,
      count: files.length,
      files,
    });
  }

  if (pathname === "/api/scminersdb/update" && req.method === "POST") {
    try {
      const body = await readJsonBody(req).catch(() => ({}));
      const config = await readBridgeConfig();
      const sourceRoot = normalizePathInput(body?.sourceRoot || body?.sourceDir || config.sourceRoot || UPDATE_SOURCE_DIR || "");
      const manifestUrl = cleanValue(body?.manifestUrl || config.manifestUrl || UPDATE_MANIFEST_URL || "");
      const requestedWorkspace = normalizePathInput(body?.workspaceRoot || config.workspaceRoot || UPDATE_WORKSPACE_ROOT || "");
      const workspaceRoot = await pickWorkspaceRoot(requestedWorkspace);
      let result = null;

      if (sourceRoot) {
        const sourceStatus = await sourceRootStatus(sourceRoot);
        if (!sourceStatus.exists || !sourceStatus.hasDataP4k) {
          return sendJson(res, 400, {
            error: "Star Citizen path is missing or invalid.",
            sourceRoot: sourceStatus.sourceRoot,
            exists: sourceStatus.exists,
            hasDataP4k: sourceStatus.hasDataP4k,
            hint: "Choose the LIVE folder that contains Data.p4k.",
          });
        }
        if (!workspaceRoot) {
          return sendJson(res, 500, {
            error: "SCMinersDB workspace not found.",
            hint: "Bundle the scminersdb workspace with this app or set SCMINERSDB_WORKSPACE_ROOT.",
          });
        }
        result = await runScminersDbSync({
          workspaceRoot,
          sourceRoot: sourceStatus.sourceRoot,
        });
        await writeBridgeConfig({
          sourceRoot: sourceStatus.sourceRoot,
          manifestUrl,
          workspaceRoot,
        });
        EXPORT_ROOT = path.join(workspaceRoot, "data");
      } else if (body?.copySourceDir) {
        result = await syncFromLocalDirectory(path.resolve(String(body.copySourceDir)));
      } else if (manifestUrl) {
        result = await syncFromManifestUrl(manifestUrl);
        await writeBridgeConfig({
          sourceRoot: "",
          manifestUrl,
          workspaceRoot,
        });
      } else {
        return sendJson(res, 400, {
          error: "No update source configured.",
          hint: "Save a Star Citizen install path first, or configure a manifest URL fallback.",
        });
      }
      const manifest = await getManifest();
      const status = await currentBridgeStatus({
        sourceRoot,
        manifestUrl,
        workspaceRoot,
      });
      return sendJson(res, 200, {
        ok: true,
        updated: result,
        manifest,
        config: status,
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Update failed",
        message: String(error?.message || error),
      });
    }
  }

  if (pathname.startsWith("/api/scminersdb/json/")) {
    const fileName = pathname.slice("/api/scminersdb/json/".length);
    const fullPath = safeResolve(path.join(EXPORT_ROOT, "json"), fileName);
    if (!fullPath) return sendJson(res, 400, { error: "Invalid export path." });
    const raw = await readFileIfExists(fullPath);
    if (!raw) return sendJson(res, 404, { error: "Export file not found." });
    return send(res, 200, raw, {
      "Content-Type": "application/json; charset=utf-8",
    });
  }

  return false;
}

async function serveStatic(req, res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeResolve(ROOT_DIR, normalized);
  if (!filePath) return sendJson(res, 400, { error: "Invalid path." });

  const stat = await statIfExists(filePath);
  if (!stat || !stat.isFile()) {
    if (normalized === "/index.html" || normalized === "/") {
      const indexPath = path.join(ROOT_DIR, "index.html");
      const indexRaw = await readFileIfExists(indexPath);
      if (!indexRaw) return sendJson(res, 404, { error: "Not found." });
      return send(res, 200, indexRaw, { "Content-Type": "text/html; charset=utf-8" });
    }
    if (!path.extname(normalized)) {
      const indexPath = path.join(ROOT_DIR, "index.html");
      const indexRaw = await readFileIfExists(indexPath);
      if (!indexRaw) return sendJson(res, 404, { error: "Not found." });
      return send(res, 200, indexRaw, { "Content-Type": "text/html; charset=utf-8" });
    }
    return sendJson(res, 404, { error: "Not found." });
  }

  const raw = await readFileIfExists(filePath);
  if (!raw) return sendJson(res, 404, { error: "Not found." });
  const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  return send(res, 200, raw, { "Content-Type": type });
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = cleanPathname(new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`).pathname);
    const apiResult = await handleApi(req, res, pathname);
    if (apiResult !== false) return;
    return await serveStatic(req, res, pathname);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Bridge error",
      message: String(error?.message || error),
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SC Items bridge listening on http://127.0.0.1:${PORT}`);
});
