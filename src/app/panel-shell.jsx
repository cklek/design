import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@/ui/icons";
import { Button } from "@/ui/button";
import { cn } from "@/lib/utils";

const IDLE_FADE_AFTER_MS = 1200;

const IDLE_OPACITY_CLASS = "opacity-40";

export function PaneIdleFade({ children, className }) {
  const [idle, setIdle] = useState(false);
  const timeoutRef = useRef(null);
  function clearIdleTimer() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }
  function scheduleIdle() {
    clearIdleTimer();
    timeoutRef.current = setTimeout(() => setIdle(true), IDLE_FADE_AFTER_MS);
  }
  useEffect(() => () => clearIdleTimer(), []);
  return (
    <div
      onMouseEnter={() => {
        clearIdleTimer();
        setIdle(false);
      }}
      onMouseLeave={scheduleIdle}
      onFocus={() => {
        clearIdleTimer();
        setIdle(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          scheduleIdle();
        }
      }}
      className={cn(
        "flex h-full min-h-0 transition-opacity duration-500",
        idle && IDLE_OPACITY_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PaneCollapsedRail({ side, label, icon: Icon, onExpand }) {
  return (
    <aside
      className={cn(
        "flex min-h-0 w-8 flex-col items-center bg-sidebar",
        side === "left" ? "rule-r" : "rule-l",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={`Expand ${label}`}
        aria-label={`Expand ${label}`}
        onClick={onExpand}
        className="flex h-12 w-full shrink-0 items-center justify-center rule-b text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        {side === "left" ? (
          <IconChevronRight className="size-4" />
        ) : (
          <IconChevronLeft className="size-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={`Expand ${label}`}
        aria-label={`Expand ${label}`}
        onClick={onExpand}
        className="flex flex-1 min-h-0 w-full flex-col items-center justify-start gap-2 border-0 py-3 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex w-full select-none flex-col items-start pl-3 uppercase">
          {label.split("").map((character, index) => (
            <span key={`${character}-${index}`} className="block">
              {character}
            </span>
          ))}
        </span>
      </Button>
    </aside>
  );
}

export function PaneCollapseButton({ side, onCollapse }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="Collapse panel"
      aria-label="Collapse panel"
      onClick={onCollapse}
      className="flex size-6 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
    >
      {side === "left" ? (
        <IconChevronLeft className="size-4" />
      ) : (
        <IconChevronRight className="size-4" />
      )}
    </Button>
  );
}
