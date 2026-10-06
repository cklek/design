const TOOL_KEYS = {
  v: "select",
  p: "pen",
  h: "hand",
  r: "rectangle",
  o: "ellipse",
  l: "line",
};

function arrowDelta(key, event) {
  const amount = event.altKey ? 0.1 : event.shiftKey ? 10 : 1;
  const delta =
    key === "arrowleft"
      ? { x: -amount, y: 0 }
      : key === "arrowright"
        ? { x: amount, y: 0 }
        : key === "arrowup"
          ? { x: 0, y: -amount }
          : { x: 0, y: amount };
  return { delta, amount };
}

export function resolveEditorShortcut(event) {
  const key = event.key.toLowerCase();
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier) {
    switch (key) {
      case "z":
        return [event.shiftKey ? "redo" : "undo"];
      case "y":
        return ["redo"];
      case "c":
        return ["copy"];
      case "x":
        return ["cut"];
      case "v":
        return ["paste"];
      case "d":
        return ["duplicate"];
      case "a":
        return ["selectAll"];
      case "[":
        return ["reorder", event.shiftKey ? "back" : "backward"];
      case "]":
        return ["reorder", event.shiftKey ? "front" : "forward"];
      case "g":
        return [event.shiftKey ? "ungroup" : "group"];
      case "0":
        return ["fit"];
      case "=":
      case "+":
        return ["zoomIn"];
      case "-":
        return ["zoomOut"];
      case "1":
        return ["actualSize"];
      default:
        break;
    }
  }
  switch (key) {
    case "delete":
    case "backspace":
      return ["delete"];
    case "escape":
      return ["escape"];
    case "f":
      return ["fit"];
    case "enter":
      return ["closePath"];
    case "g":
      return ["toggleSnap"];
    default:
      break;
  }
  if (key.startsWith("arrow")) return ["arrow", arrowDelta(key, event)];
  if (modifier) return null;
  if (TOOL_KEYS[key]) return ["tool", TOOL_KEYS[key]];
  if (key === "=" || key === "+") return ["zoomIn"];
  if (key === "-") return ["zoomOut"];
  if (key === "1") return ["actualSize"];
  return null;
}

export function resolveCanvasShortcut(event) {
  if (!(event.metaKey || event.ctrlKey)) return null;
  switch (event.key.toLowerCase()) {
    case "a":
      return ["selectAll"];
    case "c":
      return ["copy"];
    case "x":
      return ["cut"];
    case "v":
      return ["paste"];
    default:
      return null;
  }
}
