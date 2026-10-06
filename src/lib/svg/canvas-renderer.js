import { resizeHandlePoints } from "./bounds";
import { DESIGN_GRID_SIZE } from "./geometry";
import { buildPenSegmentCommand, getPathAnchors } from "./svg-path";

const CANVAS_COLORS = {
  background: "#0d0d0d",
  grid: "#1a1a1a",
  frame: "#303030",
  selection: "#8aa7ff",
  handleFill: "#111111",
  selectedAnchorFill: "#f4efe6",
  preview: "#d6e1ff",
};

function pathToCanvasPath(commands) {
  const path = new Path2D();
  for (const command of commands) {
    if (command.type === "M") path.moveTo(command.x, command.y);
    else if (command.type === "L") path.lineTo(command.x, command.y);
    else if (command.type === "C") {
      path.bezierCurveTo(
        command.x1,
        command.y1,
        command.x2,
        command.y2,
        command.x,
        command.y,
      );
    } else if (command.type === "Q") {
      path.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
    } else if (command.type === "Z") {
      path.closePath();
    }
  }
  return path;
}

function drawAnchor(ctx, point, selected, zoom) {
  const size = selected ? 8 / zoom : 6 / zoom;
  ctx.fillStyle = selected
    ? CANVAS_COLORS.selectedAnchorFill
    : CANVAS_COLORS.handleFill;
  ctx.strokeStyle = CANVAS_COLORS.selection;
  ctx.lineWidth = 1.5 / zoom;
  ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
}

function drawHandle(ctx, point, zoom) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = CANVAS_COLORS.handleFill;
  ctx.strokeStyle = CANVAS_COLORS.selection;
  ctx.lineWidth = 1.5 / zoom;
  ctx.fill();
  ctx.stroke();
}

