import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultDocumentForSlug,
  normalizeDesignMetadata,
} from "../lib/svg/workspace.js";
import {
  parseSvgDocument,
  serializeSvgDocument,
} from "../lib/svg/svg-document.js";

const MAX_SVG_BYTES = 1024 * 1024;
const MAX_REVISIONS = 100;
const REVISION_SOURCES = new Set([
  "automation",
  "autosave",
  "create",
  "delete",
  "duplicate",
  "edit",
  "import",
  "reset",
  "restore",
  "undo",
  "redo",
  "boolean",
]);

export function normalizeSlug(value) {
  const raw = typeof value === "string" ? value : "default";
  const slug = raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
  return slug || "default";
}

export function normalizeName(value) {
  const name =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return name.slice(0, 120) || "Untitled Canvas";
}

export function normalizeSvg(value) {
  if (typeof value !== "string") return null;
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes === 0 || bytes > MAX_SVG_BYTES) return null;
  try {
    return serializeSvgDocument(parseSvgDocument(value));
  } catch {
    return null;
  }
}

function normalizeSource(value) {
  if (typeof value !== "string") return "autosave";
  const source = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return REVISION_SOURCES.has(source) ? source : "autosave";
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 30;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

export function createStore(dir) {
  return { dir: path.resolve(dir), locks: new Map() };
}

function filePath(store, slug, ext = "json") {
  return path.join(store.dir, `${slug}.${ext}`);
}

async function readRecord(store, slug) {
  try {
    return JSON.parse(await readFile(filePath(store, slug), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeRecord(store, record) {
  await mkdir(store.dir, { recursive: true });
  await writeFile(
    filePath(store, record.slug),
    JSON.stringify(record, null, 2) + "\n",
  );
  await writeFile(filePath(store, record.slug, "svg"), record.svg + "\n");
}

function hashId(slug) {
  let hash = 2166136261;
  for (const char of slug) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function serializeDocument(record) {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    svg: record.svg,
    metadata: normalizeDesignMetadata(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function serializeRevision(record, revision) {
  return {
    id: revision.id,
    documentId: record.id,
    revision: revision.revision,
    name: revision.name,
    svg: revision.svg,
    metadata: normalizeDesignMetadata(revision.metadata),
    source: revision.source,
    createdAt: revision.createdAt,
  };
}

function pushRevision(record, source) {
  const latest = record.revisions[0];
  if (
    latest &&
    latest.svg === record.svg &&
    latest.name === record.name &&
    latest.source === source
  ) {
    return latest;
  }
  record.nextRevisionId = (record.nextRevisionId || 1) + 1;
  const revision = {
    id: record.nextRevisionId - 1,
    revision: (latest?.revision || 0) + 1,
    name: record.name,
    svg: record.svg,
    metadata: record.metadata,
    source,
    createdAt: new Date().toISOString(),
  };
  record.revisions.unshift(revision);
  record.revisions.length = Math.min(record.revisions.length, MAX_REVISIONS);
  return revision;
}

async function getOrCreate(store, slug) {
  const existing = await readRecord(store, slug);
  if (existing) {
    if (existing.revisions.length === 0) {
      pushRevision(existing, "create");
      await writeRecord(store, existing);
    }
    return existing;
  }
  const defaults = defaultDocumentForSlug(slug);
  const now = new Date().toISOString();
  const record = {
    id: hashId(slug),
    slug,
    name: defaults.name,
    svg: defaults.svg,
    metadata: defaults.metadata,
    createdAt: now,
    updatedAt: now,
    nextRevisionId: 1,
    revisions: [],
  };
  pushRevision(record, "create");
  await writeRecord(store, record);
  return record;
}

function withLock(store, slug, task) {
  const previous = store.locks.get(slug) || Promise.resolve();
  const next = previous.then(task, task);
  store.locks.set(
    slug,
    next.catch(() => {}),
  );
  return next;
}

export async function readDocument(store, slugInput) {
  const slug = normalizeSlug(slugInput);
  return withLock(store, slug, async () =>
    serializeDocument(await getOrCreate(store, slug)),
  );
}

export async function listDocuments(store) {
  let names = [];
  try {
    names = await readdir(store.dir);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
  const documents = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const record = await readRecord(store, name.slice(0, -5));
    if (record) documents.push(serializeDocument(record));
  }
  return documents;
}

export async function saveDocument(store, body) {
  const slug = normalizeSlug(body.slug);
  const name = normalizeName(body.name);
  const svg = normalizeSvg(body.svg);
  const source = normalizeSource(body.source);
  if (!svg) {
    return {
      error: "SVG must be a valid, script-free SVG path document under 1 MB.",
    };
  }
  return withLock(store, slug, async () => {
    const existing = await readRecord(store, slug);
    const defaults = defaultDocumentForSlug(slug);
    const base = normalizeDesignMetadata(existing?.metadata, defaults.metadata);
    const metadata =
      body.metadata === undefined
        ? base
        : normalizeDesignMetadata(body.metadata, base);
    const now = new Date().toISOString();
    const record = existing || {
      id: hashId(slug),
      slug,
      createdAt: now,
      nextRevisionId: 1,
      revisions: [],
    };
    const changed =
      !existing ||
      existing.svg !== svg ||
      existing.name !== name ||
      JSON.stringify(existing.metadata) !== JSON.stringify(metadata);
    record.name = name;
    record.svg = svg;
    record.metadata = metadata;
    record.updatedAt = now;
    if (changed) pushRevision(record, source);
    await writeRecord(store, record);
    return { document: serializeDocument(record) };
  });
}

export async function deleteDocument(store, slugInput) {
  const slug = normalizeSlug(slugInput);
  return withLock(store, slug, async () => {
    const existing = await readRecord(store, slug);
    if (!existing) return null;
    await rm(filePath(store, slug), { force: true });
    await rm(filePath(store, slug, "svg"), { force: true });
    return serializeDocument(existing);
  });
}

export async function listRevisions(store, slugInput, limitInput) {
  const slug = normalizeSlug(slugInput);
  const limit = normalizeLimit(limitInput);
  return withLock(store, slug, async () => {
    const record = await getOrCreate(store, slug);
    return record.revisions
      .slice(0, limit)
      .map((revision) => serializeRevision(record, revision));
  });
}

export async function restoreRevision(store, slugInput, revisionIdInput) {
  const slug = normalizeSlug(slugInput);
  const revisionId = Number(revisionIdInput);
  if (!Number.isInteger(revisionId) || revisionId <= 0) {
    return { error: "Invalid revision id", status: 400 };
  }
  return withLock(store, slug, async () => {
    const record = await getOrCreate(store, slug);
    const revision = record.revisions.find((item) => item.id === revisionId);
    if (!revision) return { error: "Revision not found", status: 404 };
    record.name = revision.name;
    record.svg = revision.svg;
    record.metadata = revision.metadata;
    record.updatedAt = new Date().toISOString();
    const restored = pushRevision(record, "restore");
    await writeRecord(store, record);
    return {
      document: serializeDocument(record),
      revision: serializeRevision(record, restored),
    };
  });
}
