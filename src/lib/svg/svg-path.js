import { distance } from "./geometry";

const TOKEN_PATTERN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function tokenizePathData(d) {
  return Array.from(d.matchAll(TOKEN_PATTERN)).map((match) => {
    const value = match[0];
    return /[a-zA-Z]/.test(value)
      ? { type: "command", value }
      : { type: "number", value: Number(value) };
  });
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(3)).toString();
}

function isCommand(token) {
  return token?.type === "command";
}

function vectorAngle(u, v) {
  const dot = u.x * v.x + u.y * v.y;
  const length = Math.sqrt((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
  const sign = u.x * v.y - u.y * v.x < 0 ? -1 : 1;
  const ratio = length === 0 ? 0 : Math.min(1, Math.max(-1, dot / length));
  return sign * Math.acos(ratio);
}

function arcToCubicCommands({
  from,
  to,
  rx,
  ry,
  xAxisRotation,
  largeArc,
  sweep,
}) {
  if (distance(from, to) === 0) return [];
  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);
  if (radiusX === 0 || radiusY === 0) return [];
  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1Prime = cosPhi * dx + sinPhi * dy;
  const y1Prime = -sinPhi * dx + cosPhi * dy;
  const radiusScale =
    (x1Prime * x1Prime) / (radiusX * radiusX) +
    (y1Prime * y1Prime) / (radiusY * radiusY);
  if (radiusScale > 1) {
    const scale = Math.sqrt(radiusScale);
    radiusX *= scale;
    radiusY *= scale;
  }
  const rxSq = radiusX * radiusX;
  const rySq = radiusY * radiusY;
  const x1PrimeSq = x1Prime * x1Prime;
  const y1PrimeSq = y1Prime * y1Prime;
  const numerator = rxSq * rySq - rxSq * y1PrimeSq - rySq * x1PrimeSq;
  const denominator = rxSq * y1PrimeSq + rySq * x1PrimeSq;
  const sign = largeArc === sweep ? -1 : 1;
  const coefficient =
    denominator === 0
      ? 0
      : sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (coefficient * radiusX * y1Prime) / radiusY;
  const cyPrime = (-coefficient * radiusY * x1Prime) / radiusX;
  const center = {
    x: cosPhi * cxPrime - sinPhi * cyPrime + (from.x + to.x) / 2,
    y: sinPhi * cxPrime + cosPhi * cyPrime + (from.y + to.y) / 2,
  };
  const startVector = {
    x: (x1Prime - cxPrime) / radiusX,
    y: (y1Prime - cyPrime) / radiusY,
  };
  const endVector = {
    x: (-x1Prime - cxPrime) / radiusX,
    y: (-y1Prime - cyPrime) / radiusY,
  };
  const startAngle = vectorAngle({ x: 1, y: 0 }, startVector);
  let sweepAngle = vectorAngle(startVector, endVector);
  if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2;
  if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2;
  const segmentCount = Math.max(
    1,
    Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)),
  );
  const segmentAngle = sweepAngle / segmentCount;
  const commands = [];
  function mapPoint(point) {
    return {
      x: center.x + radiusX * (cosPhi * point.x - sinPhi * point.y),
      y: center.y + radiusY * (sinPhi * point.x + cosPhi * point.y),
    };
  }
  for (let segment = 0; segment < segmentCount; segment++) {
    const angle1 = startAngle + segment * segmentAngle;
    const angle2 = angle1 + segmentAngle;
    const alpha = (4 / 3) * Math.tan((angle2 - angle1) / 4);
    const control1 = mapPoint({
      x: Math.cos(angle1) - alpha * Math.sin(angle1),
      y: Math.sin(angle1) + alpha * Math.cos(angle1),
    });
    const control2 = mapPoint({
      x: Math.cos(angle2) + alpha * Math.sin(angle2),
      y: Math.sin(angle2) - alpha * Math.cos(angle2),
    });
    const point =
      segment === segmentCount - 1
        ? to
        : mapPoint({ x: Math.cos(angle2), y: Math.sin(angle2) });
    commands.push({
      type: "C",
      x1: control1.x,
      y1: control1.y,
      x2: control2.x,
      y2: control2.y,
      x: point.x,
      y: point.y,
    });
  }
  return commands;
}

