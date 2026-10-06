import { getPathBounds, getSelectedPathBounds } from "./bounds";
import { serializePathData } from "./svg-path";

function rotatePoint(point, center, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function rotateCommand(command, center, angle) {
  if (command.type === "Z") return command;
  if (command.type === "M" || command.type === "L") {
    const rotated = rotatePoint(command, center, angle);
    return { ...command, x: rotated.x, y: rotated.y };
  }
  if (command.type === "Q") {
    const control = rotatePoint(
      { x: command.x1, y: command.y1 },
      center,
      angle,
    );
    const end = rotatePoint({ x: command.x, y: command.y }, center, angle);
    return { ...command, x1: control.x, y1: control.y, x: end.x, y: end.y };
  }
  const controlA = rotatePoint({ x: command.x1, y: command.y1 }, center, angle);
  const controlB = rotatePoint({ x: command.x2, y: command.y2 }, center, angle);
  const end = rotatePoint({ x: command.x, y: command.y }, center, angle);
  return {
    ...command,
    x1: controlA.x,
    y1: controlA.y,
    x2: controlB.x,
    y2: controlB.y,
    x: end.x,
    y: end.y,
  };
}

export function rotatePath(path, center, angleDegrees) {
  if (angleDegrees === 0) return path;
  const angle = (angleDegrees * Math.PI) / 180;
  const commands = path.commands.map((command) =>
    rotateCommand(command, center, angle),
  );
  return { ...path, commands, d: serializePathData(commands) };
}

export function rotateDocumentPaths(document, pathIds, angleDegrees, center) {
  if (pathIds.length === 0 || angleDegrees === 0) return document;
  const selected = new Set(pathIds);
  let pivot = center || null;
  if (!pivot) {
    if (selected.size === 1) {
      const path = document.paths.find((item) => selected.has(item.id));
      const bounds = path ? getPathBounds(path) : null;
      if (bounds) {
        pivot = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
      }
    } else {
      const bounds = getSelectedPathBounds(document, pathIds);
      if (bounds) {
        pivot = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
      }
    }
  }
  if (!pivot) return document;
  const center0 = pivot;
  return {
    ...document,
    paths: document.paths.map((path) =>
      selected.has(path.id) ? rotatePath(path, center0, angleDegrees) : path,
    ),
  };
}
