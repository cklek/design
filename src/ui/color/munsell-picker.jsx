import { memo, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { IconCheck } from "@/ui/icons";

/**
 * @typedef {{ family: string, hue: string, chromaRows: Array<Array<string | number | null | undefined>> }} MunsellHue
 * @typedef {{ chroma: number, family: string, hex: string, hue: string, value: number }} MunsellSwatch
 */
function normalizeHex(value) {
  const trimmed = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function flattenSwatches(hues) {
  const swatches = [];
  for (const hue of hues) {
    for (const row of hue.chromaRows) {
      const chroma = Number(row[0]) || 0;
      for (let valueIndex = 1; valueIndex < row.length; valueIndex += 1) {
        const candidate = row[valueIndex];
        const hex =
          typeof candidate === "string" ? normalizeHex(candidate) : null;
        if (!hex) continue;
        swatches.push({
          chroma,
          family: hue.family,
          hex,
          hue: hue.hue,
          value: valueIndex,
        });
      }
    }
  }
  return swatches;
}

function nearestSwatch(swatches, value) {
  const rgb = hexToRgb(String(value || ""));
  if (!rgb || swatches.length === 0) return null;
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const swatch of swatches) {
    const candidate = hexToRgb(swatch.hex);
    if (!candidate) continue;
    const distance =
      (candidate.r - rgb.r) ** 2 +
      (candidate.g - rgb.g) ** 2 +
      (candidate.b - rgb.b) ** 2;
    if (distance < nearestDistance) {
      nearest = swatch;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function textColorFor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#fff";
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance > 150 ? "#111827" : "#f9fafb";
}

function swatchKey(swatch) {
  return `${swatch.hue}:${swatch.value}/${swatch.chroma}:${swatch.hex}`;
}

const HueGrid = memo(
  /**
   * @param {{ activeHex?: string | null, hue: MunsellHue, nearestHex?: string | null, onSelect: (swatch: MunsellSwatch) => void }} props
   */
  function HueGrid({ activeHex, hue, nearestHex, onSelect }) {
    const grid = useMemo(() => {
      const rows = [...hue.chromaRows].sort(
        (a, b) => Number(a[0]) - Number(b[0]),
      );
      const maxChroma = Math.max(14, ...rows.map((row) => Number(row[0]) || 0));
      const cells = [];
      for (let value = 9; value >= 1; value -= 1) {
        for (let chroma = 2; chroma <= maxChroma; chroma += 2) {
          const row = rows.find((candidate) => Number(candidate[0]) === chroma);
          const candidate = row?.[value];
          const hex =
            typeof candidate === "string" ? normalizeHex(candidate) : null;
          cells.push({
            chroma,
            key: `${hue.hue}:${value}/${chroma}`,
            value,
            swatch: hex
              ? {
                  chroma,
                  family: hue.family,
                  hex,
                  hue: hue.hue,
                  value,
                }
              : null,
          });
        }
      }
      return { cells, cols: maxChroma / 2 };
    }, [hue]);
    return (
      <div
        className="grid gap-px border border-border/70 bg-muted/25 p-1"
        style={
          /** @type {import('react').CSSProperties & Record<string, string | number>} */ ({
            "--munsell-grid-cols": grid.cols,
            gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          })
        }
      >
        {grid.cells.map(({ key, swatch, value, chroma }) => {
          if (!swatch) {
            return (
              <span
                key={key}
                aria-hidden="true"
                className="aspect-square bg-background/30"
              />
            );
          }
          const selected = activeHex === swatch.hex;
          const nearest = nearestHex === swatch.hex && !selected;
          return (
            <button
              key={key}
              type="button"
              title={`${swatch.hue} ${value}/${chroma} ${swatch.hex}`}
              aria-label={`${swatch.hue} value ${value} chroma ${chroma}`}
              className={cn(
                "relative aspect-square min-h-5 border border-transparent outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60",
                selected && "z-10 ring-2 ring-foreground ring-offset-1",
                nearest &&
                  "outline outline-1 outline-dashed outline-foreground/70",
              )}
              style={{ backgroundColor: swatch.hex }}
              onClick={() => onSelect(swatch)}
            >
              {selected ? (
                <span
                  className="absolute inset-0 grid place-items-center"
                  style={{ color: textColorFor(swatch.hex) }}
                >
                  <IconCheck className="size-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  },
);
/**
 * @param {{ className?: string, compact?: boolean, hues: MunsellHue[], label?: string, nativeColorLabel?: string, value?: string | null, onChange: (hex: string, swatch: MunsellSwatch) => void }} props
 */
export function MunsellColorPicker({
  className,
  compact = true,
  hues,
  label = "Munsell",
  nativeColorLabel = "Native color",
  value,
  onChange,
}) {
  const swatches = useMemo(() => flattenSwatches(hues), [hues]);
  const activeHex = normalizeHex(value);
  const exact = useMemo(
    () =>
      activeHex
        ? swatches.find((swatch) => swatch.hex === activeHex) || null
        : null,
    [activeHex, swatches],
  );
  const nearest = useMemo(
    () => (exact ? exact : nearestSwatch(swatches, activeHex)),
    [activeHex, exact, swatches],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    const match = exact || nearest;
    if (!match) return;
    const index = hues.findIndex((hue) => hue.hue === match.hue);
    if (index >= 0) setSelectedIndex(index);
  }, [exact, hues, nearest]);
  if (hues.length === 0) {
    return (
      <div className={cn("p-3 text-muted-foreground", className)}>
        No Munsell colors available.
      </div>
    );
  }
  const currentHue = hues[Math.min(selectedIndex, hues.length - 1)] || hues[0];
  const selectSwatch = (swatch) => {
    onChange(swatch.hex, swatch);
  };
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-foreground">
              {label}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {currentHue.hue}
            </span>
          </div>
          <div className="mt-1 truncate text-muted-foreground">
            {currentHue.family}
          </div>
        </div>
        {activeHex ? (
          <span
            className="grid size-8 shrink-0 place-items-center border border-border"
            style={{
              backgroundColor: activeHex,
              color: textColorFor(activeHex),
            }}
            title={activeHex}
          >
            {activeHex.slice(1, 4)}
          </span>
        ) : null}
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, hues.length - 1)}
        step={1}
        value={selectedIndex}
        onChange={(event) =>
          setSelectedIndex(Number(event.currentTarget.value))
        }
        className="block h-1 w-full cursor-pointer accent-foreground"
        aria-label="Munsell hue"
      />

      <HueGrid
        hue={currentHue}
        activeHex={activeHex}
        nearestHex={nearest?.hex || null}
        onSelect={selectSwatch}
      />

      <div
        className={cn(
          "grid gap-2",
          compact ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
        )}
      >
        <div className="min-w-0 border border-border/70 px-2 py-2">
          <div className="text-muted-foreground">
            {exact ? "Selected" : nearest ? "Nearest" : "Current"}
          </div>
          <div className="mt-1 truncate text-foreground">
            {exact || nearest
              ? `${(exact || nearest).hue} ${(exact || nearest).value}/${(exact || nearest).chroma} ${(exact || nearest).hex}`
              : activeHex || "none"}
          </div>
        </div>
        {!exact && nearest ? (
          <button
            type="button"
            className="inline-flex h-full items-center justify-center border border-border/70 px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={() => selectSwatch(nearest)}
          >
            Snap
          </button>
        ) : null}
      </div>

      <label className="flex h-8 items-center border border-border/70 bg-background">
        <span className="px-2 text-muted-foreground">
          {nativeColorLabel}
        </span>
        <input
          type="color"
          value={activeHex || nearest?.hex || "#000000"}
          className="ml-auto h-full w-10 rule-l bg-transparent p-0"
          onChange={(event) => {
            const snap = nearestSwatch(swatches, event.currentTarget.value);
            if (snap) selectSwatch(snap);
          }}
          aria-label={nativeColorLabel}
        />
      </label>
    </div>
  );
}

/**
 * @param {MunsellSwatch} swatch
 */
export function munsellPickerSwatchKey(swatch) {
  return swatchKey(swatch);
}
