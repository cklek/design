import {
  IconCopy,
  IconDotsVertical,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconLayersLinked,
  IconLayersOff,
  IconPlus,
  IconSearch,
  IconTrash,
  IconEye,
  IconVectorBezier,
} from "@/ui/icons";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Input } from "@/ui/input";
import { ScrollArea } from "@/ui/scroll-area";
import { TreeView } from "@/ui/tree-view";
import { cn } from "@/lib/utils";
import { PaneCollapseButton } from "./panel-shell";

function formatUpdatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unsaved";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function stopRowEvent(event) {
  event.stopPropagation();
}

function matchesObjectFilter(path, filter) {
  if (!filter) return true;
  const haystack =
    `${path.name} ${path.id} ${path.groupId || ""} ${path.groupName || ""}`.toLowerCase();
  return haystack.includes(filter);
}

function groupDisplayName(paths, fallback) {
  return paths.find((path) => path.groupName)?.groupName || fallback;
}

function buildDocumentTree(documents) {
  return documents.map((item) => ({
    id: item.slug,
    name: item.name,
    source: item.slug,
    slug: item.slug,
    kind: "document",
    type: "file",
    icon: IconFileText,
  }));
}

function buildObjectTree(paths, filterValue) {
  const filter = filterValue.trim().toLowerCase();
  const topFirstPaths = [...paths].reverse();
  const groupedPaths = new Map();
  for (const path of topFirstPaths) {
    if (!path.groupId) continue;
    groupedPaths.set(path.groupId, [
      ...(groupedPaths.get(path.groupId) || []),
      path,
    ]);
  }
  const entries = [];
  const seenGroups = new Set();
  let groupIndex = 0;
  for (const path of topFirstPaths) {
    if (path.groupId) {
      if (seenGroups.has(path.groupId)) continue;
      seenGroups.add(path.groupId);
      groupIndex += 1;
      const groupPaths = groupedPaths.get(path.groupId) || [path];
      const label = groupDisplayName(groupPaths, `Group ${groupIndex}`);
      const groupMatches = label.toLowerCase().includes(filter);
      const matchingPaths = groupMatches
        ? groupPaths
        : groupPaths.filter((item) => matchesObjectFilter(item, filter));
      if (matchingPaths.length === 0) {
        continue;
      }
      entries.push({
        id: `group:${path.groupId}`,
        name: label,
        kind: "group",
        type: "folder",
        icon: IconLayersLinked,
        selectedIcon: IconLayersLinked,
        openIcon: IconFolderOpen,
        groupId: path.groupId,
        source: path.groupId,
        paths: groupPaths,
        children: matchingPaths.map((item) => ({
          id: `path:${item.id}`,
          name: item.name,
          source: item.id,
          kind: "path",
          type: "file",
          icon: IconVectorBezier,
          path: item,
        })),
      });
      continue;
    }
    if (matchesObjectFilter(path, filter)) {
      entries.push({
        id: `path:${path.id}`,
        name: path.name,
        source: path.id,
        kind: "path",
        type: "file",
        icon: IconVectorBezier,
        path,
      });
    }
  }
  return entries;
}

function visiblePathIds(entries) {
  const ids = [];
  for (const entry of entries) {
    if (entry.kind === "group") {
      for (const path of entry.paths || []) ids.push(path.id);
      continue;
    }
    if (entry.path) ids.push(entry.path.id);
  }
  return ids;
}

