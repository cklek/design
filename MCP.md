# design MCP server

The app is a [Model Context Protocol](https://modelcontextprotocol.io) server:
every HTTP API route is a tool, so an agent can drive design the way the page
and the headless CLI do. The tools call the same `/api` routes, so what a
tool can do is exactly what the API can do, no more and no less.

There are two ways in:

- **Streamable HTTP**, built into the app server at `POST /mcp`. It is there
  whenever the app is running, in `bun dev`, `bun start` or
  `bun run headless`. Nothing extra to start.
- **stdio**, `bun run mcp`, for clients that launch a server process. It
  connects to a running app server, or starts its own API-only one with
  `--start`.

## Connect

With the app running on port 3000:

```sh
claude mcp add --transport http design http://localhost:3000/mcp
```

For a client that launches processes (Claude Desktop, Codex, Claude Code with
stdio), point it at `mcp.js` and let it start its own server:

```json
{
  "mcpServers": {
    "design": {
      "command": "bun",
      "args": ["/path/to/design/mcp.js", "--start"]
    }
  }
}
```

`--start` runs `HEADLESS=1 HOST=127.0.0.1 PORT=0 bun server.js` from this
repository, with the same data directory and environment as `bun dev`, and
stops it when the client disconnects. Do not use it while another server is
already running against the same data directory: connect to that server
instead. Without `--start`, the URL precedence is `--base-url`, then
`DESIGN_API_URL`, then `http://localhost:3000`. `bun run mcp --help` lists the
tools without needing a server.

The package declares the `design-mcp` executable, available after an optional
`bun link`, alongside `design-cli`.

## Tools

| Tool                       | HTTP API                      | Purpose                                                                                                                     |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `design_documents_list`    | `GET /api/documents`          | Every saved canvas with its name, SVG, metadata and timestamps.                                                             |
| `design_document_get`      | `GET /api/document`           | One canvas by slug. An unknown slug gets a new blank canvas.                                                                |
| `design_document_save`     | `PUT /api/document`           | Save a canvas's SVG (required), name and metadata, recording a revision when something changed. source labels the revision. |
| `design_document_delete`   | `DELETE /api/document`        | Delete a canvas and its revision history. Cannot be undone.                                                                 |
| `design_revisions_list`    | `GET /api/revisions`          | A canvas's revision history, newest first, each with its SVG.                                                               |
| `design_revisions_restore` | `POST /api/revisions/restore` | Make an earlier revision the current canvas (recorded as a new revision).                                                   |

Every tool takes one JSON object. Its schema (from `tools/list`) names each
argument and marks the required ones; the runtime rejects a missing required
argument, a wrong type, a value outside an enum, or an argument the tool does
not have, before anything is sent. Path parameters (`:id`) and query
parameters are filled from the arguments of the same name; whatever is left
becomes the JSON body. The API applies its own domain rules after that, the
same ones the page and the CLI get.

The SVG you save must be a valid, script-free path document under 1 MB and
comes back normalised. Reading an unknown slug creates a blank canvas for it.
Use `source: "automation"` for tool-driven saves so the history says who made
the revision.

## Examples

Tool calls, as name and arguments:

```
design_documents_list {}
design_document_get {"slug":"logo"}
design_document_save {"slug":"logo","name":"Logo","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><path d=\"M 0 0 L 100 100\" stroke=\"black\" fill=\"none\"/></svg>","source":"automation"}
design_revisions_list {"slug":"logo","limit":5}
design_revisions_restore {"slug":"logo","revisionId":3}
```

## Results

- A JSON reply comes back twice: pretty-printed as a `text` block, and as
  `structuredContent` for clients that read it. `isError` is set when the
  API answered an error status (the payload then carries `error`, `status`
  and `details`), when a notebook cell run failed, or when every uploaded
  file was rejected. A partly rejected upload or a feed that failed inside a
  successful list is a success whose payload says what went wrong.
- `notifications/cancelled` aborts the API request behind a call. A call
  that has not answered after 300 seconds is an error.

## Verification

```sh
bun run test:mcp     # protocol, transport and every tool against a real server
bun run test         # the CLI suite too
```
