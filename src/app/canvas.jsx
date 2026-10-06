import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconClipboard,
  IconCopy,
  IconLayersLinked,
  IconLayersOff,
  IconSelectAll,
  IconTrash,
} from "@/ui/icons";
import {
  clampZoom,
  distance,
  formatZoom,
  screenToWorld,
  snapToGrid as snapPointToGrid,
  viewBoxToViewport,
  worldToScreen,
} from "@/lib/svg/geometry";
import {
  getSelectedPathBounds,
  normalizeBounds,
  pathsInsideBounds,
  resizeHandlePoints,
} from "@/lib/svg/bounds";
import { hitTestSvgDocument, getPathPoint } from "@/lib/svg/hit-test";
import { drawSvgDocument } from "@/lib/svg/canvas-renderer";
import { findLastCommandPoint, firstCommandPoint } from "@/lib/svg/svg-path";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/context-menu";
import { cn } from "@/lib/utils";

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function formatHudCoord(value) {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function isShapeTool(tool) {
  return tool === "rectangle" || tool === "ellipse" || tool === "line";
}

function shapeBoundsFromPoints(kind, start, current, lockRatio) {
  if (!lockRatio || kind === "line") return normalizeBounds(start, current);
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return normalizeBounds(start, {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  });
}

function hitResizeHandle(bounds, point, zoom) {
  if (!bounds) return null;
  const tolerance = 7 / zoom;
  for (const handle of resizeHandlePoints(bounds)) {
    if (
      Math.abs(handle.point.x - point.x) <= tolerance &&
      Math.abs(handle.point.y - point.y) <= tolerance
    ) {
      return handle.id;
    }
  }
  return null;
}

function nextResizeBounds(handle, initialBounds, point) {
  let left = initialBounds.x;
  let right = initialBounds.x + initialBounds.width;
  let top = initialBounds.y;
  let bottom = initialBounds.y + initialBounds.height;
  if (handle.includes("w")) left = point.x;
  if (handle.includes("e")) right = point.x;
  if (handle.includes("n")) top = point.y;
  if (handle.includes("s")) bottom = point.y;
  if (handle === "n" || handle === "s") {
    left = initialBounds.x;
    right = initialBounds.x + initialBounds.width;
  }
  if (handle === "e" || handle === "w") {
    top = initialBounds.y;
    bottom = initialBounds.y + initialBounds.height;
  }
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.max(1, Math.abs(right - left)),
    height: Math.max(1, Math.abs(bottom - top)),
  };
}

function cursorForResizeHandle(handle) {
  if (!handle) return undefined;
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}

