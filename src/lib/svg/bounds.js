import { cubicPoint, quadraticPoint } from "./geometry";

const CURVE_STEPS = 24;

function addPoint(points, point) {
  if (!point) return;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  points.push(point);
}

function boundsFromPoints(points) {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function collectCommandPoints(commands) {
  const points = [];
  let current = null;
  let start = null;
  for (const command of commands) {
    if (command.type === "M") {
      current = { x: command.x, y: command.y };
      start = current;
      addPoint(points, current);
      continue;
    }
    if (!current) continue;
    if (command.type === "L") {
      current = { x: command.x, y: command.y };
      addPoint(points, current);
      continue;
    }
    if (command.type === "Q") {
      const control = { x: command.x1, y: command.y1 };
      const end = { x: command.x, y: command.y };
      for (let step = 1; step <= CURVE_STEPS; step++) {
        addPoint(
          points,
          quadraticPoint(current, control, end, step / CURVE_STEPS),
        );
      }
      current = end;
      continue;
    }
    if (command.type === "C") {
      const controlA = { x: command.x1, y: command.y1 };
      const controlB = { x: command.x2, y: command.y2 };
      const end = { x: command.x, y: command.y };
      for (let step = 1; step <= CURVE_STEPS; step++) {
        addPoint(
          points,
          cubicPoint(current, controlA, controlB, end, step / CURVE_STEPS),
        );
      }
      current = end;
      continue;
    }
    if (command.type === "Z") {
      addPoint(points, start);
      current = start;
    }
  }
  return points;
}

export function normalizeBounds(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function resizeHandlePoints(bounds) {
  const midX = bounds.x + bounds.width / 2;
  const midY = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return [
    { id: "nw", point: { x: bounds.x, y: bounds.y } },
    { id: "n", point: { x: midX, y: bounds.y } },
    { id: "ne", point: { x: right, y: bounds.y } },
    { id: "e", point: { x: right, y: midY } },
    { id: "se", point: { x: right, y: bottom } },
    { id: "s", point: { x: midX, y: bottom } },
    { id: "sw", point: { x: bounds.x, y: bottom } },
    { id: "w", point: { x: bounds.x, y: midY } },
  ];
}

export function getPathBounds(path) {
  return boundsFromPoints(collectCommandPoints(path.commands));
}

export function getSelectedPathBounds(document, pathIds) {
  const selected = new Set(pathIds);
  const points = document.paths.flatMap((path) =>
    selected.has(path.id) ? collectCommandPoints(path.commands) : [],
  );
  return boundsFromPoints(points);
}

export function boundsIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function pathsInsideBounds(document, bounds) {
  return document.paths
    .filter((path) => {
      const pathBounds = getPathBounds(path);
      return pathBounds ? boundsIntersect(pathBounds, bounds) : false;
    })
    .map((path) => path.id);
}
