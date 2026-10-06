const SYSTEM_SANS_FAMILY = "Inter, ui-sans-serif, system-ui, sans-serif";
const SYSTEM_SERIF_FAMILY =
  'ui-serif, Georgia, Cambria, "Times New Roman", serif';
export const DEFAULT_DESIGN_FONT_FAMILY = SYSTEM_SANS_FAMILY;
export const DESIGN_FONT_FAMILY_OPTIONS = [
  { value: DEFAULT_DESIGN_FONT_FAMILY, label: "Inter / system sans" },
  { value: SYSTEM_SERIF_FAMILY, label: "System serif" },
];
const DESIGN_FONT_FAMILY_VALUES = new Set(
  DESIGN_FONT_FAMILY_OPTIONS.map((option) => option.value),
);
const RETIRED_DESIGN_FONT_FAMILIES = new Map([
  [
    "'Departure Mono', ui-monospace, SFMono-Regular, monospace",
    DEFAULT_DESIGN_FONT_FAMILY,
  ],
  [
    "'CozetteVector', ui-monospace, SFMono-Regular, monospace",
    SYSTEM_SANS_FAMILY,
  ],
  ["CozetteVector", SYSTEM_SANS_FAMILY],
  ["'CozetteVector'", SYSTEM_SANS_FAMILY],
  ["Inter, ui-sans-serif, system-ui, sans-serif", SYSTEM_SANS_FAMILY],
  ["'Martina Plantijn', Georgia, serif", SYSTEM_SERIF_FAMILY],
  [
    "'Kirsch Mono', ui-monospace, SFMono-Regular, monospace",
    DEFAULT_DESIGN_FONT_FAMILY,
  ],
  [
    "'Berkeley Mono', ui-monospace, SFMono-Regular, monospace",
    DEFAULT_DESIGN_FONT_FAMILY,
  ],
]);
export function normalizeDesignFontFamily(
  value,
  fallback = DEFAULT_DESIGN_FONT_FAMILY,
) {
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (DESIGN_FONT_FAMILY_VALUES.has(trimmed)) return trimmed;
    const replacement = RETIRED_DESIGN_FONT_FAMILIES.get(trimmed);
    if (replacement) return replacement;
  }
  return DESIGN_FONT_FAMILY_VALUES.has(fallback)
    ? fallback
    : DEFAULT_DESIGN_FONT_FAMILY;
}
export const SVG_EDITOR_STORAGE_KEY = "svg-editor-v1";
export const DEFAULT_SVG_SOURCE = `<svg viewBox="0 0 1440 960" font-family="${DEFAULT_DESIGN_FONT_FAMILY}" xmlns="http://www.w3.org/2000/svg">
  <path id="rectangle-1" fill="#f4efe6" stroke="none" stroke-width="0" d="M 496 320 L 944 320 L 944 640 L 496 640 Z" />
</svg>`;
