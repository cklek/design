import { munsellColors } from "./munsell-colors.js";

let cachedHues = null;
let cachedByHex = null;

export function getMunsellHues() {
  if (cachedHues) return cachedHues;
  const hues = [];
  for (let cursor = 0; cursor < munsellColors.length; cursor += 4) {
    const hue = munsellColors[cursor];
    const family = munsellColors[cursor + 1];
    const position = munsellColors[cursor + 2];
    const chromaRows = munsellColors[cursor + 3];
    if (
      typeof hue !== "string" ||
      typeof family !== "string" ||
      typeof position !== "number" ||
      !Array.isArray(chromaRows)
    ) {
      continue;
    }
    hues.push({
      hue,
      family,
      position,
      chromaRows: chromaRows,
    });
  }
  cachedHues = hues;
  return hues;
}

export function getMunsellSwatch(hex) {
  if (!hex) return null;
  if (!cachedByHex) {
    cachedByHex = new Map();
    for (const hue of getMunsellHues()) {
      for (const row of hue.chromaRows) {
        const chroma = row[0];
        for (let valueIndex = 1; valueIndex < row.length; valueIndex += 1) {
          const candidate = row[valueIndex];
          if (typeof candidate !== "string" || !candidate) continue;
          cachedByHex.set(candidate.toLowerCase(), {
            chroma: typeof chroma === "number" ? chroma : 0,
            family: hue.family,
            hex: candidate,
            hue: hue.hue,
            value: valueIndex,
          });
        }
      }
    }
  }
  return cachedByHex.get(hex.toLowerCase()) || null;
}
