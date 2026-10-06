import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCircle,
  IconFocusCentered,
  IconGridDots,
  IconHandMove,
  IconPointer,
  IconRectangle,
  IconVectorBezier,
  IconZoomIn,
  IconZoomOut,
} from "@/ui/icons";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { formatZoom } from "@/lib/svg/geometry";
import { cn } from "@/lib/utils";
import {
  MenubarCheckboxItem,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from "@/ui/menubar";
import { useAppMenu } from "@/shell/menu-context";
import { themeViewItems, useTheme } from "@/lib/theme";

const tools = [
  {
    id: "select",
    label: "Select",
    title: "Select objects and edit anchors (V)",
    icon: IconPointer,
  },
  {
    id: "pen",
    label: "Pen",
    title: "Pen: click for corners, drag for curves (P)",
    icon: IconVectorBezier,
  },
  {
    id: "hand",
    label: "Pan",
    title: "Pan canvas (hold Space for temporary pan)",
    icon: IconHandMove,
  },
];

const shapeTools = [
  {
    id: "rectangle",
    label: "Rectangle",
    title: "Rectangle: drag to draw",
    icon: IconRectangle,
  },
  {
    id: "ellipse",
    label: "Ellipse",
    title: "Ellipse: drag to draw",
    icon: IconCircle,
  },
  {
    id: "line",
    label: "Line",
    title: "Line: drag to draw",
    icon: IconVectorBezier,
  },
];

const booleanOperations = [
  {
    id: "union",
    label: "Union",
    title: "Add selected objects",
  },
  {
    id: "subtract",
    label: "Subtract",
    title: "Subtract upper objects from the first selected object",
  },
  {
    id: "intersect",
    label: "Intersect",
    title: "Keep only overlapping geometry",
  },
  {
    id: "difference",
    label: "Difference",
    title: "Exclude overlapping geometry",
  },
  {
    id: "divide",
    label: "Divide",
    title: "Split selected objects into separate filled pieces",
  },
];

function ToolbarButton({
  selected,
  disabled,
  title,
  label,
  onClick,
  children,
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "grid size-8 place-items-center border transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

export function EditorToolbar({
  tool,
  zoom,
  selectedPathCount,
  hasSelectedPoint,
  hasSelectedPath,
  onToolChange,
  onBooleanOperation,
  onCornerPoint,
  onSmoothPoint,
  onClosePath,
  onDeleteSelection,
  onDuplicateSelection,
  onCopySelection,
  onPasteSelection,
  onSelectAll,
  onReorderSelection,
  onAlignSelection,
  onDistributeSelection,
  onGroupSelection,
  onUngroupSelection,
  canGroup,
  canUngroup,
  onFitCanvas,
  onActualSize,
  onZoomIn,
  onZoomOut,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapToGrid,
  onToggleSnapToGrid,
}) {
  const theme = useTheme();
  useAppMenu(
    {
      view: themeViewItems(theme),
      viewContent: (
        <>
          <MenubarCheckboxItem
            checked={snapToGrid}
            onCheckedChange={onToggleSnapToGrid}
          >
            Snap 10px grid
            <MenubarShortcut>G</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem onClick={onFitCanvas}>
            Fit canvas
            <MenubarShortcut>F</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onActualSize}>
            Actual size
            <MenubarShortcut>1</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onZoomIn}>
            Zoom in
            <MenubarShortcut>+</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onZoomOut}>
            Zoom out
            <MenubarShortcut>-</MenubarShortcut>
          </MenubarItem>
        </>
      ),
      menus: [
        {
          id: "edit",
          label: "Edit",
          content: (
            <>
              <MenubarItem disabled={!canUndo} onClick={onUndo}>
                Undo
                <MenubarShortcut>⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canRedo} onClick={onRedo}>
                Redo
                <MenubarShortcut>Shift ⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={onSelectAll}>
                Select all
                <MenubarShortcut>⌘A</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={onCopySelection}
              >
                Copy
                <MenubarShortcut>⌘C</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={onPasteSelection}>
                Paste
                <MenubarShortcut>⌘V</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={onDuplicateSelection}
              >
                Duplicate
                <MenubarShortcut>⌘D</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={!hasSelectedPath && !hasSelectedPoint}
                variant="destructive"
                onClick={onDeleteSelection}
              >
                Delete
                <MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
            </>
          ),
        },
        {
          id: "object",
          label: "Object",
          content: (
            <>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={() => onReorderSelection("front")}
              >
                Bring to front
                <MenubarShortcut>Shift ⌘]</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={() => onReorderSelection("forward")}
              >
                Bring forward
                <MenubarShortcut>⌘]</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={() => onReorderSelection("backward")}
              >
                Send backward
                <MenubarShortcut>⌘[</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!hasSelectedPath}
                onClick={() => onReorderSelection("back")}
              >
                Send to back
                <MenubarShortcut>Shift ⌘[</MenubarShortcut>
              </MenubarItem>
            </>
          ),
        },
        {
          id: "arrange",
          label: "Arrange",
          content: (
            <>
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("left")}
              >
                Align left
              </MenubarItem>
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("h-center")}
              >
                Align horizontal centers
              </MenubarItem>
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("right")}
              >
                Align right
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("top")}
              >
                Align top
              </MenubarItem>
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("middle")}
              >
                Align vertical centers
              </MenubarItem>
              <MenubarItem
                disabled={selectedPathCount < 2}
                onClick={() => onAlignSelection("bottom")}
              >
                Align bottom
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={selectedPathCount < 3}
                onClick={() => onDistributeSelection("horizontal")}
              >
                Distribute horizontally
              </MenubarItem>
              <MenubarItem
                disabled={selectedPathCount < 3}
                onClick={() => onDistributeSelection("vertical")}
              >
                Distribute vertically
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled={!canGroup} onClick={onGroupSelection}>
                Group
                <MenubarShortcut>⌘G</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canUngroup} onClick={onUngroupSelection}>
                Ungroup
                <MenubarShortcut>Shift ⌘G</MenubarShortcut>
              </MenubarItem>
            </>
          ),
        },
        {
          id: "path",
          label: "Path",
          content: (
            <>
              <MenubarItem disabled={!hasSelectedPoint} onClick={onCornerPoint}>
                Make corner
              </MenubarItem>
              <MenubarItem disabled={!hasSelectedPoint} onClick={onSmoothPoint}>
                Make smooth
              </MenubarItem>
              <MenubarItem disabled={!hasSelectedPath} onClick={onClosePath}>
                Close path
                <MenubarShortcut>↵</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              {booleanOperations.map((item) => (
                <MenubarItem
                  key={item.id}
                  disabled={selectedPathCount < 2}
                  title={item.title}
                  onClick={() => onBooleanOperation(item.id)}
                >
                  {item.label}
                </MenubarItem>
              ))}
            </>
          ),
        },
      ],
    },
    [theme.id, canUndo, canRedo, tool, selectedPathCount],
  );
  return (
    <div className="h-12 shrink-0 rule-b bg-background">
      <ScrollArea
        className="h-full w-full"
        viewportClassName="h-full"
        containScroll
      >
        <div className="flex h-full min-w-full items-center">
          <div className="flex shrink-0 items-center gap-1 pl-3">
            <Divider />

            {tools.map((item) => {
              const Icon = item.icon;
              return (
                <ToolbarButton
                  key={item.id}
                  title={item.title}
                  label={item.label}
                  selected={item.id === tool}
                  onClick={() => onToolChange(item.id)}
                >
                  <Icon className="size-4" />
                </ToolbarButton>
              );
            })}

            <Divider />

            <ToolbarButton
              title="Undo (Cmd+Z)"
              label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <IconArrowBackUp className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Redo (Shift+Cmd+Z)"
              label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <IconArrowForwardUp className="size-4" />
            </ToolbarButton>

            <Divider />

            {shapeTools.map((item) => {
              const Icon = item.icon;
              return (
                <ToolbarButton
                  key={item.id}
                  title={item.title}
                  label={item.label}
                  selected={tool === item.id}
                  onClick={() => onToolChange(item.id)}
                >
                  <Icon className="size-4" />
                </ToolbarButton>
              );
            })}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 pr-3">
            <div
              className="mr-2 grid size-8 place-items-center frame"
              title={`Document is ${saveStatus}`}
              aria-label={`Document is ${saveStatus}`}
            >
              <span
                className={cn(
                  "size-2 shrink-0",
                  saveStatus === "saved" && "bg-green-600",
                  saveStatus === "saving" && "animate-pulse bg-foreground",
                  saveStatus === "loading" &&
                    "animate-pulse bg-muted-foreground",
                  saveStatus === "offline" && "bg-destructive",
                )}
              />
            </div>
            <ToolbarButton
              title="Snap to 10px grid (G)"
              label="Snap 10px grid"
              selected={snapToGrid}
              onClick={onToggleSnapToGrid}
            >
              <IconGridDots className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Fit SVG to canvas (F)"
              label="Fit canvas"
              onClick={onFitCanvas}
            >
              <IconFocusCentered className="size-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Zoom out (-)"
              label="Zoom out"
              onClick={onZoomOut}
            >
              <IconZoomOut className="size-4" />
            </ToolbarButton>
            <div className="flex h-8 w-14 items-center justify-end frame px-2 text-muted-foreground">
              {formatZoom(zoom)}
            </div>
            <ToolbarButton
              title="Zoom in (+)"
              label="Zoom in"
              onClick={onZoomIn}
            >
              <IconZoomIn className="size-4" />
            </ToolbarButton>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
