import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SC_ITEMS_PORT || 4173);
const UPDATE_MANIFEST_URL = process.env.SCMINERSDB_UPDATE_MANIFEST_URL || "";
const UPDATE_SOURCE_DIR = process.env.SCMINERSDB_UPDATE_SOURCE_DIR || "";
const DEFAULT_EXPORT_ROOTS = [
  process.env.SCMINERSDB_EXPORT_ROOT,
  "C:\\Users\\juanc\\Documents\\Codex\\2026-06-19\\i\\scminersdb\\data",
  "C:\\Users\\juanc\\Documents\\Codex\\2026-06-20\\scminersdb\\data",
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

const EXPORT_ROOT = await pickExportRoot();

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
      const sourceDir = String(body?.sourceDir || UPDATE_SOURCE_DIR || "").trim();
      const manifestUrl = String(body?.manifestUrl || UPDATE_MANIFEST_URL || "").trim();
      let result = null;
      if (sourceDir) {
        result = await syncFromLocalDirectory(path.resolve(sourceDir));
      } else if (manifestUrl) {
        result = await syncFromManifestUrl(manifestUrl);
      } else {
        return sendJson(res, 400, {
          error: "No update source configured.",
          hint: "Set SCMINERSDB_UPDATE_SOURCE_DIR or SCMINERSDB_UPDATE_MANIFEST_URL, then try again.",
        });
      }
      const manifest = await getManifest();
      return sendJson(res, 200, {
        ok: true,
        updated: result,
        manifest,
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
