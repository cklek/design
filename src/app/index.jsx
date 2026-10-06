import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  commitSvgEditorHistory,
  emptySvgEditorHistory,
  redoSvgEditorHistory,
  undoSvgEditorHistory,
} from "@/lib/svg/editor-history";
import { defaultDocumentForSlug } from "@/lib/svg/workspace";
import { getSelectedPathBounds } from "@/lib/svg/bounds";
import {
  DESIGN_GRID_SIZE,
  clampZoom,
  snapBoundsToGrid,
  snapToGrid as snapPointToGrid,
} from "@/lib/svg/geometry";
import { applySvgBooleanOperation } from "@/lib/svg/path-boolean";
import {
  alignDocumentPaths,
  computeSnapAdjustment,
  distributeDocumentPaths,
} from "@/lib/svg/alignment";
import {
  parseSvgDocument,
  serializeSvgDocument,
  updateDocumentPath,
} from "@/lib/svg/svg-document";
import { rotateDocumentPaths } from "@/lib/svg/transform";
import {
  closePathCommands,
  cornerAnchor,
  deletePathCommand,
  findLastCommandPoint,
  isClosedPath,
  serializePathData,
  shapePenSegment,
  smoothAnchor,
  updatePathAnchor,
  updatePathHandle,
} from "@/lib/svg/svg-path";
import { normalizeDesignFontFamily } from "@/lib/svg/types";
import {
  createEmptyPath,
  createEllipsePath,
  createLinePath,
  createRectanglePath,
  duplicateCommandOffset,
  resizeDocumentPathsToBounds,
  resizePathToBounds,
  setPathsHidden,
  translateCommandBy,
  translateDocumentPathsBy,
  updatePathCommands,
} from "@/lib/svg/operations";
import {
  describeGroup,
  expandSelectionToGroups,
  findPath,
  firstPathIds,
  groupPathIds,
  nextSelectionForClick,
  pathsWithIds,
  pruneSelection,
  selectedGroupOf,
  selectionHasGroup,
  sharedGroupId,
  toggleGroupInSelection,
  uniquePathIds,
} from "@/lib/svg/selection";
import {
  groupPaths,
  renameGroupIn,
  reorderPaths,
  replacePaths,
  ungroupPaths,
} from "@/lib/svg/layers";
import {
  copyPaths,
  looksLikeSvg,
  pathsFromPastedSvg,
  serializePaths,
  svgFileFrom,
  svgFromClipboardData,
  svgFromClipboardText,
} from "@/lib/svg/clipboard";
import { isTypingTarget } from "@/lib/dom";
import { useSearchParam, useUpdateSearchParams } from "@/lib/url-query-state";
import { useAppDialog } from "@/shell/dialog";
import { useAppMenu } from "@/shell/menu-context";
import { AppLayout } from "@/shell/layout";
import { IconFolder } from "@/ui/icons";
import { ScrollArea } from "@/ui/scroll-area";
import { DesignCanvas } from "./canvas";
import { LayersPanel } from "./layers-panel";
import { PaneCollapsedRail, PaneIdleFade } from "./panel-shell";
import { PropertiesPanel } from "./properties-panel";
import { EditorToolbar } from "./toolbar";
import { resolveCanvasShortcut, resolveEditorShortcut } from "./shortcuts";
import {
  readActiveSlug,
  readInitialCanvas,
  readSnapToGrid,
  readStoredCanvas,
  writeCanvasSource,
  writeSnapToGrid,
} from "./storage";
import { useDocumentSync } from "./use-document-sync";

const PASTE_OFFSET = { x: DESIGN_GRID_SIZE * 2, y: DESIGN_GRID_SIZE * 2 };
const HOME_VIEWPORT = { pan: { x: 0, y: 0 }, zoom: 1 };

function FileMenu({ onNewCanvas, onPasteSvg, activeSlug }) {
  useAppMenu(
    {
      file: [
        { id: "new-doc", label: "New canvas", onSelect: onNewCanvas },
        {
          id: "paste-svg",
          label: "Paste SVG",
          shortcut: "⌘V",
          onSelect: onPasteSvg,
        },
        { id: "sep-1", kind: "separator" },
        {
          id: "copy-link",
          label: "Copy link to this canvas",
          onSelect: () => {
            void navigator.clipboard
              .writeText(window.location.href)
              .then(() => toast.success("Link copied."))
              .catch(() => toast.error("Could not reach the clipboard."));
          },
        },
      ],
    },
    [activeSlug, onNewCanvas, onPasteSvg],
  );
  return null;
}

