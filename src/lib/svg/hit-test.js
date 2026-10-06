import {
  cubicPoint,
  distance,
  distanceToSegment,
  quadraticPoint,
} from "./geometry";
import { commandPoint, getPathAnchors } from "./svg-path";

const CURVE_SAMPLE_STEPS = 28;

function flattenPath(path) {
  const rings = [];
  let ring = [];
  let current = null;
  let start = null;
  function push(point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    ring.push(point);
  }
  function closeRing() {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
    current = null;
    start = null;
  }
  for (const command of path.commands) {
    if (command.type === "M") {
      closeRing();
      current = { x: command.x, y: command.y };
      start = current;
      push(current);
      continue;
    }
    if (!current) continue;
    if (command.type === "L") {
      current = { x: command.x, y: command.y };
      push(current);
      continue;
    }
    if (command.type === "C") {
      const initial = current;
      for (let step = 1; step <= CURVE_SAMPLE_STEPS; step++) {
        push(
          cubicPoint(
            initial,
            { x: command.x1, y: command.y1 },
            { x: command.x2, y: command.y2 },
            { x: command.x, y: command.y },
            step / CURVE_SAMPLE_STEPS,
          ),
        );
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Q") {
      const initial = current;
      for (let step = 1; step <= CURVE_SAMPLE_STEPS; step++) {
        push(
          quadraticPoint(
            initial,
            { x: command.x1, y: command.y1 },
            { x: command.x, y: command.y },
            step / CURVE_SAMPLE_STEPS,
          ),
        );
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Z") {
      if (start) push(start);
      closeRing();
    }
  }
  closeRing();
  return rings;
}
function pointInRing(point, ring) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const a = ring[index];
    const b = ring[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function hitTestFill(path, point) {
  if (path.fill === "none") return false;
  const rings = flattenPath(path);
  if (rings.length === 0) return false;
  if (path.fillRule === "evenodd") {
    return rings.filter((ring) => pointInRing(point, ring)).length % 2 === 1;
  }
  return rings.some((ring) => pointInRing(point, ring));
}

function hitTestPath(path, point, tolerance) {
  let current = null;
  let start = null;
  for (const command of path.commands) {
    if (command.type === "M") {
      current = { x: command.x, y: command.y };
      start = current;
      continue;
    }
    if (!current) continue;
    if (command.type === "L") {
      const end = { x: command.x, y: command.y };
      if (distanceToSegment(point, current, end) <= tolerance) return true;
      current = end;
      continue;
    }
    if (command.type === "C") {
      let previous = current;
      for (let step = 1; step <= 28; step++) {
        const t = step / 28;
        const next = cubicPoint(
          current,
          { x: command.x1, y: command.y1 },
          { x: command.x2, y: command.y2 },
          { x: command.x, y: command.y },
          t,
        );
        if (distanceToSegment(point, previous, next) <= tolerance) return true;
        previous = next;
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Q") {
      let previous = current;
      for (let step = 1; step <= 24; step++) {
        const t = step / 24;
        const next = quadraticPoint(
          current,
          { x: command.x1, y: command.y1 },
          { x: command.x, y: command.y },
          t,
        );
        if (distanceToSegment(point, previous, next) <= tolerance) return true;
        previous = next;
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Z" && start) {
      if (distanceToSegment(point, current, start) <= tolerance) return true;
      current = start;
    }
  }
  return false;
}

export function hitTestSvgDocument({
  document,
  point,
  selectedPathId,
  tolerance,
}) {
  const selectedPath = document.paths.find(
    (path) => path.id === selectedPathId,
  );
  if (selectedPath) {
    const anchors = getPathAnchors(selectedPath.commands);
    for (const anchor of anchors) {
      if (anchor.inHandle && distance(point, anchor.inHandle) <= tolerance) {
        return {
          type: "handle",
          pathId: selectedPath.id,
          commandIndex: anchor.commandIndex,
          handle: "in",
        };
      }
      if (anchor.outHandle && distance(point, anchor.outHandle) <= tolerance) {
        return {
          type: "handle",
          pathId: selectedPath.id,
          commandIndex: anchor.commandIndex,
          handle: "out",
        };
      }
    }
    for (const anchor of anchors) {
      if (distance(point, anchor.point) <= tolerance) {
        return {
          type: "anchor",
          pathId: selectedPath.id,
          commandIndex: anchor.commandIndex,
        };
      }
    }
  }
  for (let index = document.paths.length - 1; index >= 0; index--) {
    const path = document.paths[index];
    if (hitTestPath(path, point, tolerance) || hitTestFill(path, point)) {
      return { type: "path", pathId: path.id };
    }
  }
  return null;
}

export function getPathPoint(path, commandIndex) {
  const command = path.commands[commandIndex];
  return command ? commandPoint(command) : null;
}