export function DesignCanvas({
  document,
  selectedPathIds,
  primarySelectedPathId,
  selectedCommandIndex,
  tool,
  viewport,
  fitRequest,
  snapGuides,
  onViewportChange,
  onSelectPath,
  onSelectPaths,
  onSelectCommand,
  onMoveAnchor,
  onMoveHandle,
  onMovePaths,
  onCreateShape,
  onResizePaths,
  onAppendPoint,
  onShapePenPoint,
  onClosePath,
  onEditorKeyDown,
  onBeginEdit,
  onCommitEdit,
  onCopySelection,
  onPasteSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onSelectAll,
  onGroupSelection,
  onUngroupSelection,
  canGroup,
  canUngroup,
  editingGroupName,
  snapToGrid,
}) {
  const canvasRef = useRef(null);
  const dragStateRef = useRef(null);
  const didFitInitialViewportRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [hoverPoint, setHoverPoint] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [penDragPreview, setPenDragPreview] = useState(null);
  const [shapePreview, setShapePreview] = useState(null);
  const [marqueeBounds, setMarqueeBounds] = useState(null);
  const [hoverResizeHandle, setHoverResizeHandle] = useState(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [dragHud, setDragHud] = useState(null);
  const selectedPath = useMemo(
    () =>
      document.paths.find((path) => path.id === primarySelectedPathId) || null,
    [document.paths, primarySelectedPathId],
  );
  useEffect(() => {
    didFitInitialViewportRef.current = false;
  }, [
    document.viewBox.height,
    document.viewBox.width,
    document.viewBox.x,
    document.viewBox.y,
  ]);
  const penPreview = useMemo(() => {
    if (tool !== "pen") return null;
    if (penDragPreview) return penDragPreview;
    if (!hoverPoint || !selectedPath) return null;
    return {
      from: findLastCommandPoint(selectedPath.commands) || undefined,
      to: hoverPoint,
    };
  }, [hoverPoint, penDragPreview, selectedPath, tool]);
  const selectedBounds = useMemo(
    () => getSelectedPathBounds(document, selectedPathIds),
    [document, selectedPathIds],
  );
  const selectedPathName = selectedPath
    ? selectedPath.name
    : selectedPathIds.length > 1
      ? `${selectedPathIds.length} objects`
      : "No selection";
  function eventWorldPoint(event) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const point = screenToWorld(canvasPoint(canvas, event), viewport);
    return snapToGrid ? snapPointToGrid(point) : point;
  }
  function eventRawWorldPoint(event) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return screenToWorld(canvasPoint(canvas, event), viewport);
  }
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.code !== "Space" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setIsSpacePanning(true);
    }
    function handleKeyUp(event) {
      if (event.code === "Space") setIsSpacePanning(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      setCanvasSize({ width, height });
      if (!didFitInitialViewportRef.current && width > 0 && height > 0) {
        didFitInitialViewportRef.current = true;
        onViewportChange(viewBoxToViewport(document.viewBox, width, height));
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [document.viewBox, onViewportChange]);
  useEffect(() => {
    if (!fitRequest || !canvasSize.width || !canvasSize.height) return;
    onViewportChange(
      viewBoxToViewport(document.viewBox, canvasSize.width, canvasSize.height),
    );
  }, [
    canvasSize.height,
    canvasSize.width,
    document.viewBox,
    fitRequest,
    onViewportChange,
  ]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      drawSvgDocument({
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
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    canvasSize,
    document,
    penPreview,
    primarySelectedPathId,
    selectedCommandIndex,
    selectedBounds,
    selectedPathIds,
    marqueeBounds,
    shapePreview,
    viewport,
  ]);
  function startPan(event) {
    dragStateRef.current = {
      type: "pan",
      startScreen: { x: event.clientX, y: event.clientY },
      initialViewport: viewport,
    };
  }
  function handlePointerDown(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();
    if (event.button === 2) return;
    canvas.setPointerCapture(event.pointerId);
    const worldPoint = eventWorldPoint(event);
    const wantsPan = tool === "hand" || isSpacePanning || event.button === 1;
    if (wantsPan) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (tool === "select") {
      const resizeHandle = hitResizeHandle(
        selectedBounds,
        worldPoint,
        viewport.zoom,
      );
      if (resizeHandle && selectedBounds && selectedPathIds.length > 0) {
        onBeginEdit();
        dragStateRef.current = {
          type: "resize",
          handle: resizeHandle,
          pathIds: selectedPathIds,
          initialBounds: selectedBounds,
          initialDocument: document,
        };
        return;
      }
    }
    if (isShapeTool(tool)) {
      onSelectPath("");
      onSelectCommand(null);
      const bounds = shapeBoundsFromPoints(
        tool,
        worldPoint,
        worldPoint,
        event.shiftKey,
      );
      dragStateRef.current = {
        type: "shape",
        kind: tool,
        startWorldPoint: worldPoint,
        currentWorldPoint: worldPoint,
      };
      setShapePreview({ kind: tool, bounds });
      return;
    }
    if (tool === "pen") {
      const pathId = primarySelectedPathId;
      if (
        selectedPath &&
        selectedPath.commands.length > 2 &&
        !selectedPath.commands.some((command) => command.type === "Z")
      ) {
        const firstPoint = firstCommandPoint(selectedPath.commands);
        if (
          firstPoint &&
          distance(firstPoint, worldPoint) <= 10 / viewport.zoom
        ) {
          onBeginEdit();
          onClosePath();
          onCommitEdit("edit");
          return;
        }
      }
      onBeginEdit();
      const result = onAppendPoint(pathId, worldPoint);
      if (!result) {
        onCommitEdit("edit");
        return;
      }
      dragStateRef.current = {
        type: "pen-anchor",
        pathId: result.pathId,
        commandIndex: result.commandIndex,
        anchorPoint: result.anchorPoint,
        previousPoint: result.previousPoint,
      };
      return;
    }
    const target = hitTestSvgDocument({
      document,
      point: worldPoint,
      selectedPathId: primarySelectedPathId,
      tolerance: 9 / viewport.zoom,
    });
    if (!target) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      dragStateRef.current = {
        type: "marquee",
        startWorldPoint: worldPoint,
        additive,
        initialSelection: selectedPathIds,
        moved: false,
      };
      return;
    }
    const extend = event.shiftKey || event.metaKey || event.ctrlKey;
    const pathWasSelected = selectedPathIds.includes(target.pathId);
    if (extend || !pathWasSelected || selectedPathIds.length <= 1) {
      onSelectPath(
        target.pathId,
        extend,
        pathWasSelected && selectedPathIds.length === 1 ? "path" : "auto",
      );
    }
    if (target.type === "anchor") {
      onSelectCommand(target.commandIndex);
      onBeginEdit();
      dragStateRef.current = { type: "anchor", target };
    } else if (target.type === "handle") {
      onSelectCommand(target.commandIndex);
      onBeginEdit();
      dragStateRef.current = { type: "handle", target };
    } else {
      const path = document.paths.find((item) => item.id === target.pathId);
      if (path) {
        const commandIndex =
          getPathPoint(path, selectedCommandIndex ?? -1) !== null
            ? selectedCommandIndex
            : null;
        onSelectCommand(commandIndex);
      }
      if (!extend) {
        onBeginEdit();
        dragStateRef.current = {
          type: "path",
          pathIds: pathWasSelected ? selectedPathIds : [target.pathId],
          lastWorldPoint: worldPoint,
        };
      }
    }
  }
  function handlePointerMove(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const worldPoint = eventWorldPoint(event);
    if (tool === "pen" || isShapeTool(tool)) setHoverPoint(worldPoint);
    if (tool === "select" && !dragStateRef.current) {
      const resizeHandle = hitResizeHandle(
        selectedBounds,
        worldPoint,
        viewport.zoom,
      );
      setHoverResizeHandle(resizeHandle);
      if (resizeHandle) {
        setHoverTarget(null);
      } else {
        setHoverTarget(
          hitTestSvgDocument({
            document,
            point: worldPoint,
            selectedPathId: primarySelectedPathId,
            tolerance: 9 / viewport.zoom,
          }),
        );
      }
    }
    const dragState = dragStateRef.current;
    if (!dragState) return;
    const hudScreen = canvasPoint(canvas, event);
    if (dragState.type === "resize") {
      const nextBounds = nextResizeBounds(
        dragState.handle,
        dragState.initialBounds,
        worldPoint,
      );
      onResizePaths(
        dragState.pathIds,
        dragState.initialBounds,
        nextBounds,
        dragState.initialDocument,
      );
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(nextBounds.width)} × ${formatHudCoord(nextBounds.height)}`,
        secondary: `${formatHudCoord(nextBounds.x)}, ${formatHudCoord(nextBounds.y)}`,
        snap: snapToGrid,
      });
      return;
    }
    if (dragState.type === "pan") {
      onViewportChange({
        ...viewport,
        pan: {
          x:
            dragState.initialViewport.pan.x +
            event.clientX -
            dragState.startScreen.x,
          y:
            dragState.initialViewport.pan.y +
            event.clientY -
            dragState.startScreen.y,
        },
      });
      return;
    }
    if (dragState.type === "pen-anchor") {
      const shouldShapeCurve = distance(dragState.anchorPoint, worldPoint) > 3;
      onShapePenPoint(
        dragState.pathId,
        dragState.commandIndex,
        dragState.anchorPoint,
        worldPoint,
      );
      setPenDragPreview({
        from: dragState.previousPoint || undefined,
        to: dragState.anchorPoint,
        handle: shouldShapeCurve ? worldPoint : undefined,
      });
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(dragState.anchorPoint.x)}, ${formatHudCoord(dragState.anchorPoint.y)}`,
        secondary: shouldShapeCurve ? "curve" : "anchor",
        snap: snapToGrid,
      });
      return;
    }
    if (dragState.type === "path") {
      const delta = {
        x: worldPoint.x - dragState.lastWorldPoint.x,
        y: worldPoint.y - dragState.lastWorldPoint.y,
      };
      if (delta.x !== 0 || delta.y !== 0) {
        onMovePaths(dragState.pathIds, delta);
        dragState.lastWorldPoint = worldPoint;
      }
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(worldPoint.x)}, ${formatHudCoord(worldPoint.y)}`,
        secondary:
          dragState.pathIds.length > 1
            ? `${dragState.pathIds.length} paths`
            : "move",
        snap: snapToGrid,
      });
      return;
    }
    if (dragState.type === "shape") {
      dragState.currentWorldPoint = worldPoint;
      const bounds = shapeBoundsFromPoints(
        dragState.kind,
        dragState.startWorldPoint,
        worldPoint,
        event.shiftKey,
      );
      setShapePreview({
        kind: dragState.kind,
        bounds,
      });
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(bounds.width)} × ${formatHudCoord(bounds.height)}`,
        secondary: dragState.kind,
        snap: snapToGrid,
      });
      return;
    }
    if (dragState.type === "marquee") {
      const bounds = normalizeBounds(dragState.startWorldPoint, worldPoint);
      dragState.moved =
        dragState.moved ||
        distance(dragState.startWorldPoint, worldPoint) > 4 / viewport.zoom;
      setMarqueeBounds(bounds);
      const nextIds = pathsInsideBounds(document, bounds);
      onSelectPaths(
        dragState.additive
          ? Array.from(new Set([...dragState.initialSelection, ...nextIds]))
          : nextIds,
      );
      setDragHud({
        screen: hudScreen,
        primary: `${nextIds.length} selected`,
        secondary: `${formatHudCoord(bounds.width)} × ${formatHudCoord(bounds.height)}`,
      });
      return;
    }
    if (dragState.type === "anchor") {
      onMoveAnchor(
        dragState.target.pathId,
        dragState.target.commandIndex,
        worldPoint,
      );
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(worldPoint.x)}, ${formatHudCoord(worldPoint.y)}`,
        secondary: "anchor",
        snap: snapToGrid,
      });
    } else {
      onMoveHandle(
        dragState.target.pathId,
        dragState.target.commandIndex,
        dragState.target.handle,
        worldPoint,
      );
      setDragHud({
        screen: hudScreen,
        primary: `${formatHudCoord(worldPoint.x)}, ${formatHudCoord(worldPoint.y)}`,
        secondary: `handle ${dragState.target.handle === "in" ? "in" : "out"}`,
        snap: snapToGrid,
      });
    }
  }
  function handlePointerUp(event) {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    setPenDragPreview(null);
    setDragHud(null);
    if (dragState?.type === "shape") {
      const bounds = shapePreview || {
        kind: dragState.kind,
        bounds: shapeBoundsFromPoints(
          dragState.kind,
          dragState.startWorldPoint,
          dragState.currentWorldPoint,
          event.shiftKey,
        ),
      };
      setShapePreview(null);
      const isClick =
        distance(dragState.startWorldPoint, dragState.currentWorldPoint) <=
        4 / viewport.zoom;
      if (isClick) return;
      onBeginEdit();
      onCreateShape(dragState.kind, bounds.bounds);
      onCommitEdit("create");
      return;
    }
    if (dragState?.type === "marquee") {
      setMarqueeBounds(null);
      if (!dragState.moved && !dragState.additive) {
        onSelectPath("");
        onSelectCommand(null);
      }
      return;
    }
    if (dragState && dragState.type !== "pan") onCommitEdit("edit");
  }
  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const screenPoint = canvasPoint(canvas, event);
        const worldBefore = screenToWorld(screenPoint, viewport);
        const nextZoom = clampZoom(
          viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08),
        );
        onViewportChange({
          zoom: nextZoom,
          pan: {
            x: screenPoint.x - worldBefore.x * nextZoom,
            y: screenPoint.y - worldBefore.y * nextZoom,
          },
        });
        return;
      }
      onViewportChange({
        ...viewport,
        pan: {
          x: viewport.pan.x - (event.shiftKey ? event.deltaY : event.deltaX),
          y: viewport.pan.y - (event.shiftKey ? 0 : event.deltaY),
        },
      });
    },
    [onViewportChange, viewport],
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleNativeWheel = (event) => {
      handleWheel(event);
    };
    const preventBrowserGesture = (event) => {
      event.preventDefault();
    };
    const options = { passive: false };
    canvas.addEventListener("wheel", handleNativeWheel, options);
    canvas.addEventListener("gesturestart", preventBrowserGesture, options);
    canvas.addEventListener("gesturechange", preventBrowserGesture, options);
    return () => {
      canvas.removeEventListener("wheel", handleNativeWheel, options);
      canvas.removeEventListener(
        "gesturestart",
        preventBrowserGesture,
        options,
      );
      canvas.removeEventListener(
        "gesturechange",
        preventBrowserGesture,
        options,
      );
    };
  }, [handleWheel]);
  function handleDoubleClick(event) {
    if (tool !== "select") {
      if (selectedPath) onClosePath();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = eventRawWorldPoint(event);
    const target = hitTestSvgDocument({
      document,
      point,
      selectedPathId: "",
      tolerance: 9 / viewport.zoom,
    });
    if (!target?.pathId) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectPath(target.pathId, false, "path");
    onSelectCommand(null);
  }
  function handleCanvasContextMenu(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();
    const point = eventRawWorldPoint(event);
    const target = hitTestSvgDocument({
      document,
      point,
      selectedPathId: "",
      tolerance: 9 / viewport.zoom,
    });
    if (target?.type === "path" && !selectedPathIds.includes(target.pathId)) {
      onSelectPath(target.pathId, false, "auto");
      onSelectCommand(null);
    }
  }
  const cursorClass =
    tool === "pen"
      ? "cursor-crosshair"
      : isShapeTool(tool)
        ? "cursor-crosshair"
        : tool === "hand" || isSpacePanning
          ? "cursor-grab active:cursor-grabbing"
          : hoverTarget?.type === "anchor" || hoverTarget?.type === "handle"
            ? "cursor-move"
            : hoverTarget
              ? "cursor-pointer"
              : "cursor-default";
  const cursorStyle = cursorForResizeHandle(hoverResizeHandle);
  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          <canvas
            ref={canvasRef}
            role="application"
            aria-label="SVG vector canvas"
            tabIndex={0}
            className={cn(
              "absolute inset-0 block h-full w-full touch-none bg-background outline-none focus-visible:ring-1 focus-visible:ring-ring/40",
              cursorClass,
            )}
            style={cursorStyle ? { cursor: cursorStyle } : undefined}
            onContextMenu={handleCanvasContextMenu}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={onEditorKeyDown}
            onPointerLeave={() => {
              if (!dragStateRef.current) {
                setHoverPoint(null);
                setHoverTarget(null);
                setHoverResizeHandle(null);
              }
            }}
          />
          {snapGuides.length > 0 &&
          canvasSize.width > 0 &&
          canvasSize.height > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0"
              width={canvasSize.width}
              height={canvasSize.height}
              aria-hidden="true"
            >
              {snapGuides.map((guide, index) => {
                if (guide.axis === "x") {
                  const screenX = worldToScreen(
                    { x: guide.position, y: 0 },
                    viewport,
                  ).x;
                  const startY = worldToScreen(
                    { x: 0, y: guide.start },
                    viewport,
                  ).y;
                  const endY = worldToScreen(
                    { x: 0, y: guide.end },
                    viewport,
                  ).y;
                  return (
                    <line
                      key={`guide-x-${index}`}
                      x1={screenX}
                      x2={screenX}
                      y1={startY}
                      y2={endY}
                      stroke="oklch(0.7 0.18 350)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  );
                }
                const screenY = worldToScreen(
                  { x: 0, y: guide.position },
                  viewport,
                ).y;
                const startX = worldToScreen(
                  { x: guide.start, y: 0 },
                  viewport,
                ).x;
                const endX = worldToScreen({ x: guide.end, y: 0 }, viewport).x;
                return (
                  <line
                    key={`guide-y-${index}`}
                    x1={startX}
                    x2={endX}
                    y1={screenY}
                    y2={screenY}
                    stroke="oklch(0.7 0.18 350)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                );
              })}
            </svg>
          ) : null}
          {dragHud ? (
            <div
              className="pointer-events-none absolute z-10 flex h-6 items-center gap-2 frame bg-background/95 px-2 text-foreground shadow-sm backdrop-blur"
              style={{
                left: Math.max(
                  8,
                  Math.min(canvasSize.width - 160, dragHud.screen.x + 14),
                ),
                top: Math.max(
                  8,
                  Math.min(canvasSize.height - 40, dragHud.screen.y + 16),
                ),
              }}
            >
              <span>{dragHud.primary}</span>
              {dragHud.secondary ? (
                <span className="text-muted-foreground/70">
                  · {dragHud.secondary}
                </span>
              ) : null}
              {dragHud.snap ? (
                <span
                  className="frame px-1 text-foreground/70"
                  title="10px grid snap"
                  aria-label="10px grid snap active"
                >
                  10
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div className="flex h-6 min-w-0 items-center gap-2 frame bg-background/85 px-2 text-muted-foreground backdrop-blur">
              <span className="truncate text-foreground">
                {selectedPathName}
              </span>
              {editingGroupName ? (
                <span className="frame px-1 uppercase text-primary">
                  Editing {editingGroupName}
                </span>
              ) : null}
              <span>{selectedPathIds.length || 0} selected</span>
              {selectedCommandIndex !== null ? (
                <span>point {selectedCommandIndex}</span>
              ) : null}
            </div>
            <div className="flex h-6 items-center gap-2 frame bg-background/85 px-2 text-muted-foreground backdrop-blur">
              <span>{formatZoom(viewport.zoom)}</span>
              <span>{snapToGrid ? "10px" : "free"}</span>
              {hoverPoint ? (
                <span>
                  {Math.round(hoverPoint.x)}, {Math.round(hoverPoint.y)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent side="right" align="start" className="min-w-44">
        <ContextMenuItem onClick={onSelectAll}>
          <IconSelectAll />
          Select all
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={selectedPathIds.length === 0}
          onClick={onCopySelection}
        >
          <IconCopy />
          Copy
        </ContextMenuItem>
        <ContextMenuItem onClick={onPasteSelection}>
          <IconClipboard />
          Paste
        </ContextMenuItem>
        <ContextMenuItem
          disabled={selectedPathIds.length === 0}
          onClick={onDuplicateSelection}
        >
          <IconCopy />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canGroup} onClick={onGroupSelection}>
          <IconLayersLinked />
          Group
        </ContextMenuItem>
        <ContextMenuItem disabled={!canUngroup} onClick={onUngroupSelection}>
          <IconLayersOff />
          Ungroup
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={selectedPathIds.length === 0}
          variant="destructive"
          onClick={onDeleteSelection}
        >
          <IconTrash />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
