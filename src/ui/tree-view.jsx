import React from "react";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconFolderOpen,
} from "@/ui/icons";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const treeVariants = cva(
  "group hover:before:opacity-100 before:absolute before:left-0 px-2 before:w-full before:opacity-0 before:bg-accent/70 before:h-6 before:-z-10",
);
const selectedTreeVariants = cva(
  "before:opacity-100 before:bg-accent/70 text-accent-foreground",
);
const dragOverVariants = cva(
  "before:opacity-100 before:bg-primary/20 text-primary-foreground",
);

function resolveTreeItemIcon(item, options = {}) {
  if (options.isSelected && item?.selectedIcon) return item.selectedIcon;
  if (options.isOpen && item?.openIcon) return item.openIcon;
  if (item?.icon) return item.icon;
  if (item?.type === "folder" || item?.kind === "folder") {
    return options.isOpen ? IconFolderOpen : IconFolder;
  }
  return options.defaultIcon || IconFileText;
}

function TreeItemMeta({ item, isSelected }) {
  const details = [];
  if (item?.badge) details.push(item.badge);
  if (Number.isFinite(item?.count)) details.push(item.count.toLocaleString());
  if (details.length === 0) return null;
  return (
    <span
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1 pl-2",
        isSelected ? "text-accent-foreground/70" : "text-muted-foreground/70",
      )}
    >
      {details.map((detail) => (
        <span
          key={String(detail)}
          className="max-w-20 truncate border border-current/20 px-1"
        >
          {detail}
        </span>
      ))}
    </span>
  );
}
const TreeView = React.forwardRef(
  (
    {
      data,
      initialSelectedItemId,
      selectedItemId: controlledSelectedItemId,
      initialExpandedItemIds,
      onSelectChange,
      expandAll,
      defaultLeafIcon,
      defaultNodeIcon,
      className,
      onDocumentDrag,
      renderItem,
      ...props
    },
    ref,
  ) => {
    const [internalSelectedItemId, setInternalSelectedItemId] = React.useState(
      initialSelectedItemId,
    );
    const selectedItemId =
      controlledSelectedItemId !== undefined
        ? controlledSelectedItemId
        : internalSelectedItemId;
    const [draggedItem, setDraggedItem] = React.useState(null);
    const handleSelectChange = React.useCallback(
      (item, event) => {
        setInternalSelectedItemId(item?.id);
        if (onSelectChange) {
          onSelectChange(item, event);
        }
      },
      [onSelectChange],
    );
    const handleDragStart = React.useCallback((item) => {
      setDraggedItem(item);
    }, []);
    const handleDrop = React.useCallback(
      (targetItem) => {
        if (draggedItem && onDocumentDrag && draggedItem.id !== targetItem.id) {
          onDocumentDrag(draggedItem, targetItem);
        }
        setDraggedItem(null);
      },
      [draggedItem, onDocumentDrag],
    );
    const expandedItemIds = React.useMemo(() => {
      const ids = initialExpandedItemIds ? [...initialExpandedItemIds] : [];
      function pushExpandableItemIds(items) {
        const list = Array.isArray(items) ? items : [items];
        for (const item of list) {
          if (!item?.children?.length) continue;
          ids.push(item.id);
          pushExpandableItemIds(item.children);
        }
      }
      if (expandAll) {
        pushExpandableItemIds(data);
        return Array.from(new Set(ids));
      }
      if (!selectedItemId) {
        return ids;
      }
      function walkTreeItems(items, targetId) {
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            ids.push(items[i].id);
            if (walkTreeItems(items[i], targetId)) {
              return true;
            }
            ids.pop();
          }
        } else if (items.id === targetId) {
          return true;
        } else if (items.children) {
          return walkTreeItems(items.children, targetId);
        }
      }
      walkTreeItems(data, selectedItemId);
      return ids;
    }, [data, expandAll, selectedItemId, initialExpandedItemIds]);
    return (
      <div className={cn("overflow-hidden relative p-2", className)}>
        <TreeItem
          data={data}
          ref={ref}
          selectedItemId={selectedItemId}
          handleSelectChange={handleSelectChange}
          expandedItemIds={expandedItemIds}
          defaultLeafIcon={defaultLeafIcon}
          defaultNodeIcon={defaultNodeIcon}
          handleDragStart={handleDragStart}
          handleDrop={handleDrop}
          draggedItem={draggedItem}
          renderItem={renderItem}
          level={0}
          {...props}
        />
        <div
          className="w-full h-8"
          onDragOver={(event) => {
            if (draggedItem) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop({ id: "", name: "parent_div" });
          }}
        ></div>
      </div>
    );
  },
);
TreeView.displayName = "TreeView";
const TreeItem = React.forwardRef(
  (
    {
      className,
      data,
      selectedItemId,
      handleSelectChange,
      expandedItemIds,
      defaultNodeIcon,
      defaultLeafIcon,
      handleDragStart,
      handleDrop,
      draggedItem,
      renderItem,
      level,
      onSelectChange: _onSelectChange,
      expandAll: _expandAll,
      initialSelectedItemId: _initialSelectedItemId,
      onDocumentDrag: _onDocumentDrag,
      ...props
    },
    ref,
  ) => {
    if (!Array.isArray(data)) {
      data = [data];
    }
    return (
      <div ref={ref} role="tree" className={className} {...props}>
        <ul>
          {data.map((item) => (
            <li key={item.id}>
              {item.children ? (
                <TreeNode
                  item={item}
                  level={level ?? 0}
                  selectedItemId={selectedItemId}
                  expandedItemIds={expandedItemIds}
                  handleSelectChange={handleSelectChange}
                  defaultNodeIcon={defaultNodeIcon}
                  defaultLeafIcon={defaultLeafIcon}
                  handleDragStart={handleDragStart}
                  handleDrop={handleDrop}
                  draggedItem={draggedItem}
                  renderItem={renderItem}
                />
              ) : (
                <TreeLeaf
                  item={item}
                  level={level ?? 0}
                  selectedItemId={selectedItemId}
                  handleSelectChange={handleSelectChange}
                  defaultLeafIcon={defaultLeafIcon}
                  handleDragStart={handleDragStart}
                  handleDrop={handleDrop}
                  draggedItem={draggedItem}
                  renderItem={renderItem}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
TreeItem.displayName = "TreeItem";
const TreeNode = ({
  item,
  handleSelectChange,
  expandedItemIds,
  selectedItemId,
  defaultNodeIcon,
  defaultLeafIcon,
  handleDragStart,
  handleDrop,
  draggedItem,
  renderItem,
  level = 0,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(
    expandedItemIds.includes(item.id),
  );
  const [isDragOver, setIsDragOver] = React.useState(false);
  const hasChildren = !!item.children?.length;
  const isSelected = selectedItemId === item.id;
  const wasListedRef = React.useRef(expandedItemIds.includes(item.id));
  const lastSelectedRef = React.useRef(selectedItemId);
  React.useEffect(() => {
    const listed = expandedItemIds.includes(item.id);
    const selectionMoved = lastSelectedRef.current !== selectedItemId;
    lastSelectedRef.current = selectedItemId;
    if (
      listed &&
      selectedItemId !== item.id &&
      (!wasListedRef.current || selectionMoved)
    ) {
      setIsExpanded(true);
    }
    wasListedRef.current = listed;
  }, [expandedItemIds, item.id, selectedItemId]);
  const onDragStart = (e) => {
    if (!item.draggable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", item.id);
    handleDragStart?.(item);
  };
  const onDragOver = (e) => {
    if (item.droppable !== false && draggedItem && draggedItem.id !== item.id) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };
  const onDragLeave = () => {
    setIsDragOver(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleDrop?.(item);
  };
  const handleToggle = (e) => {
    e.stopPropagation();
    handleSelectChange(item, e);
    item.onClick?.();
    if (!item.disableExpansion) {
      setIsExpanded((prev) => !prev);
    }
  };
  return (
    <div className="group/node">
      <div
        className={cn(
          "flex flex-1 w-full items-center py-1 transition-all cursor-pointer select-none",
          treeVariants(),
          isSelected && selectedTreeVariants(),
          isDragOver && dragOverVariants(),
          item.className,
        )}
        onClick={handleToggle}
        draggable={!!item.draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {!item.disableExpansion && (
          <IconChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform duration-200 text-accent-foreground/50 mr-1",
              isExpanded ? "rotate-90" : "rotate-0",
            )}
          />
        )}

        {item.disableExpansion && <div className="w-4 shrink-0 mr-1" />}

        {renderItem ? (
          renderItem({
            item,
            level,
            isLeaf: false,
            isSelected,
            isOpen: isExpanded,
            hasChildren,
          })
        ) : (
          <>
            <TreeIcon
              item={item}
              isSelected={isSelected}
              isOpen={isExpanded}
              default={defaultNodeIcon}
            />
            <span className="truncate">{item.name}</span>
            <TreeItemMeta item={item} isSelected={isSelected} />
            <TreeActions isSelected={isSelected}>{item.actions}</TreeActions>
          </>
        )}
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isExpanded && !item.disableExpansion
            ? "grid-rows-[1fr]"
            : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-2 rule-l pl-2">
            {isExpanded && !item.disableExpansion ? (
              <TreeItem
                data={item.children ? item.children : item}
                selectedItemId={selectedItemId}
                handleSelectChange={handleSelectChange}
                expandedItemIds={expandedItemIds}
                defaultLeafIcon={defaultLeafIcon}
                defaultNodeIcon={defaultNodeIcon}
                handleDragStart={handleDragStart}
                handleDrop={handleDrop}
                draggedItem={draggedItem}
                renderItem={renderItem}
                level={level + 1}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
const TreeLeaf = React.forwardRef(
  (
    {
      className,
      item,
      level,
      selectedItemId,
      handleSelectChange,
      defaultLeafIcon,
      handleDragStart,
      handleDrop,
      draggedItem,
      renderItem,
      ...props
    },
    ref,
  ) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const isSelected = selectedItemId === item.id;
    const onDragStart = (e) => {
      if (!item.draggable || item.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", item.id);
      handleDragStart?.(item);
    };
    const onDragOver = (e) => {
      if (
        item.droppable !== false &&
        !item.disabled &&
        draggedItem &&
        draggedItem.id !== item.id
      ) {
        e.preventDefault();
        setIsDragOver(true);
      }
    };
    const onDragLeave = () => {
      setIsDragOver(false);
    };
    const onDrop = (e) => {
      if (item.disabled) return;
      e.preventDefault();
      setIsDragOver(false);
      handleDrop?.(item);
    };
    return (
      <div
        ref={ref}
        className={cn(
          "flex text-left items-center py-1 cursor-pointer before:right-1",
          treeVariants(),
          className,
          isSelected && selectedTreeVariants(),
          isDragOver && dragOverVariants(),
          item.disabled && "opacity-50 cursor-not-allowed pointer-events-none",
          item.className,
        )}
        onClick={(event) => {
          if (item.disabled) return;
          handleSelectChange(item, event);
          item.onClick?.();
        }}
        draggable={!!item.draggable && !item.disabled}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...props}
      >
        {renderItem ? (
          <>
            <div className="h-4 w-4 shrink-0 mr-1" />
            {renderItem({
              item,
              level,
              isLeaf: true,
              isSelected,
              hasChildren: false,
            })}
          </>
        ) : (
          <>
            <TreeIcon
              item={item}
              isSelected={isSelected}
              default={defaultLeafIcon}
            />
            <span className="flex-grow truncate">{item.name}</span>
            <TreeItemMeta item={item} isSelected={isSelected} />
            <TreeActions isSelected={isSelected && !item.disabled}>
              {item.actions}
            </TreeActions>
          </>
        )}
      </div>
    );
  },
);
TreeLeaf.displayName = "TreeLeaf";
const TreeIcon = ({ item, isOpen, isSelected, default: _defaultIcon }) => {
  const Icon = resolveTreeItemIcon(item, {
    defaultIcon: _defaultIcon,
    isOpen,
    isSelected,
  });
  return Icon ? <Icon className="h-4 w-4 shrink-0 mr-2" /> : <></>;
};
const TreeActions = ({ children, isSelected }) => {
  return (
    <div
      className={cn(
        isSelected ? "block" : "hidden",
        "absolute right-3 group-hover:block",
      )}
    >
      {children}
    </div>
  );
};
export { TreeView, TreeLeaf, TreeNode, TreeItem, resolveTreeItemIcon };
