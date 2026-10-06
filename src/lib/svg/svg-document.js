import {
  DEFAULT_DESIGN_FONT_FAMILY,
  DEFAULT_SVG_SOURCE,
  normalizeDesignFontFamily,
} from "./types";
import { parsePathData, serializePathData } from "./svg-path";

function readAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  return tag.match(pattern)?.[1]?.trim() || "";
}

function hasAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escapedName}\\s*=`, "i").test(tag);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readDisplayName(attrs, fallback) {
  return (
    readAttribute(attrs, "data-name") ||
    readAttribute(attrs, "aria-label") ||
    readAttribute(attrs, "inkscape:label") ||
    fallback
  );
}

function readGroupLabel(attrs, fallback) {
  return (
    readAttribute(attrs, "data-group-name") || readDisplayName(attrs, fallback)
  );
}

function parseViewBox(svgTag) {
  const viewBox = readAttribute(svgTag, "viewBox");
  const parts = viewBox
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return {
      x: parts[0],
      y: parts[1],
      width: Math.max(1, parts[2]),
      height: Math.max(1, parts[3]),
    };
  }
  return {
    x: 0,
    y: 0,
    width: parseNumber(readAttribute(svgTag, "width"), 512),
    height: parseNumber(readAttribute(svgTag, "height"), 512),
  };
}

function assertSafeSvg(source) {
  if (/<script\b/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
    throw new Error("SVG contains script or event handlers.");
  }
}

export function parseSvgDocument(source) {
  assertSafeSvg(source);
  const svgTag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgTag) throw new Error("SVG must include an <svg> root.");
  const groupTransforms = [];
  const groupStack = [];
  const cursor = { tx: 0, ty: 0 };
  const paths = [];
  let groupIndex = 0;
  const tokenPattern =
    /<\/g\s*>|<g\b([^>]*)>|<path\b([^>]*?)\/?>(?:\s*<\/path>)?/gi;
  let match;
  while ((match = tokenPattern.exec(source))) {
    if (match[0].startsWith("</g")) {
      const lastTransform = groupTransforms.pop();
      if (lastTransform) {
        cursor.tx -= lastTransform[0];
        cursor.ty -= lastTransform[1];
      }
      groupStack.pop();
      continue;
    }
    if (match[0].startsWith("<g")) {
      const attrs = match[1] || "";
      const { tx, ty } = parseTransformTranslate(
        readAttribute(attrs, "transform"),
      );
      cursor.tx += tx;
      cursor.ty += ty;
      groupTransforms.push([tx, ty]);
      groupIndex += 1;
      const id =
        readAttribute(attrs, "data-group-id") ||
        readAttribute(attrs, "id") ||
        `group-${groupIndex}`;
      groupStack.push({
        id,
        name: readGroupLabel(attrs, `Group ${groupIndex}`),
      });
      continue;
    }
    const attrs = match[2] || "";
    if (!hasAttribute(attrs, "d")) {
      throw new Error(`Path ${paths.length + 1} is missing a d attribute.`);
    }
    const d = readAttribute(attrs, "d");
    const commands = parsePathData(d);
    const { tx: ownTx, ty: ownTy } = parseTransformTranslate(
      readAttribute(attrs, "transform"),
    );
    const translatedCommands = translateCommands(
      commands,
      cursor.tx + ownTx,
      cursor.ty + ownTy,
    );
    const id = readAttribute(attrs, "id") || `path-${paths.length + 1}`;
    const fillRule = readAttribute(attrs, "fill-rule");
    const groupId = readAttribute(attrs, "data-group-id");
    const groupName = readAttribute(attrs, "data-group-name");
    const parentGroup = groupStack.at(-1);
    const node = {
      id,
      name: readDisplayName(attrs, id),
      hidden:
        readAttribute(attrs, "display") === "none" ||
        /(^|;)\s*display\s*:\s*none/i.test(readAttribute(attrs, "style") || ""),
      d: serializePathData(translatedCommands),
      commands: translatedCommands,
      fill: readAttribute(attrs, "fill") || "none",
      stroke: readAttribute(attrs, "stroke") || "#f4efe6",
      strokeWidth: parseNumber(readAttribute(attrs, "stroke-width"), 1),
      fillRule: fillRule === "evenodd" ? "evenodd" : "nonzero",
    };
    if (groupId || parentGroup?.id) node.groupId = groupId || parentGroup.id;
    if (groupName || parentGroup?.name) {
      node.groupName = groupName || parentGroup.name;
    }
    paths.push(node);
  }
  if (paths.length === 0) {
    throw new Error(
      "SVG editor currently supports SVGs with at least one path.",
    );
  }
  const rawFontFamily = readAttribute(svgTag, "font-family");
  const fontFamily = rawFontFamily
    ? normalizeDesignFontFamily(rawFontFamily)
    : undefined;
  return {
    viewBox: parseViewBox(svgTag),
    paths,
    ...(fontFamily ? { fontFamily } : {}),
  };
}

export function serializeSvgDocument(document) {
  const { viewBox } = document;
  const fontFamily = ` font-family="${escapeAttribute(normalizeDesignFontFamily(document.fontFamily, DEFAULT_DESIGN_FONT_FAMILY))}"`;
  const paths = document.paths
    .map((path) => {
      const d = serializePathData(path.commands);
      const fillRule =
        path.fillRule && path.fillRule !== "nonzero"
          ? ` fill-rule="${path.fillRule}"`
          : "";
      const groupAttr = path.groupId
        ? ` data-group-id="${escapeAttribute(path.groupId)}"`
        : "";
      const groupNameAttr =
        path.groupId && path.groupName
          ? ` data-group-name="${escapeAttribute(path.groupName)}"`
          : "";
      const hiddenAttr = path.hidden ? ' display="none"' : "";
      return `  <path id="${escapeAttribute(path.id)}" data-name="${escapeAttribute(path.name)}"${hiddenAttr} fill="${escapeAttribute(path.fill)}" stroke="${escapeAttribute(path.stroke)}" stroke-width="${path.strokeWidth}"${fillRule}${groupAttr}${groupNameAttr} d="${escapeAttribute(d)}" />`;
    })
    .join("\n");
  return `<svg viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"${fontFamily} xmlns="http://www.w3.org/2000/svg">\n${paths}\n</svg>`;
}

