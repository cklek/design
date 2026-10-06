import { getPathBounds } from "./bounds";
import { DESIGN_GRID_SIZE } from "./geometry";
import { serializePathData } from "./svg-path";

const ELLIPSE_KAPPA = 0.552284749831;
const DEFAULT_FILL = "#f4efe6";
const DEFAULT_STROKE = "#f4efe6";

export function updatePathCommands(document, pathId, commands) {
  return {
    ...document,
    paths: document.paths.map((path) =>
      path.id === pathId
        ? { ...path, commands, d: serializePathData(commands) }
        : path,
    ),
  };
}

export function makePathId(prefix = "path") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function normalizePathId(value, fallback) {
  const id =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^[-_.]+|[-_.]+$/g, "")
          .slice(0, 80)
      : "";
  return id || makePathId(fallback);
}

export function createEmptyPath(name = "Path") {
  return {
    id: makePathId("path"),
    name,
    d: "",
    commands: [],
    fill: "none",
    stroke: DEFAULT_STROKE,
    strokeWidth: 12,
    fillRule: "nonzero",
  };
}

export function createRectanglePath({
  id,
  name = "Rectangle",
  x,
  y,
  width,
  height,
  fill = DEFAULT_FILL,
  stroke = "none",
  strokeWidth = 0,
}) {
  const commands = [
    { type: "M", x, y },
    { type: "L", x: x + width, y },
    { type: "L", x: x + width, y: y + height },
    { type: "L", x, y: y + height },
    { type: "Z" },
  ];
  return {
    id: normalizePathId(id, "rectangle"),
    name,
    d: serializePathData(commands),
    commands,
    fill,
    stroke,
    strokeWidth,
    fillRule: "nonzero",
  };
}

export function createEllipsePath({
  id,
  name = "Ellipse",
  x,
  y,
  width,
  height,
  fill = DEFAULT_FILL,
  stroke = "none",
  strokeWidth = 0,
}) {
  const rx = width / 2;
  const ry = height / 2;
  const cx = x + rx;
  const cy = y + ry;
  const ox = rx * ELLIPSE_KAPPA;
  const oy = ry * ELLIPSE_KAPPA;
  const commands = [
    { type: "M", x: cx + rx, y: cy },
    {
      type: "C",
      x1: cx + rx,
      y1: cy + oy,
      x2: cx + ox,
      y2: cy + ry,
      x: cx,
      y: cy + ry,
    },
    {
      type: "C",
      x1: cx - ox,
      y1: cy + ry,
      x2: cx - rx,
      y2: cy + oy,
      x: cx - rx,
      y: cy,
    },
    {
      type: "C",
      x1: cx - rx,
      y1: cy - oy,
      x2: cx - ox,
      y2: cy - ry,
      x: cx,
      y: cy - ry,
    },
    {
      type: "C",
      x1: cx + ox,
      y1: cy - ry,
      x2: cx + rx,
      y2: cy - oy,
      x: cx + rx,
      y: cy,
    },
    { type: "Z" },
  ];
  return {
    id: normalizePathId(id, "ellipse"),
    name,
    d: serializePathData(commands),
    commands,
    fill,
    stroke,
    strokeWidth,
    fillRule: "nonzero",
  };
}

export function createLinePath({
  id,
  name = "Line",
  x,
  y,
  width,
  height = 0,
  stroke = DEFAULT_STROKE,
  strokeWidth = 12,
}) {
  const commands = [
    { type: "M", x, y },
    { type: "L", x: x + width, y: y + height },
  ];
  return {
    id: normalizePathId(id, "line"),
    name,
    d: serializePathData(commands),
    commands,
    fill: "none",
    stroke,
    strokeWidth,
    fillRule: "nonzero",
  };
}

export function translateCommandBy(command, offset) {
  if (command.type === "Z") return command;
  if (command.type === "M" || command.type === "L") {
    return { ...command, x: command.x + offset.x, y: command.y + offset.y };
  }
  if (command.type === "Q") {
    return {
      ...command,
      x: command.x + offset.x,
      y: command.y + offset.y,
      x1: command.x1 + offset.x,
      y1: command.y1 + offset.y,
    };
  }
  return {
    ...command,
    x: command.x + offset.x,
    y: command.y + offset.y,
    x1: command.x1 + offset.x,
    y1: command.y1 + offset.y,
    x2: command.x2 + offset.x,
    y2: command.y2 + offset.y,
  };
}

export function duplicateCommandOffset(command) {
  return translateCommandBy(command, {
    x: DESIGN_GRID_SIZE * 2,
    y: DESIGN_GRID_SIZE * 2,
  });
}

