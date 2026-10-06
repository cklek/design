const headless = process.env.HEADLESS === "1";
const index = headless ? null : (await import("./index.html")).default;
import mcpConfig from "./src/mcp/tools.js";
import { createMcpHttpHandler, loopbackUrl } from "./src/mcp/runtime.js";
import {
  createStore,
  deleteDocument,
  listDocuments,
  listRevisions,
  readDocument,
  restoreRevision,
  saveDocument,
} from "./src/server/store.js";

const store = createStore(process.env.DESIGN_DATA_DIR || "./data");

function json(body, status = 200) {
  return Response.json(body, { status });
}

async function jsonBody(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function wrap(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Design request failed.";
      return json({ error: message }, error?.status || 500);
    }
  };
}

/* MCP over streamable HTTP: the same API, as tools. The handler calls back
 * into this server over loopback, so it needs the address after the fact. */
const mcp = createMcpHttpHandler(mcpConfig, {
  baseUrl: () => loopbackUrl(server),
});

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  hostname: process.env.HOST || "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  routes: {
    ...(headless ? {} : { "/": index }),
    "/api/document": {
      GET: wrap(async (req) => {
        const slug = new URL(req.url).searchParams.get("slug");
        return json({ document: await readDocument(store, slug) });
      }),
      PUT: wrap(async (req) => {
        const body = await jsonBody(req);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = await saveDocument(store, body);
        if (result.error) return json({ error: result.error }, 400);
        return json({ document: result.document });
      }),
      DELETE: wrap(async (req) => {
        const slug = new URL(req.url).searchParams.get("slug");
        const document = await deleteDocument(store, slug);
        if (!document) return json({ error: "Document not found" }, 404);
        return json({ document });
      }),
    },
    "/api/documents": {
      GET: wrap(async () => json({ documents: await listDocuments(store) })),
    },
    "/api/revisions": {
      GET: wrap(async (req) => {
        const url = new URL(req.url);
        return json({
          revisions: await listRevisions(
            store,
            url.searchParams.get("slug"),
            url.searchParams.get("limit"),
          ),
        });
      }),
    },
    "/api/revisions/restore": {
      POST: wrap(async (req) => {
        const body = await jsonBody(req);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = await restoreRevision(store, body.slug, body.revisionId);
        if (result.error) return json({ error: result.error }, result.status);
        return json(result);
      }),
    },
    "/mcp": mcp,
    "/api/*": () => json({ error: "Not found" }, 404),
  },
  fetch: () => headless ? json({ error: "Not found" }, 404) : new Response(index),
});

console.log(`design  http://localhost:${server.port}  (data in ${store.dir})`);
