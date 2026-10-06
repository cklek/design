import { SVG_EDITOR_STORAGE_KEY } from "@/lib/svg/types";
import { defaultDocumentForSlug } from "@/lib/svg/workspace";
import { parseSvgDocument } from "@/lib/svg/svg-document";

const ACTIVE_SLUG_KEY = `${SVG_EDITOR_STORAGE_KEY}:active-slug`;
const SNAP_KEY = `${SVG_EDITOR_STORAGE_KEY}:snap`;
const DEFAULT_SLUG = "untitled-canvas";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function storageKeyForSlug(slug) {
  return `${SVG_EDITOR_STORAGE_KEY}:${slug}`;
}

export function readActiveSlug() {
  return read(ACTIVE_SLUG_KEY) || DEFAULT_SLUG;
}

export function writeActiveSlug(slug) {
  write(ACTIVE_SLUG_KEY, slug);
}

export function readSnapToGrid() {
  return read(SNAP_KEY) !== "false";
}

export function writeSnapToGrid(enabled) {
  write(SNAP_KEY, String(enabled));
}

export function writeCanvasSource(slug, source) {
  write(storageKeyForSlug(slug), source);
}

export function forgetCanvas(slug) {
  try {
    localStorage.removeItem(storageKeyForSlug(slug));
  } catch {}
}

export function readStoredCanvas(slug) {
  const stored = read(storageKeyForSlug(slug));
  if (!stored) return null;
  try {
    return parseSvgDocument(stored);
  } catch {
    return null;
  }
}

export function readInitialCanvas(slug) {
  return (
    readStoredCanvas(slug) || parseSvgDocument(defaultDocumentForSlug(slug).svg)
  );
}