export function serializePathData(commands) {
  return commands
    .map((command) => {
      if (command.type === "Z") return "Z";
      if (command.type === "M" || command.type === "L") {
        return `${command.type} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
      }
      if (command.type === "Q") {
        return `Q ${formatNumber(command.x1)} ${formatNumber(command.y1)} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
      }
      return `C ${formatNumber(command.x1)} ${formatNumber(command.y1)} ${formatNumber(command.x2)} ${formatNumber(command.y2)} ${formatNumber(command.x)} ${formatNumber(command.y)}`;
    })
    .join(" ");
}

export function parsePathData(d) {
  const tokens = tokenizePathData(d);
  const commands = [];
  let index = 0;
  let activeCommand = "";
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let previousCubicControl = null;
  let previousQuadraticControl = null;
  const readNumber = () => {
    const token = tokens[index];
    if (token?.type !== "number") {
      throw new Error(`Invalid SVG path. Expected number near token ${index}.`);
    }
    index += 1;
    return token.value;
  };
  const readPoint = (relative) => {
    const x = readNumber();
    const y = readNumber();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };
  while (index < tokens.length) {
    const token = tokens[index];
    if (token?.type === "command") {
      activeCommand = token.value;
      index += 1;
    }
    if (!activeCommand) {
      throw new Error("Invalid SVG path. Missing initial command.");
    }
    const relative = activeCommand === activeCommand.toLowerCase();
    const command = activeCommand.toUpperCase();
    if (command === "M") {
      const point = readPoint(relative);
      commands.push({ type: "M", ...point });
      current = point;
      start = point;
      previousCubicControl = null;
      previousQuadraticControl = null;
      activeCommand = relative ? "l" : "L";
      continue;
    }
    if (command === "L") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const point = readPoint(relative);
        commands.push({ type: "L", ...point });
        current = point;
        previousCubicControl = null;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "H") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const x = readNumber();
        current = { x: relative ? current.x + x : x, y: current.y };
        commands.push({ type: "L", ...current });
        previousCubicControl = null;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "V") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const y = readNumber();
        current = { x: current.x, y: relative ? current.y + y : y };
        commands.push({ type: "L", ...current });
        previousCubicControl = null;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "C") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const c1 = readPoint(relative);
        const c2 = readPoint(relative);
        const point = readPoint(relative);
        commands.push({
          type: "C",
          x1: c1.x,
          y1: c1.y,
          x2: c2.x,
          y2: c2.y,
          x: point.x,
          y: point.y,
        });
        current = point;
        previousCubicControl = c2;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "S") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const reflected = previousCubicControl
          ? {
              x: current.x * 2 - previousCubicControl.x,
              y: current.y * 2 - previousCubicControl.y,
            }
          : current;
        const c2 = readPoint(relative);
        const point = readPoint(relative);
        commands.push({
          type: "C",
          x1: reflected.x,
          y1: reflected.y,
          x2: c2.x,
          y2: c2.y,
          x: point.x,
          y: point.y,
        });
        current = point;
        previousCubicControl = c2;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "Q") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const c1 = readPoint(relative);
        const point = readPoint(relative);
        commands.push({
          type: "Q",
          x1: c1.x,
          y1: c1.y,
          x: point.x,
          y: point.y,
        });
        current = point;
        previousCubicControl = null;
        previousQuadraticControl = c1;
      }
      continue;
    }
    if (command === "T") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const c1 = previousQuadraticControl
          ? {
              x: current.x * 2 - previousQuadraticControl.x,
              y: current.y * 2 - previousQuadraticControl.y,
            }
          : current;
        const point = readPoint(relative);
        commands.push({
          type: "Q",
          x1: c1.x,
          y1: c1.y,
          x: point.x,
          y: point.y,
        });
        current = point;
        previousCubicControl = null;
        previousQuadraticControl = c1;
      }
      continue;
    }
    if (command === "A") {
      while (index < tokens.length && !isCommand(tokens[index])) {
        const rx = readNumber();
        const ry = readNumber();
        const xAxisRotation = readNumber();
        const largeArc = readNumber() !== 0;
        const sweep = readNumber() !== 0;
        const point = readPoint(relative);
        const arcCommands = arcToCubicCommands({
          from: current,
          to: point,
          rx,
          ry,
          xAxisRotation,
          largeArc,
          sweep,
        });
        if (arcCommands.length > 0) commands.push(...arcCommands);
        else commands.push({ type: "L", ...point });
        current = point;
        previousCubicControl = null;
        previousQuadraticControl = null;
      }
      continue;
    }
    if (command === "Z") {
      commands.push({ type: "Z" });
      current = start;
      previousCubicControl = null;
      previousQuadraticControl = null;
      continue;
    }
    throw new Error(`Unsupported SVG path command: ${activeCommand}`);
  }
  return commands;
}

