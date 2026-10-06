import { serializeSvgDocument } from "./svg-document";

const DEFAULT_HISTORY_LIMIT = 80;

function documentsMatch(a, b) {
  return serializeSvgDocument(a) === serializeSvgDocument(b);
}

export function emptySvgEditorHistory() {
  return { past: [], future: [] };
}

export function commitSvgEditorHistory(
  history,
  previous,
  next,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  if (documentsMatch(previous, next)) return history;
  return {
    past: [...history.past, previous].slice(-limit),
    future: [],
  };
}

export function undoSvgEditorHistory(history, current) {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    document: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
  };
}

export function redoSvgEditorHistory(history, current) {
  const next = history.future[0];
  if (!next) return null;
  return {
    document: next,
    history: {
      past: [...history.past, current],
      future: history.future.slice(1),
    },
  };
}