export default function DesignPage() {
  const dialog = useAppDialog();
  const requestedFileSlug = useSearchParam("file");
  const requestedDocSlug = useSearchParam("doc");
  const requestedSlug = requestedFileSlug || requestedDocSlug;
  const updateQuery = useUpdateSearchParams();

  const [activeSlug, setActiveSlug] = useState(
    () => requestedSlug || readActiveSlug(),
  );
  const [document, setDocument] = useState(() => readInitialCanvas(activeSlug));
  const [source, setSource] = useState(() => serializeSvgDocument(document));
  const [sourceError, setSourceError] = useState("");
  const [history, setHistory] = useState(emptySvgEditorHistory);
  const [selectedPathIds, setSelectedPathIds] = useState(() =>
    firstPathIds(document),
  );
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [tool, setTool] = useState("select");
  const [snapToGrid, setSnapToGrid] = useState(readSnapToGrid);
  const [viewport, setViewport] = useState(HOME_VIEWPORT);
  const [fitRequest, setFitRequest] = useState(0);
  const [snapGuides, setSnapGuides] = useState([]);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);

  const documentRef = useRef(document);
  const continuousSnapshotRef = useRef(null);
  const clipboardRef = useRef([]);
  const copiedSvgRef = useRef("");
  const preferInternalPasteRef = useRef(false);

  const primarySelectedPathId = selectedPathIds.at(-1) || "";
  const selectedPath = useMemo(
    () => findPath(document, primarySelectedPathId),
    [document, primarySelectedPathId],
  );
  const selectedBounds = useMemo(
    () => getSelectedPathBounds(document, selectedPathIds),
    [document, selectedPathIds],
  );
  const selectedGroup = useMemo(
    () => selectedGroupOf(document, selectedPathIds),
    [document, selectedPathIds],
  );
  const editingGroup = useMemo(
    () => describeGroup(document, editingGroupId),
    [document, editingGroupId],
  );
  const canGroup = selectedPathIds.length >= 2;
  const canUngroup = selectionHasGroup(document, selectedPathIds);

  const sync = useDocumentSync({
    activeSlug,
    document,
    selectedPathName: selectedPath?.name,
    onServerDocument: (next) => {
      applyDocumentState(next);
      setHistory(emptySvgEditorHistory());
      selectFirstPath(next);
    },
    onLoadError: setSourceError,
  });

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const collapse = () => {
      if (query.matches) setLeftPaneCollapsed(true);
    };
    collapse();
    query.addEventListener("change", collapse);
    return () => query.removeEventListener("change", collapse);
  }, []);

  useEffect(() => {
    const reset = () => {
      if (globalThis.document.visibilityState === "hidden")
        preferInternalPasteRef.current = false;
    };
    globalThis.document.addEventListener("visibilitychange", reset);
    return () =>
      globalThis.document.removeEventListener("visibilitychange", reset);
  }, []);

  useEffect(() => {
    documentRef.current = document;
    setSelectedPathIds((current) => pruneSelection(document, current));
    setEditingGroupId((current) =>
      current && document.paths.some((path) => path.groupId === current)
        ? current
        : null,
    );
  }, [document]);

  useEffect(() => {
    if (requestedSlug && requestedSlug !== activeSlug)
      selectDocument(requestedSlug, true);
  }, [activeSlug, requestedSlug]);

  useEffect(() => {
    function handlePaste(event) {
      if (isTypingTarget(event.target)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const svg = svgFromClipboardData(clipboard);
      if (svg) {
        event.preventDefault();
        if (shouldUseInternalClipboard(svg)) pasteInternalClipboard();
        else importExternalSvg(svg);
        return;
      }
      const file = svgFileFrom(clipboard.files);
      if (file) {
        event.preventDefault();
        void file.text().then((text) => {
          if (/<svg/i.test(text)) importExternalSvg(text);
        });
        return;
      }
      if (clipboardRef.current.length > 0) {
        event.preventDefault();
        pasteInternalClipboard();
      }
    }
    function handleCopy(event) {
      if (isTypingTarget(event.target)) return;
      if (selectedPathIds.length === 0) return;
      const svg = selectionAsSvg();
      if (!svg) return;
      event.preventDefault();
      event.clipboardData?.setData("image/svg+xml", svg);
      event.clipboardData?.setData("text/plain", svg);
      rememberCopiedSvg(svg);
      clipboardRef.current = pathsWithIds(documentRef.current, selectedPathIds);
      toast.message(`${clipboardRef.current.length} object copied.`);
    }
    function handleCut(event) {
      if (isTypingTarget(event.target)) return;
      if (selectedPathIds.length === 0) return;
      handleCopy(event);
      deleteSelection();
    }
    function handleDragOver(event) {
      if (!event.dataTransfer) return;
      const hasFiles = Array.from(event.dataTransfer.items || []).some(
        (item) => item.kind === "file",
      );
      if (!hasFiles) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
    function handleDrop(event) {
      if (!event.dataTransfer) return;
      const files = Array.from(event.dataTransfer.files || []).filter(
        (file) =>
          file.type === "image/svg+xml" ||
          file.name.toLowerCase().endsWith(".svg"),
      );
      if (files.length === 0) return;
      event.preventDefault();
      Promise.all(files.map((file) => file.text())).then(
        (sources) => {
          for (const text of sources) importExternalSvg(text, "drop");
        },
        () => toast.error("Could not read dropped SVG file."),
      );
    }
    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("copy", handleCopy, true);
    window.addEventListener("cut", handleCut, true);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("copy", handleCopy, true);
      window.removeEventListener("cut", handleCut, true);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  });

  const actions = {
    undo: undoDocument,
    redo: redoDocument,
    copy: copySelection,
    cut: cutSelection,
    paste: pasteSelection,
    duplicate: duplicateSelection,
    selectAll,
    reorder: reorderSelection,
    group: groupSelection,
    ungroup: ungroupSelection,
    fit: requestFit,
    zoomIn: () => zoomBy(1.1),
    zoomOut: () => zoomBy(0.9),
    actualSize: () => setViewport((current) => ({ ...current, zoom: 1 })),
    delete: deleteSelection,
    escape: escapeOut,
    closePath: closeSelectedPath,
    toggleSnap: toggleSnapToGrid,
    tool: setTool,
    arrow: ({ delta, amount }) => {
      if (selectedPathIds.length > 0 || selectedCommandIndex !== null)
        nudgeSelection(delta, { snap: false });
      else panViewportWithKeyboard(delta, amount);
    },
  };
  useEffect(() => {
    function handleKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      const resolved = resolveEditorShortcut(event);
      if (!resolved) return;
      event.preventDefault();
      actions[resolved[0]](resolved[1]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  function handleCanvasKeyDown(event) {
    if (isTypingTarget(event.target)) return;
    const resolved = resolveCanvasShortcut(event);
    if (!resolved) return;
    event.preventDefault();
    event.stopPropagation();
    actions[resolved[0]]();
  }

  function applyDocumentState(next) {
    const nextSource = serializeSvgDocument(next);
    documentRef.current = next;
    setDocument(next);
    setSource(nextSource);
    setSourceError("");
    writeCanvasSource(activeSlug, nextSource);
  }
  function persistDocument(
    next,
    { source: editSource = "edit", trackHistory = true } = {},
  ) {
    const previous = documentRef.current;
    if (trackHistory && !continuousSnapshotRef.current) {
      setHistory((current) => commitSvgEditorHistory(current, previous, next));
    }
    sync.setEditSource(editSource);
    applyDocumentState(next);
  }
  function beginContinuousEdit() {
    continuousSnapshotRef.current ||= documentRef.current;
  }
  function commitContinuousEdit(editSource = "edit") {
    setSnapGuides([]);
    const snapshot = continuousSnapshotRef.current;
    continuousSnapshotRef.current = null;
    if (!snapshot) return;
    const current = documentRef.current;
    setHistory((history) => commitSvgEditorHistory(history, snapshot, current));
    sync.setEditSource(editSource);
  }
  function selectFirstPath(next) {
    setSelectedPathIds(firstPathIds(next));
    setSelectedCommandIndex(null);
  }
  function restoreHistoryDocument(next, editSource) {
    applyDocumentState(next);
    selectFirstPath(next);
    sync.setEditSource(editSource);
  }
  function undoDocument() {
    const result = undoSvgEditorHistory(history, documentRef.current);
    if (!result) return;
    setHistory(result.history);
    restoreHistoryDocument(result.document, "undo");
  }
  function redoDocument() {
    const result = redoSvgEditorHistory(history, documentRef.current);
    if (!result) return;
    setHistory(result.history);
    restoreHistoryDocument(result.document, "redo");
  }
  async function restoreRevision(revision) {
    const previous = documentRef.current;
    const next = await sync.restoreRevision(revision);
    if (!next) return;
    setHistory((current) => commitSvgEditorHistory(current, previous, next));
    applyDocumentState(next);
    selectFirstPath(next);
  }

  function selectPath(pathId, extend = false, scope = "auto") {
    if (!pathId) {
      setSelectedPathIds([]);
      setSelectedCommandIndex(null);
      setEditingGroupId(null);
      return;
    }
    const current = documentRef.current;
    if (scope === "path")
      setEditingGroupId(findPath(current, pathId)?.groupId || null);
    else if (scope === "group") setEditingGroupId(null);
    setSelectedPathIds((ids) =>
      nextSelectionForClick(current, ids, pathId, {
        extend,
        scope,
        editingGroupId,
      }),
    );
    setSelectedCommandIndex(null);
  }
  function selectGroup(groupId, extend = false) {
    if (!groupId) return;
    const current = documentRef.current;
    const ids = groupPathIds(current, groupId);
    if (ids.length === 0) return;
    setEditingGroupId(null);
    setSelectedPathIds((selected) =>
      extend ? toggleGroupInSelection(current, selected, groupId) : ids,
    );
    setSelectedCommandIndex(null);
  }
  function selectPaths(pathIds) {
    const current = documentRef.current;
    setSelectedPathIds(
      editingGroupId
        ? uniquePathIds(pathIds).filter(
            (id) => findPath(current, id)?.groupId === editingGroupId,
          )
        : expandSelectionToGroups(current, pathIds),
    );
    setSelectedCommandIndex(null);
  }
  function selectPathRange(pathIds) {
    setSelectedPathIds(uniquePathIds(pathIds));
    setEditingGroupId(sharedGroupId(documentRef.current, pathIds));
    setSelectedCommandIndex(null);
  }
  function selectAll() {
    selectPaths(documentRef.current.paths.map((path) => path.id));
  }
  function escapeOut() {
    if (selectedCommandIndex !== null) setSelectedCommandIndex(null);
    else if (editingGroupId) {
      const groupId = editingGroupId;
      setEditingGroupId(null);
      selectGroup(groupId);
    } else if (tool !== "select") setTool("select");
    else setSelectedPathIds([]);
  }

  function selectDocument(slug, force = false) {
    if (slug === activeSlug && !force) return;
    setActiveSlug(slug);
    setHistory(emptySvgEditorHistory());
    setSelectedCommandIndex(null);
    setSelectedPathIds([]);
    setEditingGroupId(null);
    sync.beginSwitch(slug);
    updateQuery({ file: slug, doc: null }, { mode: "replace" });
    const stored = readStoredCanvas(slug);
    if (stored) {
      applyDocumentState(stored);
      selectFirstPath(stored);
    }
  }
  function createDocument() {
    selectDocument(`canvas-${Date.now().toString(36)}`);
  }
  async function deleteDocument() {
    const ok = await dialog.confirm({
      title: "Delete this design file?",
      description: "This removes the file and its revision history.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    const nextSlug = await sync.deleteDocument();
    if (nextSlug) selectDocument(nextSlug, true);
  }
  function importSource() {
    try {
      const next = parseSvgDocument(source);
      persistDocument(next, { source: "import" });
      selectFirstPath(next);
      requestFit();
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Invalid SVG.");
    }
  }
  function exportSource() {
    const nextSource = serializeSvgDocument(document);
    setSource(nextSource);
    void navigator.clipboard?.writeText(nextSource).then(
      () => toast.success("SVG copied."),
      () => toast.message("SVG source refreshed."),
    );
  }
  function resetDocument() {
    const next = parseSvgDocument(defaultDocumentForSlug(activeSlug).svg);
    persistDocument(next, { source: "reset" });
    selectFirstPath(next);
    setViewport(HOME_VIEWPORT);
    requestFit();
  }
  function updateDocumentFontFamily(fontFamily) {
    const next = normalizeDesignFontFamily(fontFamily);
    if (documentRef.current.fontFamily === next) return;
    persistDocument({ ...documentRef.current, fontFamily: next });
  }

  function requestFit() {
    setFitRequest((current) => current + 1);
  }
  function zoomBy(factor) {
    setViewport((current) => ({
      ...current,
      zoom: clampZoom(current.zoom * factor),
    }));
  }
  function panViewportWithKeyboard(delta, amount) {
    const step = amount >= 10 ? 160 : 32;
    setViewport((current) => ({
      ...current,
      pan: {
        x: current.pan.x - delta.x * step,
        y: current.pan.y - delta.y * step,
      },
    }));
  }
  function toggleSnapToGrid() {
    setSnapToGrid((current) => {
      writeSnapToGrid(!current);
      return !current;
    });
  }
  function maybeSnapPoint(point) {
    return snapToGrid ? snapPointToGrid(point) : point;
  }
  function maybeSnapBounds(bounds) {
    return snapToGrid ? snapBoundsToGrid(bounds) : bounds;
  }
  function snapPathDeltaToGrid(pathIds, delta) {
    const bounds = getSelectedPathBounds(documentRef.current, pathIds);
    if (!bounds) return snapPointToGrid(delta);
    const origin = snapPointToGrid({
      x: bounds.x + delta.x,
      y: bounds.y + delta.y,
    });
    return { x: origin.x - bounds.x, y: origin.y - bounds.y };
  }

  function updateSelectedPath(updates) {
    if (!selectedPath) return;
    if (selectedPathIds.length > 1 && !Object.hasOwn(updates, "name")) {
      const selected = new Set(selectedPathIds);
      persistDocument({
        ...documentRef.current,
        paths: documentRef.current.paths.map((path) =>
          selected.has(path.id) ? { ...path, ...updates } : path,
        ),
      });
      return;
    }
    persistDocument(
      updateDocumentPath(document, selectedPath.id, (path) => ({
        ...path,
        ...updates,
      })),
    );
  }
  function renamePath(pathId, name) {
    persistDocument(
      updateDocumentPath(documentRef.current, pathId, (path) => ({
        ...path,
        name,
      })),
    );
  }
  function renameGroup(groupId, name) {
    persistDocument(renameGroupIn(documentRef.current, groupId, name));
  }
  function updateSelectedPathBounds(bounds) {
    if (!selectedPath || selectedPathIds.length === 0) return;
    const nextBounds = maybeSnapBounds(bounds);
    if (selectedPathIds.length > 1) {
      const initial = getSelectedPathBounds(
        documentRef.current,
        selectedPathIds,
      );
      if (!initial) return;
      persistDocument(
        resizeDocumentPathsToBounds(
          documentRef.current,
          selectedPathIds,
          initial,
          nextBounds,
        ),
      );
      return;
    }
    persistDocument(
      updateDocumentPath(document, selectedPath.id, (path) =>
        resizePathToBounds(path, nextBounds),
      ),
    );
  }
  function nudgeSelection(delta, options = {}) {
    const shouldSnap = options.snap ?? snapToGrid;
    if (selectedPath && selectedCommandIndex !== null) {
      const command = selectedPath.commands[selectedCommandIndex];
      if (!command || command.type === "Z") return;
      const raw = { x: command.x + delta.x, y: command.y + delta.y };
      const point = shouldSnap ? snapPointToGrid(raw) : raw;
      persistDocument(
        updatePathCommands(
          document,
          selectedPath.id,
          updatePathAnchor(selectedPath.commands, selectedCommandIndex, point),
        ),
      );
      return;
    }
    if (selectedPathIds.length === 0) return;
    const nextDelta = shouldSnap
      ? snapPathDeltaToGrid(selectedPathIds, delta)
      : delta;
    persistDocument(
      translateDocumentPathsBy(document, selectedPathIds, nextDelta),
    );
  }
  function movePaths(pathIds, delta) {
    if (pathIds.length === 0) return;
    const current = documentRef.current;
    const adjustment = snapToGrid
      ? { delta: snapPathDeltaToGrid(pathIds, delta), guides: [] }
      : computeSnapAdjustment(current, pathIds, delta, viewport.zoom);
    setSnapGuides(adjustment.guides);
    persistDocument(
      translateDocumentPathsBy(current, pathIds, adjustment.delta),
      {
        trackHistory: false,
      },
    );
  }
  function resizePaths(pathIds, initialBounds, nextBounds, initialDocument) {
    if (pathIds.length === 0) return;
    persistDocument(
      resizeDocumentPathsToBounds(
        initialDocument,
        pathIds,
        initialBounds,
        maybeSnapBounds(nextBounds),
      ),
      { trackHistory: false },
    );
  }
  function reorderSelection(direction) {
    if (selectedPathIds.length === 0) return;
    persistDocument(
      reorderPaths(documentRef.current, selectedPathIds, direction),
    );
  }
  function toggleSelectionHidden(pathId) {
    const ids = pathId ? [pathId] : selectedPathIds;
    if (ids.length === 0) return;
    const allHidden = pathsWithIds(document, ids).every((path) => path.hidden);
    persistDocument(
      { ...document, paths: setPathsHidden(document.paths, ids, !allHidden) },
      { source: "visibility" },
    );
  }
  function deleteSelection() {
    if (selectedPath && selectedCommandIndex !== null) {
      persistDocument(
        updatePathCommands(
          document,
          selectedPath.id,
          deletePathCommand(selectedPath.commands, selectedCommandIndex),
        ),
        { source: "delete" },
      );
      setSelectedCommandIndex(null);
      return;
    }
    if (selectedPathIds.length === 0) return;
    const selected = new Set(selectedPathIds);
    let paths = document.paths.filter((path) => !selected.has(path.id));
    if (paths.length === 0) paths = [createEmptyPath("Path 1")];
    persistDocument({ ...document, paths }, { source: "delete" });
    setSelectedPathIds(paths[0]?.id ? [paths[0].id] : []);
    setSelectedCommandIndex(null);
  }
  function alignSelection(mode) {
    if (selectedPathIds.length < 2) return;
    persistDocument(alignDocumentPaths(document, selectedPathIds, mode), {
      source: "align",
    });
  }
  function distributeSelection(axis) {
    if (selectedPathIds.length < 3) return;
    persistDocument(distributeDocumentPaths(document, selectedPathIds, axis), {
      source: "distribute",
    });
  }
  function rotateSelection(degrees) {
    if (selectedPathIds.length === 0 || degrees === 0) return;
    persistDocument(rotateDocumentPaths(document, selectedPathIds, degrees), {
      source: "rotate",
    });
  }
  function groupSelection() {
    if (selectedPathIds.length < 2) return;
    persistDocument(groupPaths(document, selectedPathIds), { source: "group" });
    toast.message(`Grouped ${selectedPathIds.length} objects.`);
    setEditingGroupId(null);
  }
  function ungroupSelection() {
    const result = ungroupPaths(document, selectedPathIds);
    if (result.count === 0) return;
    persistDocument(result.document, { source: "ungroup" });
    toast.message(
      result.count === 1
        ? "Ungrouped 1 group."
        : `Ungrouped ${result.count} groups.`,
    );
    setEditingGroupId(null);
  }
  function applyBooleanOperation(operation) {
    const selected = pathsWithIds(document, selectedPathIds);
    if (selected.length < 2) return;
    try {
      const results = applySvgBooleanOperation(selected, operation);
      persistDocument(
        replacePaths(
          document,
          selected.map((path) => path.id),
          results,
        ),
        { source: "boolean" },
      );
      setSelectedPathIds(results.map((path) => path.id));
      setSelectedCommandIndex(null);
      toast.success("Boolean operation applied.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Boolean operation failed.",
      );
    }
  }

  function selectionAsSvg() {
    return serializePaths(
      documentRef.current,
      pathsWithIds(documentRef.current, selectedPathIds),
    );
  }
  function rememberCopiedSvg(svg) {
    copiedSvgRef.current = svg;
    preferInternalPasteRef.current = true;
  }
  function shouldUseInternalClipboard(svg) {
    if (clipboardRef.current.length === 0) return false;
    if (preferInternalPasteRef.current) return true;
    return Boolean(svg && copiedSvgRef.current.trim() === svg.trim());
  }
  function copySelection() {
    const svg = selectionAsSvg();
    clipboardRef.current = pathsWithIds(documentRef.current, selectedPathIds);
    if (!svg) return;
    rememberCopiedSvg(svg);
    void navigator.clipboard?.writeText(svg).catch(() => {});
    toast.message(`${clipboardRef.current.length} object copied.`);
  }
  function cutSelection() {
    if (selectedPathIds.length === 0) return;
    copySelection();
    deleteSelection();
  }
  function addPaths(paths, editSource) {
    persistDocument(
      {
        ...documentRef.current,
        paths: [...documentRef.current.paths, ...paths],
      },
      { source: editSource },
    );
    setSelectedPathIds(paths.map((path) => path.id));
    setSelectedCommandIndex(null);
  }
  function importExternalSvg(text, editSource = "paste") {
    let imported;
    try {
      imported = pathsFromPastedSvg(documentRef.current, text);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import SVG.",
      );
      return false;
    }
    if (imported.length === 0) {
      toast.message("Clipboard had no <path> elements to import.");
      return false;
    }
    addPaths(imported, editSource);
    requestFit();
    toast.success(
      imported.length === 1
        ? "Pasted 1 path from SVG."
        : `Pasted ${imported.length} paths from SVG as a group.`,
    );
    return true;
  }
  function pasteInternalClipboard() {
    if (clipboardRef.current.length === 0) return false;
    addPaths(
      copyPaths(clipboardRef.current, {
        offsetCommand: (command) => translateCommandBy(command, PASTE_OFFSET),
        idSuffix: "paste",
      }),
      "duplicate",
    );
    return true;
  }
  function pasteSelection() {
    if (!navigator.clipboard?.readText) {
      pasteInternalClipboard();
      return;
    }
    void navigator.clipboard.readText().then(
      (text) => {
        if (looksLikeSvg(text)) {
          if (shouldUseInternalClipboard(text)) {
            pasteInternalClipboard();
            return;
          }
          if (importExternalSvg(text)) return;
        }
        pasteInternalClipboard();
      },
      () => pasteInternalClipboard(),
    );
  }
  async function pasteFromSystemClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (
            type !== "image/svg+xml" &&
            type !== "text/html" &&
            type !== "text/plain"
          )
            continue;
          const svg = svgFromClipboardText(
            type,
            await (await item.getType(type)).text(),
          );
          if (svg) {
            importExternalSvg(svg);
            return;
          }
        }
      }
      if (pasteInternalClipboard()) return;
      toast.message("Nothing on the clipboard this can read.");
    } catch {
      toast.error(
        "The browser would not hand over the clipboard. Press ⌘V instead.",
      );
    }
  }
  function duplicateSelection() {
    const duplicates = copyPaths(pathsWithIds(document, selectedPathIds), {
      offsetCommand: duplicateCommandOffset,
      idSuffix: "copy",
    });
    if (duplicates.length === 0) return;
    addPaths(duplicates, "duplicate");
  }

  function createPath() {
    const path = createEmptyPath(`Path ${document.paths.length + 1}`);
    addPaths([path], "create");
    setTool("pen");
  }
  function createShape(kind, bounds) {
    const current = documentRef.current;
    const resolved = maybeSnapBounds(bounds);
    const name = `${kind[0].toUpperCase()}${kind.slice(1)} ${current.paths.length + 1}`;
    const path =
      kind === "rectangle"
        ? createRectanglePath({
            name,
            x: resolved.x,
            y: resolved.y,
            width: Math.max(1, resolved.width),
            height: Math.max(1, resolved.height),
          })
        : kind === "ellipse"
          ? createEllipsePath({
              name,
              x: resolved.x,
              y: resolved.y,
              width: Math.max(1, resolved.width),
              height: Math.max(1, resolved.height),
            })
          : createLinePath({
              name,
              x: resolved.x,
              y: resolved.y,
              width: resolved.width,
              height: resolved.height,
            });
    addPaths([path], "create");
    setTool("select");
  }
  function closeSelectedPath() {
    if (!selectedPath || selectedPath.commands.length < 3) return;
    persistDocument(
      updatePathCommands(
        document,
        selectedPath.id,
        closePathCommands(selectedPath.commands),
      ),
    );
  }
  function reshapeSelectedPoint(reshape) {
    if (!selectedPath || selectedCommandIndex === null) return;
    persistDocument(
      updatePathCommands(
        document,
        selectedPath.id,
        reshape(selectedPath.commands, selectedCommandIndex),
      ),
    );
  }
  function moveAnchor(pathId, commandIndex, point) {
    const current = documentRef.current;
    const path = findPath(current, pathId);
    if (!path) return;
    persistDocument(
      updatePathCommands(
        current,
        pathId,
        updatePathAnchor(path.commands, commandIndex, maybeSnapPoint(point)),
      ),
      { trackHistory: false },
    );
  }
  function moveHandle(pathId, commandIndex, handle, point) {
    const current = documentRef.current;
    const path = findPath(current, pathId);
    if (!path) return;
    persistDocument(
      updatePathCommands(
        current,
        pathId,
        updatePathHandle(
          path.commands,
          commandIndex,
          handle,
          maybeSnapPoint(point),
        ),
      ),
      { trackHistory: false },
    );
  }
  function appendPoint(pathId, point) {
    const current = documentRef.current;
    const nextPoint = maybeSnapPoint(point);
    const path = findPath(current, pathId);
    if (!path || isClosedPath(path.commands)) {
      const commands = [{ type: "M", ...nextPoint }];
      const created = {
        ...createEmptyPath(`Path ${current.paths.length + 1}`),
        commands,
        d: serializePathData(commands),
      };
      persistDocument(
        { ...current, paths: [...current.paths, created] },
        { source: "create", trackHistory: false },
      );
      setSelectedPathIds([created.id]);
      setSelectedCommandIndex(0);
      return {
        pathId: created.id,
        commandIndex: 0,
        previousPoint: null,
        anchorPoint: nextPoint,
      };
    }
    const commands =
      path.commands.length === 0
        ? [{ type: "M", ...nextPoint }]
        : [...path.commands, { type: "L", ...nextPoint }];
    const commandIndex = commands.length - 1;
    persistDocument(updatePathCommands(current, pathId, commands), {
      trackHistory: false,
    });
    setSelectedPathIds([pathId]);
    setSelectedCommandIndex(commandIndex);
    return {
      pathId,
      commandIndex,
      previousPoint: findLastCommandPoint(path.commands),
      anchorPoint: nextPoint,
    };
  }
  function shapePenPoint(pathId, commandIndex, anchorPoint, handlePoint) {
    const current = documentRef.current;
    const path = findPath(current, pathId);
    if (!path) return;
    persistDocument(
      updatePathCommands(
        current,
        pathId,
        shapePenSegment(
          path.commands,
          commandIndex,
          maybeSnapPoint(anchorPoint),
          maybeSnapPoint(handlePoint),
        ),
      ),
      { trackHistory: false },
    );
    setSelectedPathIds([pathId]);
    setSelectedCommandIndex(commandIndex);
  }

  const paneWidth = leftPaneCollapsed ? "2rem" : "22rem";
  return (
    <AppLayout showHeader={false}>
      <FileMenu
        activeSlug={activeSlug}
        onNewCanvas={createDocument}
        onPasteSvg={() => void pasteFromSystemClipboard()}
      />
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <ScrollArea
          className="min-h-0 flex-1 bg-background"
          viewportClassName="h-full"
          containScroll
        >
          <div
            className="grid h-full min-h-0"
            style={{
              gridTemplateColumns: `${paneWidth} minmax(0, 1fr)`,
              minWidth: `calc(${paneWidth} + 34rem)`,
            }}
          >
            {leftPaneCollapsed ? (
              <PaneCollapsedRail
                side="left"
                label="Studio"
                icon={IconFolder}
                onExpand={() => setLeftPaneCollapsed(false)}
              />
            ) : (
              <PaneIdleFade>
                <div className="grid h-full min-h-0 w-full rows-2 rule-r bg-sidebar">
                  <LayersPanel
                    document={document}
                    designDocuments={sync.designDocuments}
                    activeSlug={activeSlug}
                    selectedPathIds={selectedPathIds}
                    editingGroupId={editingGroupId}
                    canGroup={canGroup}
                    canUngroup={canUngroup}
                    onSelectDocument={selectDocument}
                    onCreateDocument={createDocument}
                    onRenameDocument={sync.renameDocument}
                    onDeleteDocument={deleteDocument}
                    onSelectPath={selectPath}
                    onSelectPaths={selectPathRange}
                    onSelectGroup={selectGroup}
                    onRenamePath={renamePath}
                    onRenameGroup={renameGroup}
                    onCreatePath={createPath}
                    onReorderSelection={reorderSelection}
                    onToggleHidden={toggleSelectionHidden}
                    onDuplicateSelection={duplicateSelection}
                    onDeleteSelection={deleteSelection}
                    onGroupSelection={groupSelection}
                    onUngroupSelection={ungroupSelection}
                    onCollapse={() => setLeftPaneCollapsed(true)}
                    embedded
                  />
                  <PropertiesPanel
                    document={document}
                    activeDocument={sync.activeDocument}
                    selectedPath={selectedPath}
                    selectedGroup={selectedGroup}
                    selectedBounds={selectedBounds}
                    selectedPathCount={selectedPathIds.length}
                    source={source}
                    error={sourceError}
                    onSourceChange={setSource}
                    onImportSource={importSource}
                    onExportSource={exportSource}
                    onResetDocument={resetDocument}
                    onRenameDocument={sync.renameDocument}
                    onRenameGroup={renameGroup}
                    onDeleteDocument={deleteDocument}
                    onUpdateDocumentFontFamily={updateDocumentFontFamily}
                    onUpdatePath={updateSelectedPath}
                    onUpdatePathBounds={updateSelectedPathBounds}
                    onRotateSelection={rotateSelection}
                    revisions={sync.revisions}
                    isLoadingRevisions={sync.isLoadingRevisions}
                    onRestoreRevision={restoreRevision}
                    embedded
                  />
                </div>
              </PaneIdleFade>
            )}
            <section className="flex min-w-0 flex-col">
              <EditorToolbar
                tool={tool}
                zoom={viewport.zoom}
                selectedPathCount={selectedPathIds.length}
                hasSelectedPoint={selectedCommandIndex !== null}
                hasSelectedPath={Boolean(selectedPath)}
                saveStatus={sync.saveStatus}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                snapToGrid={snapToGrid}
                onToolChange={setTool}
                onUndo={undoDocument}
                onRedo={redoDocument}
                onDuplicateSelection={duplicateSelection}
                onCopySelection={copySelection}
                onPasteSelection={pasteSelection}
                onSelectAll={selectAll}
                onReorderSelection={reorderSelection}
                onAlignSelection={alignSelection}
                onDistributeSelection={distributeSelection}
                onGroupSelection={groupSelection}
                onUngroupSelection={ungroupSelection}
                canGroup={canGroup}
                canUngroup={canUngroup}
                onToggleSnapToGrid={toggleSnapToGrid}
                onBooleanOperation={applyBooleanOperation}
                onCornerPoint={() => reshapeSelectedPoint(cornerAnchor)}
                onSmoothPoint={() => reshapeSelectedPoint(smoothAnchor)}
                onClosePath={closeSelectedPath}
                onDeleteSelection={deleteSelection}
                onFitCanvas={requestFit}
                onActualSize={actions.actualSize}
                onZoomIn={actions.zoomIn}
                onZoomOut={actions.zoomOut}
              />
              <DesignCanvas
                document={document}
                selectedPathIds={selectedPathIds}
                primarySelectedPathId={primarySelectedPathId}
                selectedCommandIndex={selectedCommandIndex}
                tool={tool}
                viewport={viewport}
                fitRequest={fitRequest}
                snapGuides={snapGuides}
                onViewportChange={setViewport}
                onSelectPath={selectPath}
                onSelectPaths={selectPaths}
                onSelectCommand={setSelectedCommandIndex}
                onMoveAnchor={moveAnchor}
                onMoveHandle={moveHandle}
                onMovePaths={movePaths}
                onCreateShape={createShape}
                onResizePaths={resizePaths}
                onAppendPoint={appendPoint}
                onShapePenPoint={shapePenPoint}
                onClosePath={closeSelectedPath}
                onEditorKeyDown={handleCanvasKeyDown}
                onBeginEdit={beginContinuousEdit}
                onCommitEdit={commitContinuousEdit}
                onCopySelection={copySelection}
                onPasteSelection={pasteSelection}
                onDuplicateSelection={duplicateSelection}
                onDeleteSelection={deleteSelection}
                onSelectAll={selectAll}
                onGroupSelection={groupSelection}
                onUngroupSelection={ungroupSelection}
                canGroup={canGroup}
                canUngroup={canUngroup}
                editingGroupName={editingGroup?.name || ""}
                snapToGrid={snapToGrid}
              />
            </section>
          </div>
        </ScrollArea>
      </div>
    </AppLayout>
  );
}
