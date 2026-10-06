export function uniquePathIds(pathIds) {
  return pathIds.filter((id, index, all) => all.indexOf(id) === index);
}

export function findPath(document, pathId) {
  return document.paths.find((path) => path.id === pathId) || null;
}

export function pathsWithIds(document, pathIds) {
  const wanted = new Set(pathIds);
  return document.paths.filter((path) => wanted.has(path.id));
}

export function firstPathIds(document) {
  return document.paths[0]?.id ? [document.paths[0].id] : [];
}

export function pruneSelection(document, pathIds) {
  const valid = new Set(document.paths.map((path) => path.id));
  const next = pathIds.filter((id) => valid.has(id));
  if (next.length > 0 || document.paths.length === 0) return next;
  return firstPathIds(document);
}

export function expandSelectionToGroups(document, pathIds) {
  const groupIds = new Set();
  for (const pathId of pathIds) {
    const path = findPath(document, pathId);
    if (path?.groupId) groupIds.add(path.groupId);
  }
  if (groupIds.size === 0) return uniquePathIds(pathIds);
  const result = [];
  const seen = new Set();
  for (const path of document.paths) {
    const include =
      pathIds.includes(path.id) ||
      (path.groupId !== undefined && groupIds.has(path.groupId));
    if (include && !seen.has(path.id)) {
      seen.add(path.id);
      result.push(path.id);
    }
  }
  return result;
}

export function groupPathIds(document, groupId) {
  return document.paths
    .filter((path) => path.groupId === groupId)
    .map((path) => path.id);
}

export function describeGroup(document, groupId) {
  if (!groupId) return null;
  const paths = document.paths.filter((path) => path.groupId === groupId);
  if (paths.length === 0) return null;
  return {
    id: groupId,
    name: paths.find((path) => path.groupName)?.groupName || "Group",
    count: paths.length,
  };
}

export function selectedGroupOf(document, pathIds) {
  if (pathIds.length === 0) return null;
  const paths = pathsWithIds(document, pathIds);
  const groupId = paths[0]?.groupId;
  if (!groupId || !paths.every((path) => path.groupId === groupId)) return null;
  const group = describeGroup(document, groupId);
  return group && group.count === paths.length ? group : null;
}

export function selectionHasGroup(document, pathIds) {
  return pathIds.some((pathId) => Boolean(findPath(document, pathId)?.groupId));
}

export function sharedGroupId(document, pathIds) {
  const first = pathIds
    .map((pathId) => findPath(document, pathId))
    .find((path) => Boolean(path?.groupId));
  if (!first) return null;
  const same = pathIds.every(
    (pathId) => findPath(document, pathId)?.groupId === first.groupId,
  );
  return same ? first.groupId : null;
}

export function nextSelectionForClick(
  document,
  current,
  pathId,
  { extend = false, scope = "auto", editingGroupId = null } = {},
) {
  const path = findPath(document, pathId);
  if (scope === "path") {
    if (!extend) return [pathId];
    return current.includes(pathId)
      ? current.filter((id) => id !== pathId)
      : uniquePathIds([...current, pathId]);
  }
  if (extend) {
    return current.includes(pathId)
      ? current.filter((id) => id !== pathId)
      : expandSelectionToGroups(document, [...current, pathId]);
  }
  if (editingGroupId && path?.groupId === editingGroupId) return [pathId];
  if (scope !== "group" && !path?.groupId) return [pathId];
  return expandSelectionToGroups(document, [pathId]);
}

export function toggleGroupInSelection(document, current, groupId) {
  const ids = groupPathIds(document, groupId);
  const currentSet = new Set(current);
  if (ids.every((id) => currentSet.has(id)))
    return current.filter((id) => !ids.includes(id));
  return uniquePathIds([...current, ...ids]);
}