function drawPenPreview(ctx, preview, zoom) {
  if (preview.from) {
    const segment = buildPenSegmentCommand({
      from: preview.from,
      to: preview.to,
      handle: preview.handle,
      existing: null,
    });
    ctx.save();
    ctx.setLineDash([6 / zoom, 5 / zoom]);
    ctx.strokeStyle = CANVAS_COLORS.preview;
    ctx.lineWidth = 1.25 / zoom;
    ctx.beginPath();
    ctx.moveTo(preview.from.x, preview.from.y);
    if (segment.type === "C") {
      ctx.bezierCurveTo(
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
        segment.x,
        segment.y,
      );
    } else {
      ctx.lineTo(segment.x, segment.y);
    }
    ctx.stroke();
    ctx.restore();
    if (segment.type === "C") {
      drawHandle(ctx, { x: segment.x2, y: segment.y2 }, zoom);
    }
  }
  if (preview.handle) {
    ctx.save();
    ctx.strokeStyle = CANVAS_COLORS.selection;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(preview.to.x, preview.to.y);
    ctx.lineTo(preview.handle.x, preview.handle.y);
    ctx.stroke();
    ctx.restore();
    drawHandle(ctx, preview.handle, zoom);
  }
  drawAnchor(ctx, preview.to, true, zoom);
}
function drawGrid(ctx, width, height, viewport) {
  const gridSize = DESIGN_GRID_SIZE * viewport.zoom;
  if (gridSize < 4) return;
  ctx.beginPath();
  ctx.strokeStyle = CANVAS_COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = viewport.pan.x % gridSize; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = viewport.pan.y % gridSize; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawBounds(ctx, bounds, zoom, variant) {
  ctx.save();
  ctx.strokeStyle =
    variant === "selection" ? CANVAS_COLORS.selection : CANVAS_COLORS.preview;
  ctx.lineWidth = 1.25 / zoom;
  ctx.setLineDash(variant === "selection" ? [] : [5 / zoom, 4 / zoom]);
  if (variant === "marquee") {
    ctx.fillStyle = "rgba(138, 167, 255, 0.08)";
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  if (variant === "selection") drawResizeHandles(ctx, bounds, zoom);
  ctx.restore();
}

function drawResizeHandles(ctx, bounds, zoom) {
  const size = 8 / zoom;
  ctx.fillStyle = CANVAS_COLORS.handleFill;
  ctx.strokeStyle = CANVAS_COLORS.selection;
  ctx.lineWidth = 1.25 / zoom;
  for (const handle of resizeHandlePoints(bounds)) {
    ctx.fillRect(
      handle.point.x - size / 2,
      handle.point.y - size / 2,
      size,
      size,
    );
    ctx.strokeRect(
      handle.point.x - size / 2,
      handle.point.y - size / 2,
      size,
      size,
    );
  }
}

function drawShapePreview(ctx, preview, zoom) {
  const { bounds } = preview;
  ctx.save();
  ctx.strokeStyle = CANVAS_COLORS.preview;
  ctx.fillStyle = "rgba(214, 225, 255, 0.08)";
  ctx.lineWidth = 1.25 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  if (preview.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      Math.max(1, bounds.width / 2),
      Math.max(1, bounds.height / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  } else if (preview.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(bounds.x, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    ctx.stroke();
  } else {
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.restore();
}

export function drawSvgDocument({
  canvas,
  document,
  selectedPathIds,
  primarySelectedPathId,
  selectedCommandIndex,
  viewport,
  penPreview,
  selectedBounds,
  marqueeBounds,
  shapePreview,
}) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.floor(width * dpr);
  const pixelHeight = Math.floor(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = CANVAS_COLORS.background;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height, viewport);
  ctx.save();
  ctx.translate(viewport.pan.x, viewport.pan.y);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.strokeStyle = CANVAS_COLORS.frame;
  ctx.lineWidth = 1 / viewport.zoom;
  ctx.strokeRect(
    document.viewBox.x,
    document.viewBox.y,
    document.viewBox.width,
    document.viewBox.height,
  );
  const selectedPathIdSet = new Set(selectedPathIds);
  for (const path of document.paths) {
    if (path.hidden) continue;
    const canvasPath = pathToCanvasPath(path.commands);
    ctx.fillStyle = path.fill === "none" ? "transparent" : path.fill;
    ctx.strokeStyle = path.stroke === "none" ? "transparent" : path.stroke;
    ctx.lineWidth = Math.max(path.strokeWidth, 1) / viewport.zoom;
    if (path.fill !== "none") {
      ctx.fill(canvasPath, path.fillRule === "evenodd" ? "evenodd" : "nonzero");
    }
    if (path.stroke !== "none" && path.strokeWidth > 0) ctx.stroke(canvasPath);
    if (selectedPathIdSet.has(path.id)) {
      ctx.save();
      ctx.strokeStyle = CANVAS_COLORS.selection;
      ctx.lineWidth = 1.25 / viewport.zoom;
      ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
      ctx.stroke(canvasPath);
      ctx.restore();
    }
  }
  const selectedPath = document.paths.find(
    (path) => path.id === primarySelectedPathId,
  );
  if (selectedPath) {
    const anchors = getPathAnchors(selectedPath.commands);
    ctx.strokeStyle = CANVAS_COLORS.selection;
    ctx.lineWidth = 1 / viewport.zoom;
    for (const anchor of anchors) {
      if (anchor.inHandle) {
        ctx.beginPath();
        ctx.moveTo(anchor.point.x, anchor.point.y);
        ctx.lineTo(anchor.inHandle.x, anchor.inHandle.y);
        ctx.stroke();
        drawHandle(ctx, anchor.inHandle, viewport.zoom);
      }
      if (anchor.outHandle) {
        ctx.beginPath();
        ctx.moveTo(anchor.point.x, anchor.point.y);
        ctx.lineTo(anchor.outHandle.x, anchor.outHandle.y);
        ctx.stroke();
        drawHandle(ctx, anchor.outHandle, viewport.zoom);
      }
    }
    for (const anchor of anchors) {
      drawAnchor(
        ctx,
        anchor.point,
        anchor.commandIndex === selectedCommandIndex,
        viewport.zoom,
      );
    }
  }
  if (selectedBounds)
    drawBounds(ctx, selectedBounds, viewport.zoom, "selection");
  if (marqueeBounds) drawBounds(ctx, marqueeBounds, viewport.zoom, "marquee");
  if (shapePreview) drawShapePreview(ctx, shapePreview, viewport.zoom);
  if (penPreview) drawPenPreview(ctx, penPreview, viewport.zoom);
  ctx.restore();
}
