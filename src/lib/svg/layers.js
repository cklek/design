export function makeGroupId() {
  return `group-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function swap(paths, a, b) {
  const current = paths[a];
  paths[a] = paths[b];
  paths[b] = current;
}

export function reorderPaths(document, pathIds, direction) {
  const selected = new Set(pathIds);
  let paths = [...document.paths];
  if (direction === "front") {
    paths = [
      ...paths.filter((path) => !selected.has(path.id)),
      ...paths.filter((path) => selected.has(path.id)),
    ];
  } else if (direction === "back") {
    paths = [
      ...paths.filter((path) => selected.has(path.id)),
      ...paths.filter((path) => !selected.has(path.id)),
    ];
  } else if (direction === "forward") {
    for (let index = paths.length - 2; index >= 0; index--) {
      if (selected.has(paths[index].id) && !selected.has(paths[index + 1].id))
        swap(paths, index, index + 1);
    }
  } else {
    for (let index = 1; index < paths.length; index++) {
      if (selected.has(paths[index].id) && !selected.has(paths[index - 1].id))
        swap(paths, index, index - 1);
    }
  }
  return { ...document, paths };
}

export function groupPaths(document, pathIds) {
  const selected = new Set(pathIds);
  const groupId = makeGroupId();
  const groupCount = new Set(
    document.paths.map((path) => path.groupId).filter(Boolean),
  ).size;
  const groupName = `Group ${groupCount + 1}`;
  return {
    ...document,
    paths: document.paths.map((path) =>
      selected.has(path.id) ? { ...path, groupId, groupName } : path,
    ),
  };
}

export function ungroupPaths(document, pathIds) {
  const wanted = new Set(pathIds);
  const groupIds = new Set(
    document.paths
      .filter((path) => wanted.has(path.id) && path.groupId)
      .map((path) => path.groupId),
  );
  if (groupIds.size === 0) return { document, count: 0 };
  return {
    count: groupIds.size,
    document: {
      ...document,
      paths: document.paths.map((path) => {
        if (!path.groupId || !groupIds.has(path.groupId)) return path;
        const { groupId: _id, groupName: _name, ...rest } = path;
        return rest;
      }),
    },
  };
}

export function renameGroupIn(document, groupId, name) {
  const groupName = name.replace(/\s+/g, " ").trim() || "Group";
  return {
    ...document,
    paths: document.paths.map((path) =>
      path.groupId === groupId ? { ...path, groupName } : path,
    ),
  };
}

export function replacePaths(document, pathIds, replacements) {
  const replaced = new Set(pathIds);
  const at = Math.max(
    0,
    document.paths.findIndex((path) => replaced.has(path.id)),
  );
  const remaining = document.paths.filter((path) => !replaced.has(path.id));
  return {
    ...document,
    paths: [...remaining.slice(0, at), ...replacements, ...remaining.slice(at)],
  };
}
