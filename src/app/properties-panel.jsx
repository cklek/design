import { useState } from "react";
import {
  IconClock,
  IconCode,
  IconCopy,
  IconFileImport,
  IconFilePlus,
  IconPalette,
  IconRotate,
  IconRotateClockwise,
  IconTrash,
} from "@/ui/icons";
import { getMunsellHues, MunsellColorPicker } from "@/ui/color";
import { Button } from "@/ui/button";
import { DropdownSelect } from "@/ui/dropdown-select";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { ScrollArea } from "@/ui/scroll-area";
import { Textarea } from "@/ui/textarea";
import { getPathBounds } from "@/lib/svg/bounds";
import { DESIGN_GRID_SIZE } from "@/lib/svg/geometry";
import { DESIGN_FONT_FAMILY_OPTIONS } from "@/lib/svg/types";
import { cn } from "@/lib/utils";
import { PaneCollapseButton } from "./panel-shell";

function colorInputValue(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function PathColorField({ label, value, onChange }) {
  const hasHex = isHexColor(value);
  const displayColor = colorInputValue(value);
  return (
    <div className="space-y-2">
      <label className="text-muted-foreground">{label}</label>
      <div className="flex h-8 items-center frame bg-background">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="grid h-full w-8 shrink-0 place-items-center rule-r bg-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label={`${label} Munsell color picker`}
                title={`${label} Munsell color picker`}
              />
            }
          >
            <span
              className="grid size-4 place-items-center frame"
              style={{
                backgroundColor: hasHex ? displayColor : "transparent",
              }}
            >
              {!hasHex ? <IconPalette className="size-3" /> : null}
            </span>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-80 p-3">
            <MunsellColorPicker
              hues={getMunsellHues()}
              label={`${label} color`}
              nativeColorLabel={`${label} native`}
              value={value}
              onChange={(hex) => onChange(hex)}
            />
            <div className="grid cols-2 gap-2 [--col-gap:8px]">
              <Button
                type="button"
                variant="ghost"
                className="h-8 frame px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onChange("none")}
              >
                None
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-8 frame px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onChange("#000000")}
              >
                Black
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Input
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-full border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

function formatRevisionTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  return Number(value.toFixed(1)).toString();
}

function BoundsInput({ label, value, onChange }) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={DESIGN_GRID_SIZE}
        aria-label={`Object ${label}`}
        value={formatNumber(value)}
        className="h-8 px-2 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          if (Number.isFinite(nextValue)) onChange(nextValue);
        }}
      />
    </label>
  );
}

