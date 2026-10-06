import commands from "../cli/commands.js";

const slug = {
  type: "string",
  description:
    'Canvas slug: lower-case letters, digits, . _ and -. Defaults to "default".',
};

export default {
  ...commands,
  title: "Design",
  instructions: `
Tools for the design app: a vector editor whose documents are SVG path
documents, one canvas per slug, saved as JSON and SVG files with a revision
history. Everything in a canvas is a <path>; the svg you save must be a valid,
script-free SVG under 1 MB and comes back normalised. Reading a slug that does
not exist creates a blank canvas for it. Revisions are kept per canvas (100 at
most) and any of them can be restored.`,
  tools: {
    "documents list": {
      title: "List canvases",
      description:
        "Every saved canvas with its name, SVG, metadata and timestamps.",
      inputSchema: { type: "object", properties: {} },
    },
    "document get": {
      title: "Get canvas",
      description:
        "One canvas by slug. An unknown slug gets a new blank canvas.",
      inputSchema: { type: "object", properties: { slug } },
    },
    "document save": {
      title: "Save canvas",
      description:
        "Save a canvas's SVG (required), name and metadata, recording a revision when something changed. source labels the revision.",
      inputSchema: {
        type: "object",
        properties: {
          slug,
          name: {
            type: "string",
            description: "Canvas name, up to 120 characters.",
          },
          svg: {
            type: "string",
            description: "The whole SVG document, paths only, under 1 MB.",
          },
          source: {
            type: "string",
            enum: [
              "automation",
              "autosave",
              "create",
              "delete",
              "duplicate",
              "edit",
              "import",
              "reset",
              "restore",
              "undo",
              "redo",
              "boolean",
            ],
            description:
              'What made this revision. Defaults to "autosave"; use "automation" for tool-driven edits.',
          },
          metadata: {
            type: "object",
            description:
              "Canvas metadata (size, grid, view). Fields left out keep their current values.",
          },
        },
        required: ["svg"],
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    "document delete": {
      title: "Delete canvas",
      description:
        "Delete a canvas and its revision history. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { slug: { ...slug, description: "Canvas slug." } },
        required: ["slug"],
      },
    },
    "revisions list": {
      title: "List revisions",
      description:
        "A canvas's revision history, newest first, each with its SVG.",
      inputSchema: {
        type: "object",
        properties: {
          slug,
          limit: { type: "integer", description: "1 to 100. Defaults to 30." },
        },
      },
    },
    "revisions restore": {
      title: "Restore revision",
      description:
        "Make an earlier revision the current canvas (recorded as a new revision).",
      inputSchema: {
        type: "object",
        properties: {
          slug: { ...slug, description: "Canvas slug." },
          revisionId: {
            type: "integer",
            description: "Revision id from design_revisions_list.",
          },
        },
        required: ["slug", "revisionId"],
      },
      annotations: { destructiveHint: true },
    },
  },
};