export function commandPoint(command) {
  if (command.type === "Z") return null;
  return { x: command.x, y: command.y };
}

export function findPreviousCommandPoint(commands, commandIndex) {
  for (let index = commandIndex - 1; index >= 0; index--) {
    const point = commandPoint(commands[index]);
    if (point) return point;
  }
  return null;
}

export function findLastCommandPoint(commands) {
  return findPreviousCommandPoint(commands, commands.length);
}

export function firstCommandPoint(commands) {
  for (const command of commands) {
    const point = commandPoint(command);
    if (point) return point;
  }
  return null;
}

export function isClosedPath(commands) {
  return commands.some((command) => command.type === "Z");
}

export function closePathCommands(commands) {
  if (commands.length === 0 || isClosedPath(commands)) return commands;
  return [...commands, { type: "Z" }];
}

export function deletePathCommand(commands, commandIndex) {
  if (commandIndex < 0 || commandIndex >= commands.length) return commands;
  const nextCommands = commands.filter((_, index) => index !== commandIndex);
  const firstPoint = commandPoint(nextCommands[0]);
  if (firstPoint && nextCommands[0]?.type !== "M") {
    nextCommands[0] = { type: "M", x: firstPoint.x, y: firstPoint.y };
  }
  return nextCommands;
}

export function cornerAnchor(commands, commandIndex) {
  return commands.map((command, index) => {
    if (index === commandIndex && command.type === "C") {
      return { type: "L", x: command.x, y: command.y };
    }
    if (index === commandIndex && command.type === "Q") {
      return { type: "L", x: command.x, y: command.y };
    }
    if (index === commandIndex + 1 && command.type === "C") {
      return { type: "L", x: command.x, y: command.y };
    }
    if (index === commandIndex + 1 && command.type === "Q") {
      return { type: "L", x: command.x, y: command.y };
    }
    return command;
  });
}

export function smoothAnchor(commands, commandIndex) {
  const anchor = commandPoint(commands[commandIndex]);
  const previous = findPreviousCommandPoint(commands, commandIndex);
  const next = commandPoint(commands[commandIndex + 1]);
  if (!anchor || (!previous && !next)) return commands;
  return commands.map((command, index) => {
    if (index === commandIndex && previous && command.type === "L") {
      return {
        type: "C",
        x1: previous.x + (anchor.x - previous.x) * 0.35,
        y1: previous.y + (anchor.y - previous.y) * 0.35,
        x2: anchor.x - (anchor.x - previous.x) * 0.35,
        y2: anchor.y - (anchor.y - previous.y) * 0.35,
        x: anchor.x,
        y: anchor.y,
      };
    }
    if (index === commandIndex + 1 && next && command.type === "L") {
      return {
        type: "C",
        x1: anchor.x + (next.x - anchor.x) * 0.35,
        y1: anchor.y + (next.y - anchor.y) * 0.35,
        x2: next.x - (next.x - anchor.x) * 0.35,
        y2: next.y - (next.y - anchor.y) * 0.35,
        x: next.x,
        y: next.y,
      };
    }
    if (index === commandIndex + 1 && next && command.type === "Q") {
      return {
        type: "C",
        x1: anchor.x + (next.x - anchor.x) * 0.35,
        y1: anchor.y + (next.y - anchor.y) * 0.35,
        x2: command.x1,
        y2: command.y1,
        x: next.x,
        y: next.y,
      };
    }
    return command;
  });
}

