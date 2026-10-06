import { getPathBounds } from "./bounds";
import { translatePathBy } from "./operations";

function pathWithBounds(paths) {
  return paths
    .map((path) => {
      const bounds = getPathBounds(path);
      return bounds ? { path, bounds } : null;
    })
    .filter((entry) => entry !== null);
}

function selectionBounds(entries) {
  if (entries.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entry of entries) {
    minX = Math.min(minX, entry.bounds.x);
    minY = Math.min(minY, entry.bounds.y);
    maxX = Math.max(maxX, entry.bounds.x + entry.bounds.width);
    maxY = Math.max(maxY, entry.bounds.y + entry.bounds.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function alignmentTarget(bounds, selection, mode) {
  switch (mode) {
    case "left":
      return { dx: selection.x - bounds.x, dy: 0 };
    case "h-center":
      return {
        dx: selection.x + selection.width / 2 - (bounds.x + bounds.width / 2),
        dy: 0,
      };
    case "right":
      return {
        dx: selection.x + selection.width - (bounds.x + bounds.width),
        dy: 0,
      };
    case "top":
      return { dx: 0, dy: selection.y - bounds.y };
    case "middle":
      return {
        dx: 0,
        dy: selection.y + selection.height / 2 - (bounds.y + bounds.height / 2),
      };
    case "bottom":
      return {
        dx: 0,
        dy: selection.y + selection.height - (bounds.y + bounds.height),
      };
  }
}

export function alignDocumentPaths(document, pathIds, mode) {
  const selected = new Set(pathIds);
  const selectedEntries = pathWithBounds(
    document.paths.filter((path) => selected.has(path.id)),
  );
  if (selectedEntries.length < 2) return document;
  const selectionBox = selectionBounds(selectedEntries);
  if (!selectionBox) return document;
  const moves = new Map();
  for (const { path, bounds } of selectedEntries) {
    moves.set(path.id, alignmentTarget(bounds, selectionBox, mode));
  }
  return {
    ...document,
    paths: document.paths.map((path) => {
      const move = moves.get(path.id);
      if (!move || (move.dx === 0 && move.dy === 0)) return path;
      return translatePathBy(path, { x: move.dx, y: move.dy });
    }),
  };
}

export function distributeDocumentPaths(document, pathIds, axis) {
  const selected = new Set(pathIds);
  const entries = pathWithBounds(
    document.paths.filter((path) => selected.has(path.id)),
  );
  if (entries.length < 3) return document;
  const sorted = entries
    .slice()
    .sort((a, b) =>
      axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y,
    );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sizeSum = sorted.reduce(
    (total, entry) =>
      total +
      (axis === "horizontal" ? entry.bounds.width : entry.bounds.height),
    0,
  );
  const span =
    axis === "horizontal"
      ? last.bounds.x + last.bounds.width - first.bounds.x
      : last.bounds.y + last.bounds.height - first.bounds.y;
  const gap = (span - sizeSum) / Math.max(1, sorted.length - 1);
  const moves = new Map();
  let cursor = axis === "horizontal" ? first.bounds.x : first.bounds.y;
  for (const entry of sorted) {
    const size =
      axis === "horizontal" ? entry.bounds.width : entry.bounds.height;
    const target = cursor;
    const current = axis === "horizontal" ? entry.bounds.x : entry.bounds.y;
    const delta = target - current;
    moves.set(entry.path.id, {
      dx: axis === "horizontal" ? delta : 0,
      dy: axis === "vertical" ? delta : 0,
    });
    cursor += size + gap;
  }
  return {
    ...document,
    paths: document.paths.map((path) => {
      const move = moves.get(path.id);
      if (!move || (move.dx === 0 && move.dy === 0)) return path;
      return translatePathBy(path, { x: move.dx, y: move.dy });
    }),
  };
}

const SNAP_THRESHOLD_BASE = 6;

export function computeSnapAdjustment(
  document,
  draggedIds,
  proposedDelta,
  zoom,
) {
  const draggedSet = new Set(draggedIds);
  const draggedEntries = pathWithBounds(
    document.paths.filter((path) => draggedSet.has(path.id)),
  );
  const otherEntries = pathWithBounds(
    document.paths.filter((path) => !draggedSet.has(path.id)),
  );
  if (draggedEntries.length === 0 || otherEntries.length === 0) {
    return { delta: proposedDelta, guides: [] };
  }
  const draggedBox = selectionBounds(draggedEntries);
  if (!draggedBox) return { delta: proposedDelta, guides: [] };
  const proposedBox = {
    x: draggedBox.x + proposedDelta.x,
    y: draggedBox.y + proposedDelta.y,
    width: draggedBox.width,
    height: draggedBox.height,
  };
  const threshold = SNAP_THRESHOLD_BASE / Math.max(0.1, zoom);
  const verticalCandidates = otherEntries.flatMap(({ bounds }) => [
    bounds.x,
    bounds.x + bounds.width / 2,
    bounds.x + bounds.width,
  ]);
  const horizontalCandidates = otherEntries.flatMap(({ bounds }) => [
    bounds.y,
    bounds.y + bounds.height / 2,
    bounds.y + bounds.height,
  ]);
  const xMarkers = [
    proposedBox.x,
    proposedBox.x + proposedBox.width / 2,
    proposedBox.x + proposedBox.width,
  ];
  const yMarkers = [
    proposedBox.y,
    proposedBox.y + proposedBox.height / 2,
    proposedBox.y + proposedBox.height,
  ];
  let bestX = null;
  for (let markerIndex = 0; markerIndex < xMarkers.length; markerIndex += 1) {
    for (const candidate of verticalCandidates) {
      const distance = Math.abs(candidate - xMarkers[markerIndex]);
      if (distance > threshold) continue;
      if (!bestX || distance < bestX.distance) {
        bestX = { candidate, markerIndex, distance };
      }
    }
  }
  let bestY = null;
  for (let markerIndex = 0; markerIndex < yMarkers.length; markerIndex += 1) {
    for (const candidate of horizontalCandidates) {
      const distance = Math.abs(candidate - yMarkers[markerIndex]);
      if (distance > threshold) continue;
      if (!bestY || distance < bestY.distance) {
        bestY = { candidate, markerIndex, distance };
      }
    }
  }
  const guides = [];
  const snappedDelta = { ...proposedDelta };
  if (bestX) {
    const offset = bestX.candidate - xMarkers[bestX.markerIndex];
    snappedDelta.x = proposedDelta.x + offset;
    const snapX = bestX.candidate;
    const yStart = Math.min(
      proposedBox.y + offset * 0,
      ...otherEntries.map(({ bounds }) => bounds.y),
    );
    const yEnd = Math.max(
      proposedBox.y + proposedBox.height,
      ...otherEntries.map(({ bounds }) => bounds.y + bounds.height),
    );
    guides.push({ axis: "x", position: snapX, start: yStart, end: yEnd });
  }
  if (bestY) {
    const offset = bestY.candidate - yMarkers[bestY.markerIndex];
    snappedDelta.y = proposedDelta.y + offset;
    const snapY = bestY.candidate;
    const xStart = Math.min(
      proposedBox.x,
      ...otherEntries.map(({ bounds }) => bounds.x),
    );
    const xEnd = Math.max(
      proposedBox.x + proposedBox.width,
      ...otherEntries.map(({ bounds }) => bounds.x + bounds.width),
    );
    guides.push({ axis: "y", position: snapY, start: xStart, end: xEnd });
  }
  return { delta: snappedDelta, guides };
}
