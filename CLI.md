# design headless CLI

The CLI calls this app's existing HTTP API. It needs Bun and a running app
server, and runs without a browser, prompts, or a terminal UI. Every concrete
API method has a named command; `request METHOD /api/path` is also available.

## Start and connect

From this repository, start the API-only server in one terminal:

```sh
bun install
HOST=127.0.0.1 PORT=3000 bun run headless
```

It uses the same data-directory and upstream settings as `bun dev` and
`bun start`. `HEADLESS=1` skips importing the HTML and frontend; the root and
other non-API routes return JSON 404. The existing web server also accepts
CLI requests, so a second server is unnecessary if the app is already running.

In another terminal:

```sh
bun run cli --help
bun run cli documents list --base-url http://localhost:3000
```

The URL precedence is `--base-url`, then `DESIGN_API_URL`, then
`http://localhost:3000`. `PORT` selects the server's listening port; set the
CLI URL to match. Give simultaneously running apps different ports. Optional
reverse-proxy path prefixes are supported in the base URL.

`bun cli.js ...` and `./cli.js ...` work too. The package declares the
`design-cli` executable, available after an optional `bun link` in this repo.
The binary name avoids collisions with existing tools such as `code`.

## Examples

```sh
bun run cli documents list
bun run cli document get --slug default
bun run cli document save --json @canvas.json
bun run cli revisions list --slug default --limit 10
bun run cli revisions restore --json '{"slug":"default","revisionId":1}'
```

`canvas.json` is a request object such as
`{"slug":"default","name":"Canvas","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><path d=\"M0 0L10 10\"/></svg>","source":"automation"}`.
The SVG string goes in the `svg` field; the CLI sends the same document format
as the editor. A read of a missing slug creates the API's default canvas.

## Commands

Append `--help` to any command for its required path parameters, query flags,
and body format. All query values are strings: flags such as `--fresh 1`,
`--force 1`, and `--rescan 1` use the API's explicit `1` value.

| Command             | HTTP API                      | Purpose / body                                |
| ------------------- | ----------------------------- | --------------------------------------------- |
| `documents list`    | `GET /api/documents`          | List saved canvases.                          |
| `document get`      | `GET /api/document`           | Read a canvas (default slug: default).        |
| `document save`     | `PUT /api/document`           | Save {slug?, name?, svg, source?, metadata?}. |
| `document delete`   | `DELETE /api/document`        | Delete a canvas.                              |
| `revisions list`    | `GET /api/revisions`          | List canvas history.                          |
| `revisions restore` | `POST /api/revisions/restore` | Restore {slug, revisionId}.                   |

## Input and output

- `--json '{"key":"value"}'` sends JSON. `--json @file.json` reads a file;
  `--json -` reads stdin. Booleans, arrays, nested objects, and all API fields
  keep their JSON types. The API performs domain validation.
- `--query 'key=value'` appends a query parameter. Repeat it or a named query
  flag for repeated keys. Values are encoded safely, including spaces, `&`,
  and Unicode.
- `--upload FILE` adds a multipart `files` entry. `--field 'key=value'` adds
  text fields. Repeat either; the multipart boundary is set automatically.
- `--file FILE` sends raw bytes; `--file -` reads raw bytes from stdin. Body
  formats are mutually exclusive. Named commands reject unsupported formats.
- `--header 'Name:value'` adds a header, including authorization or byte ranges
  where the API supports them. For example, `--header 'Range:bytes=0-99'`.
- JSON responses are pretty-printed to stdout. Text and binary responses are
  copied unchanged; pipe them or use `--output FILE`. `--output -` explicitly
  selects stdout. Output files are replaced only after the response is fully
  received; a failed transfer preserves an existing file.
- `--timeout SECONDS` sets a 300-second default request/response timeout;
  use `--timeout 0` for no timeout. Ctrl-C cancels the request and exits 130;
  SIGTERM exits 143.

Errors are one JSON object on stderr, with `error`, and `status` / `details`
when available. Successful payloads stay on stdout. Exit 0 means success,
1 means API, network, stream, or operation failure, and 2 means invalid CLI
usage. Upload rejections, RSS per-feed errors, and Notebook execution errors
exit 1 even if the server returned HTTP 200; their response remains on stdout
so a script can inspect partial results. Requests are not automatically retried.

For direct API access:

```sh
bun run cli request GET /api/documents
```

Use `request` with the same JSON, multipart, raw body, query, header, and output
options. It accepts an `/api` path, not an arbitrary second server URL.

## Verification

```sh
bun run test:cli
```
