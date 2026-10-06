import {
  createDefaultSvgDocument,
  parseSvgDocument,
  serializeSvgDocument,
} from "./svg-document";

import { DEFAULT_DESIGN_FONT_FAMILY, normalizeDesignFontFamily } from "./types";

const DESIGN_STATUS_VALUES = new Set(["draft", "active", "review", "archived"]);

export function normalizeDesignDocumentStatus(value) {
  return typeof value === "string" && DESIGN_STATUS_VALUES.has(value)
    ? value
    : "draft";
}

export function normalizeDesignMetadata(value, fallback = {}) {
  const record = value && typeof value === "object" ? value : {};
  const category =
    typeof record.category === "string"
      ? record.category
          .replace(/[^a-z0-9 _-]+/gi, "")
          .trim()
          .slice(0, 48)
      : fallback.category;
  const notes =
    typeof record.notes === "string"
      ? record.notes.slice(0, 2000)
      : fallback.notes;
  const background =
    typeof record.background === "string" &&
    /^#[0-9a-f]{6}$/i.test(record.background)
      ? record.background
      : fallback.background;
  const fontFamily = normalizeDesignFontFamily(
    record.fontFamily,
    fallback.fontFamily || DEFAULT_DESIGN_FONT_FAMILY,
  );
  return {
    kind: "design",
    status: normalizeDesignDocumentStatus(record.status ?? fallback.status),
    category,
    notes,
    background,
    fontFamily,
  };
}

function humanizeSlug(slug) {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function defaultDocumentForSlug(slug) {
  return {
    name:
      slug === "default" || slug === "untitled-canvas"
        ? "Untitled Canvas"
        : humanizeSlug(slug) || "Untitled Canvas",
    svg: serializeSvgDocument(createDefaultSvgDocument()),
    metadata: {
      kind: "design",
      status: "draft",
      category: "canvas",
      fontFamily: DEFAULT_DESIGN_FONT_FAMILY,
    },
  };
}

export function documentFromRow(row, slug) {
  const metadata = normalizeDesignMetadata(
    row.metadata,
    defaultDocumentForSlug(slug).metadata,
  );
  const parsed = parseSvgDocument(row.svg);
  return {
    ...parsed,
    fontFamily: normalizeDesignFontFamily(
      parsed.fontFamily,
      metadata.fontFamily,
    ),
  };
}

export function upsertDocumentRow(rows, row) {
  return [...rows.filter((item) => item.slug !== row.slug), row].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}
