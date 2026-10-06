export default {
  app: "design",
  commands: [
    {
      name: "documents list",
      method: "GET",
      path: "/api/documents",
      description: "List saved canvases.",
    },
    {
      name: "document get",
      method: "GET",
      path: "/api/document",
      description: "Read a canvas (default slug: default).",
      query: ["slug"],
    },
    {
      name: "document save",
      method: "PUT",
      path: "/api/document",
      description: "Save {slug?, name?, svg, source?, metadata?}.",
      body: "json",
    },
    {
      name: "document delete",
      method: "DELETE",
      path: "/api/document",
      description: "Delete a canvas.",
      query: ["slug"],
    },
    {
      name: "revisions list",
      method: "GET",
      path: "/api/revisions",
      description: "List canvas history.",
      query: ["slug", "limit"],
    },
    {
      name: "revisions restore",
      method: "POST",
      path: "/api/revisions/restore",
      description: "Restore {slug, revisionId}.",
      body: "json",
    },
  ],
};
