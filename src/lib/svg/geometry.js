export const DESIGN_GRID_SIZE = 10;

export function clampZoom(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(0.1, value));
}

export function formatZoom(value) {
  return `${Math.round(clampZoom(value) * 100)}%`;
}

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.pan.x) / viewport.zoom,
    y: (point.y - viewport.pan.y) / viewport.zoom,
  };
}

export function worldToScreen(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.pan.x,
    y: point.y * viewport.zoom + viewport.pan.y,
  };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapNumberToGrid(value, gridSize = DESIGN_GRID_SIZE) {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(gridSize) || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapToGrid(point, gridSize = DESIGN_GRID_SIZE) {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return point;
  return {
    x: snapNumberToGrid(point.x, gridSize),
    y: snapNumberToGrid(point.y, gridSize),
  };
}

export function snapBoundsToGrid(bounds, gridSize = DESIGN_GRID_SIZE) {
  const x = snapNumberToGrid(bounds.x, gridSize);
  const y = snapNumberToGrid(bounds.y, gridSize);
  return {
    x,
    y,
    width: Math.max(gridSize, snapNumberToGrid(bounds.width, gridSize)),
    height: Math.max(gridSize, snapNumberToGrid(bounds.height, gridSize)),
  };
}

export function cubicPoint(start, c1, c2, end, t) {
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * start.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * end.x,
    y:
      mt * mt * mt * start.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * end.y,
  };
}

export function quadraticPoint(start, c1, end, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * c1.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * c1.y + t * t * end.y,
  };
}

export function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

export function viewBoxToViewport(viewBox, canvasWidth, canvasHeight) {
  const inset = 72;
  const zoom = clampZoom(
    Math.min(
      (canvasWidth - inset * 2) / viewBox.width,
      (canvasHeight - inset * 2) / viewBox.height,
    ),
  );
  return {
    zoom,
    pan: {
      x: (canvasWidth - viewBox.width * zoom) / 2 - viewBox.x * zoom,
      y: (canvasHeight - viewBox.height * zoom) / 2 - viewBox.y * zoom,
    },
  };
}