function RevisionPopover({ revisions, isLoading, onRestore }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label="Revisions"
            title="Revisions"
          >
            <IconClock className="size-3" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-2">
        <div className="flex items-center justify-between px-1 py-1">
          <div>Revisions</div>
          <div className="text-muted-foreground">
            {isLoading ? "syncing" : `${revisions.length} saved`}
          </div>
        </div>
        <ScrollArea className="max-h-72" containScroll>
          {revisions.length > 0 ? (
            /* Two 16px lines plus `py-2` is exactly 48px, so the row is pinned
             * to `h-12` rather than inheriting the button's 32px default —
             * otherwise the content overflows a short box and the centring
             * drags both lines a pixel off the baseline grid. `items-start`
             * puts the revision number on the same line as the source name, and
             * `border-0` drops the button's 1px transparent border, which a
             * centred single-line label absorbs but explicit padding does not:
             * with it the first line would start at 9px, not 8. */
            revisions.slice(0, 12).map((revision) => (
              <Button
                key={revision.id}
                type="button"
                variant="ghost"
                className="grid h-12 w-full grid-cols-[52px_minmax(0,1fr)] items-start gap-2 border-0 px-2 py-2 text-left transition-colors hover:bg-accent"
                onClick={() => onRestore(revision)}
              >
                <span className="text-muted-foreground">
                  r{revision.revision}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground">
                    {revision.source}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {formatRevisionTime(revision.createdAt)}
                  </span>
                </span>
              </Button>
            ))
          ) : (
            <div className="px-2 py-6 text-muted-foreground">
              No saved revisions yet.
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function RotateField({ onRotate }) {
  const [angle, setAngle] = useState("0");
  function commit() {
    const parsed = Number(angle);
    if (!Number.isFinite(parsed) || parsed === 0) {
      setAngle("0");
      return;
    }
    onRotate(parsed);
    setAngle("0");
  }
  return (
    <div className="space-y-2">
      <label className="text-muted-foreground">Rotate</label>
      <div className="flex h-8 items-center gap-1">
        <Input
          type="number"
          value={angle}
          aria-label="Rotation angle in degrees"
          onChange={(event) => setAngle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Rotate -90°"
          aria-label="Rotate counter-clockwise 90 degrees"
          onClick={() => onRotate(-90)}
        >
          <IconRotate className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Rotate +90°"
          aria-label="Rotate clockwise 90 degrees"
          onClick={() => onRotate(90)}
        >
          <IconRotateClockwise className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function PropertiesPanel({
  document,
  activeDocument,
  selectedPath,
  selectedGroup,
  selectedBounds,
  selectedPathCount,
  source,
  error,
  onSourceChange,
  onImportSource,
  onExportSource,
  onResetDocument,
  onRenameDocument,
  onRenameGroup,
  onDeleteDocument,
  onUpdateDocumentFontFamily,
  onUpdatePath,
  onUpdatePathBounds,
  onRotateSelection,
  revisions,
  isLoadingRevisions,
  onRestoreRevision,
  onCollapse,
  embedded = false,
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const activeBounds =
    selectedPathCount > 1
      ? selectedBounds
      : selectedPath
        ? getPathBounds(selectedPath)
        : null;
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar",
        embedded ? "" : "rule-l",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 rule-b px-3">
        {onCollapse ? (
          <PaneCollapseButton side="right" onCollapse={onCollapse} />
        ) : null}
        <div className="text-muted-foreground">
          {document.viewBox.width}x{document.viewBox.height}
        </div>
        <div className="flex items-center gap-1">
          <RevisionPopover
            revisions={revisions}
            isLoading={isLoadingRevisions}
            onRestore={onRestoreRevision}
          />
          <Button
            type="button"
            variant={sourceOpen ? "default" : "outline"}
            size="icon-xs"
            aria-label="SVG source"
            title="SVG source"
            onClick={() => setSourceOpen((current) => !current)}
          >
            <IconCode className="size-3" />
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="flex flex-col gap-4 p-3"
        containScroll
      >
        <div className="space-y-2 frame p-2">
          <div className="flex items-center gap-1">
            <Input
              aria-label="File name"
              value={activeDocument?.name || "Untitled Canvas"}
              onChange={(event) => onRenameDocument(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label="Delete file"
              title="Delete file"
              onClick={onDeleteDocument}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
          <div className="truncate text-muted-foreground">
            {activeDocument?.slug || "unsaved"}
          </div>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2">
            <span className="text-muted-foreground">Font</span>
            <DropdownSelect
              value={document.fontFamily || DESIGN_FONT_FAMILY_OPTIONS[0].value}
              onValueChange={onUpdateDocumentFontFamily}
              options={DESIGN_FONT_FAMILY_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              size="sm"
              aria-label="Document font family"
            />
          </div>
        </div>

        {selectedPath ? (
          <div className="space-y-3 frame p-2">
            {selectedGroup ? (
              <div className="flex items-center gap-1">
                <Input
                  aria-label="Group name"
                  value={selectedGroup.name}
                  onChange={(event) =>
                    onRenameGroup(selectedGroup.id, event.currentTarget.value)
                  }
                />
                <div className="shrink-0 frame px-2 py-1 text-muted-foreground">
                  {selectedGroup.count} grouped
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Input
                  aria-label="Object name"
                  value={
                    selectedPathCount === 1
                      ? selectedPath.name
                      : "Mixed selection"
                  }
                  disabled={selectedPathCount > 1}
                  onChange={(event) =>
                    onUpdatePath({ name: event.currentTarget.value })
                  }
                />
                {selectedPathCount > 1 ? (
                  <div className="shrink-0 frame px-2 py-1 text-muted-foreground">
                    {selectedPathCount} selected
                  </div>
                ) : null}
              </div>
            )}
            {activeBounds ? (
              <div className="grid cols-4 gap-2 [--col-gap:8px]">
                {[
                  ["X", "x", activeBounds.x],
                  ["Y", "y", activeBounds.y],
                  ["W", "width", activeBounds.width],
                  ["H", "height", activeBounds.height],
                ].map(([label, key, value]) => {
                  const boundsKey = key;
                  return (
                    <BoundsInput
                      key={label}
                      label={label}
                      value={value}
                      onChange={(nextValue) =>
                        onUpdatePathBounds({
                          ...activeBounds,
                          [boundsKey]:
                            boundsKey === "width" || boundsKey === "height"
                              ? Math.max(DESIGN_GRID_SIZE, nextValue)
                              : nextValue,
                        })
                      }
                    />
                  );
                })}
              </div>
            ) : null}
            <div className="grid cols-2 gap-2 [--col-gap:8px]">
              <PathColorField
                label="Fill"
                value={selectedPath.fill}
                onChange={(fill) => onUpdatePath({ fill })}
              />
              <PathColorField
                label="Stroke"
                value={selectedPath.stroke}
                onChange={(stroke) => onUpdatePath({ stroke })}
              />
            </div>
            <div className="grid cols-2 gap-2 [--col-gap:8px]">
              <div className="space-y-2">
                <label className="text-muted-foreground">Stroke width</label>
                <Input
                  type="number"
                  value={selectedPath.strokeWidth}
                  onChange={(event) =>
                    onUpdatePath({
                      strokeWidth: Math.max(
                        0,
                        Number(event.currentTarget.value),
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-muted-foreground">Fill rule</label>
                <DropdownSelect
                  value={selectedPath.fillRule || "nonzero"}
                  onValueChange={(value) =>
                    onUpdatePath({
                      fillRule: value,
                    })
                  }
                  options={[
                    { value: "nonzero", label: "nonzero" },
                    { value: "evenodd", label: "evenodd" },
                  ]}
                />
              </div>
            </div>
            <RotateField onRotate={onRotateSelection} />
          </div>
        ) : (
          <div className="frame p-3 text-muted-foreground">
            No object selected.
          </div>
        )}

        {sourceOpen ? (
          <div className="space-y-2 frame p-2">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground">
                {document.paths.length} objects / {source.length} chars
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label="New SVG"
                  title="New SVG"
                  onClick={onResetDocument}
                >
                  <IconFilePlus className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label="Import SVG"
                  title="Import SVG"
                  onClick={onImportSource}
                >
                  <IconFileImport className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label="Copy SVG"
                  title="Copy SVG"
                  onClick={onExportSource}
                >
                  <IconCopy className="size-3" />
                </Button>
              </div>
            </div>
            <Textarea
              className={cn(
                "scrollbar-hide h-72 max-h-72 resize-none overflow-auto border-input p-2",
                error && "border-destructive/70",
              )}
              value={source}
              spellCheck={false}
              onChange={(event) => onSourceChange(event.currentTarget.value)}
            />
            {error ? <div className="text-destructive">{error}</div> : null}
          </div>
        ) : null}
      </ScrollArea>
    </aside>
  );
}