export function translatePathBy(path, offset) {
  const commands = path.commands.map((command) =>
    translateCommandBy(command, offset),
  );
  return { ...path, commands, d: serializePathData(commands) };
}

function transformNumber(value, currentStart, nextStart, scale) {
  return nextStart + (value - currentStart) * scale;
}

export function resizePathToBounds(path, nextBounds) {
  const currentBounds = getPathBounds(path);
  if (!currentBounds) return path;
  const bounds = currentBounds;
  const width = Math.max(1, nextBounds.width);
  const height = Math.max(1, nextBounds.height);
  const scaleX = bounds.width === 0 ? 1 : width / bounds.width;
  const scaleY = bounds.height === 0 ? 1 : height / bounds.height;
  function mapPoint(point) {
    return {
      x: transformNumber(point.x, bounds.x, nextBounds.x, scaleX),
      y: transformNumber(point.y, bounds.y, nextBounds.y, scaleY),
    };
  }
  const commands = path.commands.map((command) => {
    if (command.type === "Z") return command;
    if (command.type === "M" || command.type === "L") {
      return { ...command, ...mapPoint(command) };
    }
    if (command.type === "Q") {
      return {
        ...command,
        ...mapPoint(command),
        x1: transformNumber(command.x1, bounds.x, nextBounds.x, scaleX),
        y1: transformNumber(command.y1, bounds.y, nextBounds.y, scaleY),
      };
    }
    return {
      ...command,
      ...mapPoint(command),
      x1: transformNumber(command.x1, bounds.x, nextBounds.x, scaleX),
      y1: transformNumber(command.y1, bounds.y, nextBounds.y, scaleY),
      x2: transformNumber(command.x2, bounds.x, nextBounds.x, scaleX),
      y2: transformNumber(command.y2, bounds.y, nextBounds.y, scaleY),
    };
  });
  return { ...path, commands, d: serializePathData(commands) };
}

function mapPointBetweenBounds(point, currentBounds, nextBounds) {
  const width = Math.max(1, nextBounds.width);
  const height = Math.max(1, nextBounds.height);
  const scaleX = currentBounds.width === 0 ? 1 : width / currentBounds.width;
  const scaleY = currentBounds.height === 0 ? 1 : height / currentBounds.height;
  return {
    x: transformNumber(point.x, currentBounds.x, nextBounds.x, scaleX),
    y: transformNumber(point.y, currentBounds.y, nextBounds.y, scaleY),
  };
}

export function resizeDocumentPathsToBounds(
  document,
  pathIds,
  currentBounds,
  nextBounds,
) {
  const selectedSet = new Set(pathIds);
  return {
    ...document,
    paths: document.paths.map((path) => {
      if (!selectedSet.has(path.id)) return path;
      const commands = path.commands.map((command) => {
        if (command.type === "Z") return command;
        if (command.type === "M" || command.type === "L") {
          return {
            ...command,
            ...mapPointBetweenBounds(command, currentBounds, nextBounds),
          };
        }
        if (command.type === "Q") {
          const point = mapPointBetweenBounds(
            command,
            currentBounds,
            nextBounds,
          );
          const control = mapPointBetweenBounds(
            { x: command.x1, y: command.y1 },
            currentBounds,
            nextBounds,
          );
          return {
            ...command,
            ...point,
            x1: control.x,
            y1: control.y,
          };
        }
        const point = mapPointBetweenBounds(command, currentBounds, nextBounds);
        const controlA = mapPointBetweenBounds(
          { x: command.x1, y: command.y1 },
          currentBounds,
          nextBounds,
        );
        const controlB = mapPointBetweenBounds(
          { x: command.x2, y: command.y2 },
          currentBounds,
          nextBounds,
        );
        return {
          ...command,
          ...point,
          x1: controlA.x,
          y1: controlA.y,
          x2: controlB.x,
          y2: controlB.y,
        };
      });
      return { ...path, commands, d: serializePathData(commands) };
    }),
  };
}

export function translateDocumentPathsBy(document, pathIds, offset) {
  const selectedSet = new Set(pathIds);
  return {
    ...document,
    paths: document.paths.map((path) =>
      selectedSet.has(path.id) ? translatePathBy(path, offset) : path,
    ),
  };
}

export function setPathsHidden(paths, selectedIds, hidden) {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return paths;
  return paths.map((path) =>
    selected.has(path.id) ? { ...path, hidden: Boolean(hidden) } : path,
  );
}