export function buildPenSegmentCommand({
  from,
  to,
  handle,
  existing,
  minHandleDistance = 3,
}) {
  if (!handle || distance(to, handle) < minHandleDistance) {
    return { type: "L", x: to.x, y: to.y };
  }
  const incoming = {
    x: to.x * 2 - handle.x,
    y: to.y * 2 - handle.y,
  };
  const outgoing =
    existing?.type === "C"
      ? { x: existing.x1, y: existing.y1 }
      : {
          x: from.x + (to.x - from.x) * 0.35,
          y: from.y + (to.y - from.y) * 0.35,
        };
  return {
    type: "C",
    x1: outgoing.x,
    y1: outgoing.y,
    x2: incoming.x,
    y2: incoming.y,
    x: to.x,
    y: to.y,
  };
}
export function shapePenSegment(
  commands,
  commandIndex,
  anchorPoint,
  handlePoint,
) {
  const previousPoint = findPreviousCommandPoint(commands, commandIndex);
  const command = commands[commandIndex];
  if (
    !previousPoint ||
    !command ||
    (command.type !== "L" && command.type !== "C")
  ) {
    return commands;
  }
  const nextCommand = buildPenSegmentCommand({
    from: previousPoint,
    to: anchorPoint,
    handle: handlePoint,
    existing: command,
  });
  return commands.map((item, index) =>
    index === commandIndex ? nextCommand : item,
  );
}

export function getPathAnchors(commands) {
  const anchors = [];
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    const point = commandPoint(command);
    if (!point) continue;
    const next = commands[index + 1];
    anchors.push({
      commandIndex: index,
      point,
      inHandle:
        command.type === "C"
          ? { x: command.x2, y: command.y2 }
          : command.type === "Q"
            ? { x: command.x1, y: command.y1 }
            : undefined,
      outHandle:
        next?.type === "C"
          ? { x: next.x1, y: next.y1 }
          : next?.type === "Q"
            ? { x: next.x1, y: next.y1 }
            : undefined,
    });
  }
  return anchors;
}

export function updatePathAnchor(commands, commandIndex, nextPoint) {
  return commands.map((command, index) => {
    if (index === commandIndex) {
      if (command.type === "M" || command.type === "L") {
        return { ...command, ...nextPoint };
      }
      if (command.type === "C") {
        const dx = nextPoint.x - command.x;
        const dy = nextPoint.y - command.y;
        return {
          ...command,
          x: nextPoint.x,
          y: nextPoint.y,
          x2: command.x2 + dx,
          y2: command.y2 + dy,
        };
      }
      if (command.type === "Q") {
        const dx = nextPoint.x - command.x;
        const dy = nextPoint.y - command.y;
        return {
          ...command,
          x: nextPoint.x,
          y: nextPoint.y,
          x1: command.x1 + dx,
          y1: command.y1 + dy,
        };
      }
    }
    if (index === commandIndex + 1) {
      const previous = commands[commandIndex];
      const previousPoint = previous ? commandPoint(previous) : null;
      if (previousPoint && command.type === "C") {
        const dx = nextPoint.x - previousPoint.x;
        const dy = nextPoint.y - previousPoint.y;
        return { ...command, x1: command.x1 + dx, y1: command.y1 + dy };
      }
      if (previousPoint && command.type === "Q") {
        const dx = nextPoint.x - previousPoint.x;
        const dy = nextPoint.y - previousPoint.y;
        return { ...command, x1: command.x1 + dx, y1: command.y1 + dy };
      }
    }
    return command;
  });
}

export function updatePathHandle(commands, commandIndex, handle, nextPoint) {
  return commands.map((command, index) => {
    if (handle === "in" && index === commandIndex) {
      if (command.type === "C") {
        return { ...command, x2: nextPoint.x, y2: nextPoint.y };
      }
      if (command.type === "Q") {
        return { ...command, x1: nextPoint.x, y1: nextPoint.y };
      }
    }
    if (handle === "out" && index === commandIndex + 1) {
      if (command.type === "C") {
        return { ...command, x1: nextPoint.x, y1: nextPoint.y };
      }
      if (command.type === "Q") {
        return { ...command, x1: nextPoint.x, y1: nextPoint.y };
      }
    }
    return command;
  });
}