export function LayersPanel({
  document,
  designDocuments,
  activeSlug,
  selectedPathIds,
  editingGroupId,
  canGroup,
  canUngroup,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onDeleteDocument,
  onSelectPath,
  onSelectPaths,
  onSelectGroup,
  onRenamePath,
  onRenameGroup,
  onCreatePath,
  onReorderSelection,
  onToggleHidden,
  onDuplicateSelection,
  onDeleteSelection,
  onGroupSelection,
  onUngroupSelection,
  onCollapse,
  embedded = false,
}) {
  const [objectFilter, setObjectFilter] = useState("");
  const selectionAnchorRef = useRef(null);
  const selectedSet = new Set(selectedPathIds);
  const sortedDocuments = [...designDocuments].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const activeDocument =
    designDocuments.find((item) => item.slug === activeSlug) || null;
  const objectEntries = useMemo(
    () => buildObjectTree(document.paths, objectFilter),
    [document.paths, objectFilter],
  );
  const documentTree = useMemo(
    () => buildDocumentTree(sortedDocuments),
    [sortedDocuments],
  );
  const selectedTreeItemId = useMemo(() => {
    if (selectedPathIds.length === 0) return undefined;
    const selectedPaths = selectedPathIds
      .map((id) => document.paths.find((path) => path.id === id))
      .filter((path) => Boolean(path));
    const groupId = selectedPaths[0]?.groupId;
    if (
      groupId &&
      selectedPaths.every((path) => path.groupId === groupId) &&
      selectedPaths.length ===
        document.paths.filter((path) => path.groupId === groupId).length
    ) {
      return `group:${groupId}`;
    }
    return `path:${selectedPathIds.at(-1)}`;
  }, [document.paths, selectedPathIds]);
  const visibleIds = useMemo(
    () => visiblePathIds(objectEntries),
    [objectEntries],
  );
  function eventExtendsSelection(event) {
    return Boolean(event?.shiftKey || event?.metaKey || event?.ctrlKey);
  }
  function rangeSelectTo(pathIds) {
    const targetId = pathIds.at(-1);
    const anchorId = selectionAnchorRef.current || selectedPathIds.at(-1);
    if (!targetId || !anchorId) {
      onSelectPaths(pathIds);
      return;
    }
    const start = visibleIds.indexOf(anchorId);
    const end = visibleIds.indexOf(targetId);
    if (start === -1 || end === -1) {
      onSelectPaths(pathIds);
      return;
    }
    const [from, to] = start < end ? [start, end] : [end, start];
    onSelectPaths(visibleIds.slice(from, to + 1));
  }
  function selectEntryForContext(entry) {
    if (entry.kind === "group" && entry.groupId) {
      onSelectGroup(entry.groupId);
      selectionAnchorRef.current = entry.paths?.at(-1)?.id || null;
      return;
    }
    if (entry.kind === "path" && entry.path) {
      onSelectPath(entry.path.id, false, "path");
      selectionAnchorRef.current = entry.path.id;
    }
  }
  function renderObjectContextMenu(entry, children) {
    const paths = entry.kind === "group" ? entry.paths || [] : [];
    const firstPath = entry.path || paths[0];
    const hasSelectedObjects = selectedPathIds.length > 0;
    const canUngroupEntry =
      entry.kind === "group" || Boolean(entry.path?.groupId) || canUngroup;
    return (
      <ContextMenu>
        <ContextMenuTrigger
          className="flex min-w-0 flex-1 items-center"
          onContextMenu={() => selectEntryForContext(entry)}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent side="right" align="start" className="min-w-44">
          <ContextMenuItem onClick={() => selectEntryForContext(entry)}>
            {entry.kind === "group" ? (
              <IconLayersLinked />
            ) : (
              <IconVectorBezier />
            )}
            {entry.kind === "group" ? "Select group" : "Select object"}
          </ContextMenuItem>
          {firstPath?.groupId ? (
            <ContextMenuItem
              onClick={() => onSelectPath(firstPath.id, false, "path")}
            >
              <IconVectorBezier />
              Edit group contents
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          {/* THE STACK, where a layer list is expected to have it. The
           * shortcuts are the ones already bound in index.jsx, shown here so
           * the panel teaches them rather than hiding them. */}
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={() => onReorderSelection?.("forward")}
          >
            Raise
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={() => onReorderSelection?.("backward")}
          >
            Lower
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={() => onReorderSelection?.("front")}
          >
            Bring to front
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={() => onReorderSelection?.("back")}
          >
            Send to back
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={() => onToggleHidden?.()}
          >
            <IconEye />
            Show / hide
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!hasSelectedObjects}
            onClick={onDuplicateSelection}
          >
            <IconCopy />
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem disabled={!canGroup} onClick={onGroupSelection}>
            <IconLayersLinked />
            Group
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canUngroupEntry}
            onClick={onUngroupSelection}
          >
            <IconLayersOff />
            Ungroup
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!hasSelectedObjects}
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
  function renderDocumentItem({ item, isSelected }) {
    const entry = item;
    const doc = sortedDocuments.find(
      (document) => document.slug === entry.slug,
    );
    const active = entry.slug === activeSlug;
    const label = (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <IconFileText
          className={cn(
            "size-4 shrink-0",
            isSelected ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1">
          {active ? (
            <Input
              aria-label="Rename active design file"
              value={activeDocument?.name || item.name}
              onChange={(event) => onRenameDocument(event.currentTarget.value)}
              onClick={stopRowEvent}
              onKeyDown={stopRowEvent}
              className="h-6 px-2"
            />
          ) : (
            <span className="block truncate">{item.name}</span>
          )}
          <span className="block truncate opacity-70">
            {doc ? formatUpdatedAt(doc.updatedAt) : "unsaved"}
          </span>
        </span>
      </div>
    );
    return (
      <ContextMenu>
        <ContextMenuTrigger
          className="flex min-w-0 flex-1 items-center"
          onContextMenu={() => {
            if (entry.slug) onSelectDocument(entry.slug);
          }}
        >
          {label}
        </ContextMenuTrigger>
        <ContextMenuContent side="right" align="start" className="min-w-40">
          <ContextMenuItem
            onClick={() => entry.slug && onSelectDocument(entry.slug)}
          >
            <IconFileText />
            Open file
          </ContextMenuItem>
          <ContextMenuItem onClick={onCreateDocument}>
            <IconPlus />
            New design file
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => entry.slug && onSelectDocument(entry.slug)}
          >
            <IconVectorBezier />
            Rename
          </ContextMenuItem>
          {active ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={onDeleteDocument}>
                <IconTrash />
                Delete file
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    );
  }
  function renderPathItem(path) {
    const selected = selectedSet.has(path.id);
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          aria-label={path.hidden ? `Show ${path.name}` : `Hide ${path.name}`}
          aria-pressed={Boolean(path.hidden)}
          title={path.hidden ? "Show layer" : "Hide layer"}
          onClick={(event) => {
            stopRowEvent(event);
            onToggleHidden?.(path.id);
          }}
          onKeyDown={stopRowEvent}
          className={cn(
            "grid size-5 shrink-0 place-items-center border border-transparent hover:border-border",
            path.hidden ? "text-muted-foreground/60" : "text-foreground",
          )}
        >
          <IconEye className={cn("size-4", path.hidden && "opacity-40")} />
        </button>
        <IconVectorBezier
          className={cn(
            "size-4 shrink-0",
            path.hidden && "opacity-40",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1">
          {selected && selectedPathIds.length === 1 ? (
            <Input
              aria-label={`Rename ${path.name}`}
              value={path.name}
              onChange={(event) =>
                onRenamePath(path.id, event.currentTarget.value)
              }
              onClick={stopRowEvent}
              onKeyDown={stopRowEvent}
              className="h-6 px-2"
            />
          ) : (
            <span
              className={cn(
                "block truncate",
                path.hidden && "text-muted-foreground line-through",
              )}
            >
              {path.name}
            </span>
          )}
          <span className="block truncate opacity-70">
            {path.commands.length} pts
          </span>
        </span>
      </div>
    );
  }
  function renderObjectItem({ item, isOpen }) {
    const entry = item;
    if (entry.kind === "group") {
      const paths = entry.paths || [];
      const selectedCount = paths.filter((path) =>
        selectedSet.has(path.id),
      ).length;
      const groupSelected = selectedCount === paths.length && paths.length > 0;
      const isEditing = Boolean(
        entry.groupId && entry.groupId === editingGroupId,
      );
      return renderObjectContextMenu(
        entry,
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isOpen ? (
            <IconFolderOpen
              className={cn(
                "size-4 shrink-0",
                isEditing ? "text-primary" : "text-muted-foreground",
              )}
            />
          ) : (
            <IconLayersLinked
              className={cn(
                "size-4 shrink-0",
                isEditing ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
          <span className="min-w-0 flex-1">
            {groupSelected ? (
              <Input
                aria-label={`Rename ${entry.name}`}
                value={entry.name}
                onChange={(event) =>
                  entry.groupId &&
                  onRenameGroup(entry.groupId, event.currentTarget.value)
                }
                onClick={stopRowEvent}
                onKeyDown={stopRowEvent}
                className="h-6 px-2"
              />
            ) : (
              <span className="block truncate">{entry.name}</span>
            )}
            <span className="block truncate opacity-70">
              {isEditing ? "editing / " : ""}
              {selectedCount > 0 ? `${selectedCount}/` : ""}
              {paths.length} objects
            </span>
          </span>
        </div>,
      );
    }
    if (entry.path)
      return renderObjectContextMenu(entry, renderPathItem(entry.path));
    return <span className="truncate">{item.name}</span>;
  }
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar",
        embedded ? "rule-b" : "rule-r",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 rule-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconFolder className="size-4 shrink-0 text-muted-foreground" />
          Files
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            title="New design file"
            aria-label="New design file"
            onClick={onCreateDocument}
          >
            <IconPlus className="size-4" />
          </Button>
          {onCollapse ? (
            <PaneCollapseButton side="left" onCollapse={onCollapse} />
          ) : null}
        </div>
      </div>

      <ScrollArea className="max-h-56 shrink-0 rule-b" containScroll>
        {sortedDocuments.length > 0 ? (
          <TreeView
            data={documentTree}
            selectedItemId={activeSlug}
            defaultLeafIcon={IconFileText}
            onSelectChange={(item) => {
              const slug = item?.slug;
              if (slug) onSelectDocument(slug);
            }}
            renderItem={renderDocumentItem}
          />
        ) : (
          <div className="m-2 border border-dashed border-border/70 p-3 text-muted-foreground">
            No design files yet.
          </div>
        )}
      </ScrollArea>

      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 rule-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <IconVectorBezier className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">Objects</span>
          </div>
          <div className="text-muted-foreground">
            {selectedPathIds.length}/{document.paths.length} selected
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            title="New path"
            aria-label="New path"
            onClick={onCreatePath}
          >
            <IconPlus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  title="Object actions"
                  aria-label="Object actions"
                >
                  <IconDotsVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem disabled={!canGroup} onClick={onGroupSelection}>
                <IconLayersLinked />
                Group selected
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canUngroup}
                onClick={onUngroupSelection}
              >
                <IconLayersOff />
                Ungroup selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={selectedPathIds.length === 0}
                onClick={onDuplicateSelection}
              >
                <IconCopy />
                Duplicate selected
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedPathIds.length === 0}
                variant="destructive"
                onClick={onDeleteSelection}
              >
                <IconTrash />
                Delete selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rule-b p-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={objectFilter}
            onChange={(event) => setObjectFilter(event.currentTarget.value)}
            className="pl-7"
            placeholder="Find objects"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" containScroll>
        {objectEntries.length > 0 ? (
          <TreeView
            data={objectEntries}
            selectedItemId={selectedTreeItemId}
            initialExpandedItemIds={
              objectFilter.trim()
                ? objectEntries
                    .filter((item) => item.kind === "group")
                    .map((item) => item.id)
                : []
            }
            defaultLeafIcon={IconVectorBezier}
            defaultNodeIcon={IconLayersLinked}
            onSelectChange={(item, event) => {
              const entry = item;
              if (!entry) return;
              const extend = eventExtendsSelection(event);
              if (entry.kind === "group" && entry.groupId) {
                const groupPathIds = (entry.paths || []).map((path) => path.id);
                if (event?.shiftKey) {
                  rangeSelectTo(groupPathIds);
                } else {
                  onSelectGroup(entry.groupId, extend);
                  selectionAnchorRef.current = groupPathIds.at(-1) || null;
                }
              } else if (entry.kind === "path" && entry.path) {
                if (event?.shiftKey) {
                  rangeSelectTo([entry.path.id]);
                } else {
                  onSelectPath(entry.path.id, extend, "path");
                  selectionAnchorRef.current = entry.path.id;
                }
              }
            }}
            renderItem={renderObjectItem}
          />
        ) : (
          <div className="m-2 border border-dashed border-border/70 p-3 text-muted-foreground">
            No matching objects.
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
