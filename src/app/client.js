async function readApiResponse(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(payload?.error || fallback);
  }
  return payload;
}

export async function loadDesignDocument(slug = "default") {
  const params = new URLSearchParams({ slug });
  const response = await fetch(`/api/document?${params}`, {
    credentials: "include",
  });
  return readApiResponse(response, "Failed to load design document.");
}

export async function loadDesignDocuments() {
  const response = await fetch("/api/documents", {
    credentials: "include",
  });
  return readApiResponse(response, "Failed to load design documents.");
}

export async function saveDesignDocument({
  slug = "default",
  name,
  svg,
  source = "autosave",
  metadata,
}) {
  const response = await fetch("/api/document", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ slug, name, svg, source, metadata }),
  });
  return readApiResponse(response, "Failed to save design document.");
}

export async function deleteDesignDocument(slug = "default") {
  const params = new URLSearchParams({ slug });
  const response = await fetch(`/api/document?${params}`, {
    method: "DELETE",
    credentials: "include",
  });
  return readApiResponse(response, "Failed to delete design document.");
}

export async function loadDesignRevisions(slug = "default", limit = 30) {
  const params = new URLSearchParams({ slug, limit: String(limit) });
  const response = await fetch(`/api/revisions?${params}`, {
    credentials: "include",
  });
  return readApiResponse(response, "Failed to load design history.");
}

export async function restoreDesignRevision({ slug = "default", revisionId }) {
  const response = await fetch("/api/revisions/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ slug, revisionId }),
  });
  return readApiResponse(response, "Failed to restore design revision.");
}
