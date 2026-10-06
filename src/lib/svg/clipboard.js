import { makeGroupId } from "./layers";
import { makePathId } from "./operations";
import { parseSvgPaste, serializeSvgDocument } from "./svg-document";
import { serializePathData } from "./svg-path";

const SVG_LIKE = /<svg|<path\b/i;

export function looksLikeSvg(text) {
  return Boolean(text) && SVG_LIKE.test(text);
}

function svgFromHtml(html) {
  return html ? html.match(/<svg[\s\S]*<\/svg>/i)?.[0] || "" : "";
}

export function svgFromClipboardData(clipboard) {
  if (!clipboard) return "";
  const direct = clipboard.getData("image/svg+xml");
  if (direct && /<svg/i.test(direct)) return direct;
  const fromHtml = svgFromHtml(clipboard.getData("text/html"));
  if (fromHtml) return fromHtml;
  const plain = clipboard.getData("text/plain");
  return looksLikeSvg(plain) ? plain : "";
}

export function svgFromClipboardText(type, text) {
  const svg = type === "text/html" ? svgFromHtml(text) : text;
  return looksLikeSvg(svg) ? svg : "";
}

export function svgFileFrom(files) {
  return [...(files || [])].find(
    (file) => file.type === "image/svg+xml" || /\.svg$/i.test(file.name),
  );
}

export function serializePaths(document, paths) {
  if (paths.length === 0) return "";
  return serializeSvgDocument({
    viewBox: document.viewBox,
    fontFamily: document.fontFamily,
    paths,
  });
}

export function copyPaths(paths, { offsetCommand, idSuffix }) {
  const groupCounts = new Map();
  for (const path of paths) {
    if (path.groupId)
      groupCounts.set(path.groupId, (groupCounts.get(path.groupId) || 0) + 1);
  }
  const groupIdMap = new Map();
  const remapGroup = (groupId) => {
    if (!groupId || (groupCounts.get(groupId) || 0) < 2) return undefined;
    if (!groupIdMap.has(groupId)) groupIdMap.set(groupId, makeGroupId());
    return groupIdMap.get(groupId);
  };
  return paths.map((path) => {
    const commands = path.commands.map(offsetCommand);
    const groupId = remapGroup(path.groupId);
    return {
      ...path,
      id: makePathId(`${path.id}-${idSuffix}`),
      name: `${path.name} copy`,
      groupId,
      groupName: groupId ? path.groupName : undefined,
      commands,
      d: serializePathData(commands),
    };
  });
}

export function pathsFromPastedSvg(document, source) {
  const parsed = parseSvgPaste(source, { idPrefix: "pasted" });
  if (parsed.paths.length === 0) return [];
  const groupId = parsed.paths.length > 1 ? makeGroupId() : undefined;
  const groupName =
    parsed.paths.find((path) => path.groupName)?.groupName ||
    `Pasted group ${document.paths.length + 1}`;
  const grouped = groupId
    ? parsed.paths.map((path) => ({
        ...path,
        groupId: path.groupId || groupId,
        groupName: path.groupName || groupName,
      }))
    : parsed.paths;
  const taken = new Set(document.paths.map((path) => path.name));
  return grouped.map((path) => {
    let name = path.name;
    let attempt = 2;
    while (taken.has(name)) {
      name = `${path.name} ${attempt}`;
      attempt += 1;
    }
    taken.add(name);
    return name === path.name ? path : { ...path, name };
  });
}
