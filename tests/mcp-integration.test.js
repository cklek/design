import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import config from "../src/mcp/tools.js";
import { compileTools } from "../src/mcp/runtime.js";
import { connect, fixture, startApp } from "./mcp-helpers.js";

test("every Design MCP tool saves, revises, restores and deletes persisted SVG", async () => {
  const files = await fixture();
  let app;
  try {
    app = await startApp(files.dir);
    const mcp = connect(app.baseUrl);
    await mcp.initialize();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M 0 0 L 10 10" fill="none" stroke="black"/></svg>';
    const saved = await mcp.tool("design_document_save", {
      slug: "mcp-canvas",
      name: "First",
      svg,
      source: "automation",
    });
    expect(saved.document.slug).toBe("mcp-canvas");
    expect(
      (await mcp.tool("design_documents_list")).documents.some(
        (d) => d.slug === "mcp-canvas",
      ),
    ).toBe(true);
    expect(
      (await mcp.tool("design_document_get", { slug: "mcp-canvas" })).document
        .name,
    ).toBe("First");
    expect((await mcp.tool("design_document_get")).document.slug).toBe(
      "default",
    );
    const history = await mcp.tool("design_revisions_list", {
      slug: "mcp-canvas",
      limit: 10,
    });
    const revision = history.revisions.find((r) => r.name === "First");
    expect(revision).toBeTruthy();
    await mcp.tool("design_document_save", {
      slug: "mcp-canvas",
      name: "Second",
      svg,
      source: "edit",
    });
    const bad = await mcp.tool(
      "design_document_save",
      { slug: "mcp-canvas", svg: "<svg><script/></svg>" },
      { expectError: true },
    );
    expect(bad.status).toBe(400);
    await mcp.tool("design_revisions_restore", {
      slug: "mcp-canvas",
      revisionId: revision.id,
    });
    expect(
      (await mcp.tool("design_document_get", { slug: "mcp-canvas" })).document
        .name,
    ).toBe("First");
    expect(
      JSON.parse(
        await readFile(join(files.dir, "data/mcp-canvas.json"), "utf8"),
      ).name,
    ).toBe("First");
    expect(
      (await mcp.tool("design_document_delete", { slug: "mcp-canvas" }))
        .document.slug,
    ).toBe("mcp-canvas");
    expect(
      (await mcp.tool("design_documents_list")).documents.some(
        (d) => d.slug === "mcp-canvas",
      ),
    ).toBe(false);
    expect([...mcp.seen].sort()).toEqual(
      compileTools(config)
        .map((t) => t.name)
        .sort(),
    );
  } finally {
    await app?.stop();
    await files.cleanup();
  }
}, 30000);
