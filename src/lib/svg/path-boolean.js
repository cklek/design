import { difference, intersection, union, xor } from "polygon-clipping";
import { cubicPoint, distance, quadraticPoint } from "./geometry";
import { serializePathData } from "./svg-path";

const CURVE_SAMPLE_COUNT = 24;
const POINT_EPSILON = 0.001;

function pointsEqual(a, b) {
  return distance(a, b) <= POINT_EPSILON;
}

function pushPoint(points, point) {
  const previous = points.at(-1);
  if (!previous || !pointsEqual(previous, point)) points.push(point);
}

function closeRing(points) {
  if (points.length < 3) return null;
  const ring = [...points];
  if (!pointsEqual(ring[0], ring.at(-1))) ring.push(ring[0]);
  return ring.map((point) => [point.x, point.y]);
}

export function flattenPathCommands(commands) {
  const rings = [];
  let current = null;
  let start = null;
  let subpath = [];
  function flushSubpath() {
    const ring = closeRing(subpath);
    if (ring) rings.push(ring);
    current = null;
    start = null;
    subpath = [];
  }
  for (const command of commands) {
    if (command.type === "M") {
      flushSubpath();
      current = { x: command.x, y: command.y };
      start = current;
      subpath = [current];
      continue;
    }
    if (!current) continue;
    if (command.type === "L") {
      current = { x: command.x, y: command.y };
      pushPoint(subpath, current);
      continue;
    }
    if (command.type === "C") {
      const startPoint = current;
      for (let step = 1; step <= CURVE_SAMPLE_COUNT; step++) {
        pushPoint(
          subpath,
          cubicPoint(
            startPoint,
            { x: command.x1, y: command.y1 },
            { x: command.x2, y: command.y2 },
            { x: command.x, y: command.y },
            step / CURVE_SAMPLE_COUNT,
          ),
        );
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Q") {
      const startPoint = current;
      for (let step = 1; step <= CURVE_SAMPLE_COUNT; step++) {
        pushPoint(
          subpath,
          quadraticPoint(
            startPoint,
            { x: command.x1, y: command.y1 },
            { x: command.x, y: command.y },
            step / CURVE_SAMPLE_COUNT,
          ),
        );
      }
      current = { x: command.x, y: command.y };
      continue;
    }
    if (command.type === "Z") {
      if (start) pushPoint(subpath, start);
      flushSubpath();
    }
  }
  flushSubpath();
  return rings;
}

function pathToMultiPolygon(path) {
  const rings = flattenPathCommands(path.commands);
  return rings.map((ring) => [ring]);
}

function multiPolygonIsEmpty(result) {
  return result.every((polygon) => polygon.every((ring) => ring.length < 4));
}

function ringToCommands(ring) {
  const commands = [];
  const cleanRing = ring
    .map(([x, y]) => ({ x, y }))
    .filter((point, index, points) => {
      const previous = points[index - 1];
      return !previous || !pointsEqual(previous, point);
    });
  const uniquePoints =
    cleanRing.length > 1 && pointsEqual(cleanRing[0], cleanRing.at(-1))
      ? cleanRing.slice(0, -1)
      : cleanRing;
  uniquePoints.forEach((point, index) => {
    commands.push({ type: index === 0 ? "M" : "L", ...point });
  });
  if (uniquePoints.length >= 3) commands.push({ type: "Z" });
  return commands;
}

function multiPolygonToPaths({ result, template, operation, idBase }) {
  const paths = [];
  let index = 1;
  for (const polygon of result) {
    const commands = polygon.flatMap((ring) => ringToCommands(ring));
    if (commands.length < 4) continue;
    const id = `${idBase}-${index}`;
    paths.push({
      id,
      name: `${operation} ${index}`,
      d: serializePathData(commands),
      commands,
      fill: template.fill === "none" ? template.stroke : template.fill,
      stroke: "none",
      strokeWidth: 0,
      fillRule: "evenodd",
    });
    index += 1;
  }
  return paths;
}

function validateBooleanInputs(paths) {
  if (paths.length < 2) {
    throw new Error("Select at least two paths for a boolean operation.");
  }
  const geometries = paths.map(pathToMultiPolygon);
  if (geometries.some((geometry) => geometry.length === 0)) {
    throw new Error("Boolean operations require closed filled paths.");
  }
  return geometries;
}

function unionGeometries(geometries) {
  const first = geometries[0];
  if (!first) return [];
  return union(first, ...geometries.slice(1));
}

function intersectionGeometries(geometries) {
  const first = geometries[0];
  if (!first) return [];
  return intersection(first, ...geometries.slice(1));
}

function xorGeometries(geometries) {
  const first = geometries[0];
  if (!first) return [];
  return xor(first, ...geometries.slice(1));
}

function differenceGeometries(geometries) {
  const first = geometries[0];
  if (!first) return [];
  return difference(first, ...geometries.slice(1));
}

export function applySvgBooleanOperation(paths, operation) {
  const geometries = validateBooleanInputs(paths);
  const template = paths[0];
  const idBase = `${operation}-${Date.now().toString(36)}`;
  if (operation === "divide") {
    const first = geometries[0];
    const rest = unionGeometries(geometries.slice(1));
    const pieces = [
      difference(first, rest),
      difference(rest, first),
      intersectionGeometries([first, rest]),
    ].filter((piece) => !multiPolygonIsEmpty(piece));
    return pieces.flatMap((piece, index) =>
      multiPolygonToPaths({
        result: piece,
        template,
        operation,
        idBase: `${idBase}-${index + 1}`,
      }),
    );
  }
  const result =
    operation === "union"
      ? unionGeometries(geometries)
      : operation === "subtract"
        ? differenceGeometries(geometries)
        : operation === "intersect"
          ? intersectionGeometries(geometries)
          : xorGeometries(geometries);
  const pathsFromResult = multiPolygonToPaths({
    result,
    template,
    operation,
    idBase,
  });
  if (pathsFromResult.length === 0) {
    throw new Error("The selected paths did not produce visible geometry.");
  }
  return pathsFromResult;
}
