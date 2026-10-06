import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import config from "../src/cli/commands.js";
import { fixture, startApp, runner, jsonArgs } from "./cli-helpers.js";

test("all Design CLI commands save, revise, restore and delete persisted SVG", async () => {
  const files = await fixture();
  let app;
  try {
    app = await startApp(files.dir);
    expect((await fetch(app.baseUrl + "/")).status).toBe(404);
    const { run, seen } = runner(app.baseUrl);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M 0 0 L 10 10" fill="none" stroke="black"/></svg>';
    await run(
      "document save",
      jsonArgs({
        slug: "cli-canvas",
        name: "First",
        svg,
        source: "automation",
      }),
    );
    expect(
      (await run("documents list")).documents.some(
        (d) => d.slug === "cli-canvas",
      ),
    ).toBe(true);
    expect(
      (await run("document get", ["--slug", "cli-canvas"])).document.name,
    ).toBe("First");
    const history = await run("revisions list", [
      "--slug",
      "cli-canvas",
      "--limit",
      "10",
    ]);
    const revision = history.revisions.find((r) => r.name === "First");
    expect(revision).toBeTruthy();
    await run(
      "document save",
      jsonArgs({ slug: "cli-canvas", name: "Second", svg, source: "edit" }),
    );
    await run(
      "revisions restore",
      jsonArgs({ slug: "cli-canvas", revisionId: revision.id }),
    );
    expect(
      (await run("document get", ["--slug", "cli-canvas"])).document.name,
    ).toBe("First");
    expect(
      JSON.parse(
        await readFile(join(files.dir, "data/cli-canvas.json"), "utf8"),
      ).name,
    ).toBe("First");
    await run("document delete", ["--slug", "cli-canvas"]);
    expect(
      (await run("documents list")).documents.some(
        (d) => d.slug === "cli-canvas",
      ),
    ).toBe(false);
    expect([...seen].sort()).toEqual(config.commands.map((c) => c.name).sort());
  } finally {
    await app?.stop();
    await files.cleanup();
  }
}, 30000);