export function createDefaultSvgDocument() {
  return parseSvgDocument(DEFAULT_SVG_SOURCE);
}

export function updateDocumentPath(document, pathId, updater) {
  return {
    ...document,
    paths: document.paths.map((path) =>
      path.id === pathId ? updater(path) : path,
    ),
  };
}

function parseTransformTranslate(transform) {
  if (!transform) return { tx: 0, ty: 0 };
  const match = transform.match(
    /translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)/i,
  );
  if (!match) return { tx: 0, ty: 0 };
  const tx = Number(match[1]);
  const ty = Number(match[2]);
  return {
    tx: Number.isFinite(tx) ? tx : 0,
    ty: Number.isFinite(ty) ? ty : 0,
  };
}

function translateCommands(commands, tx, ty) {
  if (tx === 0 && ty === 0) return commands;
  return commands.map((command) => {
    if (command.type === "Z") return command;
    if (command.type === "C") {
      return {
        ...command,
        x1: command.x1 + tx,
        y1: command.y1 + ty,
        x2: command.x2 + tx,
        y2: command.y2 + ty,
        x: command.x + tx,
        y: command.y + ty,
      };
    }
    if (command.type === "Q") {
      return {
        ...command,
        x1: command.x1 + tx,
        y1: command.y1 + ty,
        x: command.x + tx,
        y: command.y + ty,
      };
    }
    return { ...command, x: command.x + tx, y: command.y + ty };
  });
}

export function parseSvgPaste(source, options = {}) {
  assertSafeSvg(source);
  const idPrefix = options.idPrefix || "pasted";
  const baseIndex = options.baseIndex || 0;
  const svgTag = source.match(/<svg\b[^>]*>/i)?.[0];
  const viewBox = svgTag ? parseViewBox(svgTag) : null;
  const groupTransforms = [];
  const groupStack = [];
  const cursor = { tx: 0, ty: 0 };
  const paths = [];
  let groupIndex = 0;
  const tokenPattern =
    /<\/g\s*>|<g\b([^>]*)>|<path\b([^>]*?)\/?>(?:\s*<\/path>)?/gi;
  let match;
  while ((match = tokenPattern.exec(source))) {
    if (match[0].startsWith("</g")) {
      const last = groupTransforms.pop();
      if (last) {
        cursor.tx -= last[0];
        cursor.ty -= last[1];
      }
      groupStack.pop();
      continue;
    }
    if (match[0].startsWith("<g")) {
      const attrs = match[1] || "";
      const { tx, ty } = parseTransformTranslate(
        readAttribute(attrs, "transform"),
      );
      groupTransforms.push([tx, ty]);
      cursor.tx += tx;
      cursor.ty += ty;
      groupIndex += 1;
      const sourceGroupId =
        readAttribute(attrs, "data-group-id") || readAttribute(attrs, "id");
      const sourceGroupName = readGroupLabel(attrs, `Group ${groupIndex}`);
      groupStack.push({
        id: sourceGroupId
          ? `${idPrefix}-${sourceGroupId}-${Date.now().toString(36)}`
          : `${idPrefix}-group-${groupIndex}-${Date.now().toString(36)}`,
        name: sourceGroupName,
      });
      continue;
    }
    const attrs = match[2] || "";
    if (!hasAttribute(attrs, "d")) continue;
    const d = readAttribute(attrs, "d");
    const commands = parsePathData(d);
    if (commands.length === 0) continue;
    const { tx: ownTx, ty: ownTy } = parseTransformTranslate(
      readAttribute(attrs, "transform"),
    );
    const totalTx = cursor.tx + ownTx;
    const totalTy = cursor.ty + ownTy;
    const translatedCommands = translateCommands(commands, totalTx, totalTy);
    const index = baseIndex + paths.length;
    const fillRule = readAttribute(attrs, "fill-rule");
    const sourceId = readAttribute(attrs, "id");
    const fill = readAttribute(attrs, "fill");
    const stroke = readAttribute(attrs, "stroke");
    const parentGroup = groupStack.at(-1);
    const pathGroupId =
      readAttribute(attrs, "data-group-id") || parentGroup?.id || "";
    const pathGroupName =
      readAttribute(attrs, "data-group-name") || parentGroup?.name || "";
    const node = {
      id: `${idPrefix}-${index + 1}-${Date.now().toString(36)}`,
      name: readDisplayName(attrs, sourceId || `Glyph ${index + 1}`),
      d: serializePathData(translatedCommands),
      commands: translatedCommands,
      fill: fill || "#f4efe6",
      stroke: stroke || "none",
      strokeWidth: parseNumber(readAttribute(attrs, "stroke-width"), 0),
      fillRule: fillRule === "evenodd" ? "evenodd" : "nonzero",
    };
    if (pathGroupId) node.groupId = pathGroupId;
    if (pathGroupName) node.groupName = pathGroupName;
    paths.push(node);
  }
  return { paths, viewBox };
}
