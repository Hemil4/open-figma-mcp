# open-figma-mcp

Open-source Figma MCP server with full read/write access via a local plugin bridge — no REST API, no rate limits. Works with Claude, Cursor, Codex, GitHub Copilot, and any MCP-compatible AI tool.

<p>
  <a href="https://www.npmjs.com/package/open-figma-mcp"><img src="https://img.shields.io/npm/v/open-figma-mcp?color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/open-figma-mcp"><img src="https://img.shields.io/npm/dw/open-figma-mcp?color=green" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/Hemil4/open-figma-mcp/actions/workflows/publish.yml"><img src="https://img.shields.io/badge/Provenance-signed-brightgreen" alt="Provenance signed" /></a>
  <a href="https://github.com/Hemil4/open-figma-mcp/stargazers"><img src="https://img.shields.io/github/stars/Hemil4/open-figma-mcp?style=social" alt="GitHub stars" /></a>
</p>

**Highlights**

- No Figma API token required
- No rate limits — works on free Figma plans
- **Read and write** live Figma data via a local plugin bridge — **85 tools** total
- Full design automation — styles, variables, components, prototypes, content, exports
- **Screen registry** — sitemap → frames → stable `screenKey` references that survive re-layout

---

## How it works

```
AI agent (MCP client)
    ⇅ stdio
MCP server  (Node.js)
    ⇅ ws://127.0.0.1:18765/ws
Figma plugin (UI iframe ⇄ sandbox)
    ⇅
Figma file
```

The server binds a local WebSocket on `127.0.0.1:18765`. The Figma plugin connects to it from inside Figma Desktop. Every tool call round-trips: MCP client → server → WebSocket → plugin → Figma → back.

No Figma REST API, no Figma OAuth, no hosted MCP. Bridge stays on the loopback interface.

---

## Why this exists

Most Figma MCP servers route through the Figma REST API. That hits rate limits:

| Plan | REST tool-call limit |
|------|----------------------|
| Starter / View / Collab | ~6 calls/month |
| Pro / Org (Dev seat) | 200 calls/day |
| Enterprise | 600 calls/day |

A few minutes of AI experimentation burns through that. This project skips the REST API entirely and talks to Figma through the official plugin API instead. The plugin runs locally inside your Figma Desktop, so the "rate limit" is just whatever your machine can do.

---

## Installation

Three steps: install the Figma plugin, configure your AI tool, run it. Install via `npx` — no clone or build required.

**Prereqs:** Node 18+ (Node 22+ recommended), Figma Desktop (not the browser app — the plugin must run locally).

### Step 1 — Install the Figma plugin

1. Download [**plugin.zip**](https://github.com/Hemil4/open-figma-mcp/releases/latest/download/plugin.zip) from the [latest release](https://github.com/Hemil4/open-figma-mcp/releases/latest).
2. Extract the zip anywhere (the folder must stay on disk — Figma reads `manifest.json` from this location).
3. Open Figma Desktop → any file → **Plugins → Development → Import plugin from manifest…**
4. Select the extracted `manifest.json`.
5. The plugin is now installed. You don't need to run it yet — Step 3 starts it.

> Source install instead? Use `<repo>/plugin/manifest.json` after running `npm install && npm run build`.

### Step 2 — Configure your AI tool

Pick the snippet for your tool. All four use the same `npx` command under the hood.

**Claude Code CLI**

```bash
claude mcp add -s user open-figma-mcp -- npx -y open-figma-mcp@latest
```

**Codex CLI**

```bash
codex mcp add open-figma-mcp -- npx -y open-figma-mcp@latest
```

**`.mcp.json`** (Claude Desktop, other MCP-compatible clients)

```json
{
  "mcpServers": {
    "open-figma-mcp": {
      "command": "npx",
      "args": ["-y", "open-figma-mcp@latest"]
    }
  }
}
```

**`.vscode/mcp.json`** (Cursor, VS Code, GitHub Copilot)

```json
{
  "servers": {
    "open-figma-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "open-figma-mcp@latest"]
    }
  }
}
```

<details>
<summary>Source install (alternative)</summary>

```bash
git clone https://github.com/Hemil4/open-figma-mcp.git
cd open-figma-mcp
npm install
npm run build
```

Replace the `npx` command in any snippet above with the absolute path to `<repo>/server/dist/index.js` — e.g.:

```json
{
  "mcpServers": {
    "open-figma-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/open-figma-mcp/server/dist/index.js"]
    }
  }
}
```

</details>

### Step 3 — Run it

1. Start a session in your AI tool (Claude/Codex/Cursor/Copilot). The tool launches the MCP server automatically.
2. In Figma Desktop, open the file you want to edit → **Plugins → Development → Open Figma MCP**.
3. The plugin window opens and shows **Connected** when the WebSocket bridge handshake succeeds.
4. Ask your AI: *"List my Figma pages"* — if it returns a list, the bridge works.

That's it. You can now ask the AI to create frames, edit text, manage variables, export — anything in the [tool list below](#available-tools).

### Verify it's working

```bash
curl http://127.0.0.1:18765/health
```

Returns `{"ok":true}` when the bridge is up. If `connection refused`, no MCP server is running (start a session in your AI tool).

### Common issues

| Symptom | Fix |
|---------|-----|
| Plugin shows **Disconnected** | MCP server is not running. Start a session in your AI tool, then click **Reconnect** in the plugin UI. |
| `Address already in use` on port 18765 | Another MCP session already owns the bridge. New sessions auto-join as peers (since v0.1.1) — this is fine, all clients share the one plugin. |
| Want to run on a different port | Set `FIGMA_MCP_PORT=<port>` in the MCP client config's `env`. All servers must use the same port. |
| Plugin window closes / file switches | The plugin only stays connected while its window is open. Re-run **Open Figma MCP** in the new file. |

### Multi-client (Claude + Codex + Cursor at the same time)

Since v0.1.1, multiple MCP clients can drive the same Figma file. The **first** server to bind `127.0.0.1:18765` owns the bridge; later servers join as peers and route their tool calls through the owner. Run all of them side-by-side against one plugin connection — no setup needed.

---

## Screen registry workflow

The headline workflow: turn a sitemap into frames, then drive AI edits by stable `screenKey` instead of brittle node IDs.

```jsonc
// AI agent calls figma_create_screen_frames
{
  "projectName": "SaaS CRM",
  "sectionName": "SaaS CRM Screens",
  "screens": [
    { "key": "home",      "title": "Home",      "route": "/" },
    { "key": "pricing",   "title": "Pricing",   "route": "/pricing" },
    { "key": "login",     "title": "Login",     "route": "/login" },
    { "key": "dashboard", "title": "Dashboard", "route": "/dashboard" }
  ]
}
```

Frames get created in Figma and a registry is written to `.open-figma-mcp/screen-registry.json` (override path via `FIGMA_MCP_REGISTRY_PATH`).

After that, any creating/mutating tool accepts `screenKey`:

```json
{
  "screenKey": "login",
  "text": "Welcome back",
  "x": 64,
  "y": 80,
  "fontSize": 32
}
```

When the frame moves or gets renamed, the registry still resolves the key.

---

## Available Tools

85 tools total — 79 bridge tools plus 6 workflow/status/export helpers.

### Read — Document & Selection

| Tool | Description |
|------|-------------|
| `figma_get_document` | Serialized current file tree (depth + detail level) |
| `figma_get_metadata` | File name, pages, current page, selection count |
| `figma_get_pages` | List pages (no tree loading) |
| `figma_get_selection` | Currently selected nodes |
| `figma_get_node` | Single node by ID |
| `figma_get_nodes_info` | Multiple nodes by ID |
| `figma_get_design_context` | Depth-limited tree (`minimal`/`compact`/`full`) for selection, page, node, or screen |
| `figma_search_nodes` | Find nodes by name/type under a subtree |
| `figma_scan_text_nodes` | All TEXT nodes under a subtree |
| `figma_scan_nodes_by_types` | All nodes matching given types |
| `figma_get_viewport` | Viewport center + zoom |

### Read — Styles, Variables, Libraries

| Tool | Description |
|------|-------------|
| `figma_get_styles` | Local paint, text, effect, grid styles |
| `figma_get_variable_defs` | Local variable collections + values |
| `figma_get_local_components` | Components + component sets with variants |
| `figma_get_annotations` | Plugin-data annotations |
| `figma_get_fonts` | Fonts used + optionally available fonts |
| `figma_get_reactions` | Prototype reactions on a node |
| `figma_get_libraries` | Components, styles, variables, fonts, pages, file metadata |
| `figma_search_design_system` | Search components/styles/variables/fonts/pages |

### Write — Create

| Tool | Description |
|------|-------------|
| `figma_create_frame` | Create a frame with optional auto-layout, fill, parent |
| `figma_create_rectangle` | Create a rectangle with optional fill + corner radius |
| `figma_create_ellipse` | Create an ellipse / circle |
| `figma_create_text` | Create a text node (font loaded automatically) |
| `figma_import_image` | Decode base64 image, place as rectangle fill |
| `figma_create_component` | Convert a frame into a reusable component |
| `figma_create_section` | Create a Section node to organize frames |

### Write — Modify

| Tool | Description |
|------|-------------|
| `figma_set_text` | Update TEXT node content |
| `figma_set_fills` | Set/append solid fill |
| `figma_set_strokes` | Set/append solid stroke + weight |
| `figma_set_opacity` | Set opacity 0–1 |
| `figma_set_corner_radius` | Uniform or per-corner radius |
| `figma_set_auto_layout` | Auto-layout direction, padding, spacing, alignment |
| `figma_set_visible` | Show / hide |
| `figma_lock_nodes` / `figma_unlock_nodes` | Lock or unlock |
| `figma_rotate_nodes` | Absolute rotation in degrees |
| `figma_reorder_nodes` | `bringToFront` / `sendToBack` / `bringForward` / `sendBackward` |
| `figma_set_blend_mode` | MULTIPLY, SCREEN, OVERLAY, … |
| `figma_set_constraints` | Responsive horizontal + vertical constraints |
| `figma_move_nodes` | Move to absolute x/y |
| `figma_resize_nodes` | Resize by width/height |
| `figma_rename_node` | Rename a node |
| `figma_clone_node` | Clone, optionally re-position or re-parent |
| `figma_reparent_nodes` | Move under a new parent |
| `figma_batch_rename_nodes` | Bulk rename via regex / prefix / suffix / numbering |
| `figma_find_replace_text` | Find + replace across TEXT nodes (regex supported) |
| `figma_set_effects` | Drop shadow / blur effects |
| `figma_align_distribute` | Align + distribute selected/provided nodes |
| `figma_set_layout_grid` | Apply a layout grid to a frame |
| `figma_measure_spacing` | Bounds, gaps, overlaps, alignment deltas |

### Write — Delete

| Tool | Description |
|------|-------------|
| `figma_delete_nodes` | Delete one or more nodes |

### Write — Styles

| Tool | Description |
|------|-------------|
| `figma_create_paint_style` | Create a paint style |
| `figma_create_text_style` | Create a text style |
| `figma_create_effect_style` | Create an effect style |
| `figma_create_grid_style` | Create a layout-grid style |
| `figma_update_paint_style` | Rename / recolor an existing paint style |
| `figma_delete_style` | Delete any local style |
| `figma_apply_style_to_node` | Apply a style to a node (link, not copy) |
| `figma_bind_variable_to_node` | Bind a variable to a node property |

### Write — Variables

| Tool | Description |
|------|-------------|
| `figma_create_variable_collection` | New variable collection |
| `figma_add_variable_mode` | Add a mode (e.g. Light/Dark) to a collection |
| `figma_create_variable` | Create a COLOR/FLOAT/STRING/BOOLEAN variable |
| `figma_set_variable_value` | Set a variable value for a mode |
| `figma_delete_variable` | Delete a variable |

### Write — Pages

| Tool | Description |
|------|-------------|
| `figma_navigate_to_page` | Switch the active page |
| `figma_add_page` | Add a new page |
| `figma_delete_page` | Delete a page (cannot delete the only page) |
| `figma_rename_page` | Rename a page |

### Write — Components & Grouping

| Tool | Description |
|------|-------------|
| `figma_group_nodes` | Group 2+ nodes |
| `figma_ungroup_nodes` | Ungroup |
| `figma_create_component_set` | Combine 2+ components into a component set |
| `figma_swap_component` | Swap an instance's main component |
| `figma_detach_instance` | Detach an instance to a plain frame |

### Write — Prototype

| Tool | Description |
|------|-------------|
| `figma_set_reactions` | Set prototype reactions (replace or append) |
| `figma_remove_reactions` | Remove all reactions from a node |

### Export

| Tool | Description |
|------|-------------|
| `figma_get_screenshot` | Export node(s) as PNG/JPG/SVG/PDF base64 |
| `figma_save_screenshots` | Export and write image files to disk |
| `figma_export_frames_to_pdf` | Multi-frame PDF export, optionally written to disk |
| `figma_export_tokens` | Export local styles + variables as design tokens |

### Generation

| Tool | Description |
|------|-------------|
| `figma_generate_diagram` | Create a structured diagram frame with boxes + connectors |
| `figma_generate_screen` | Create an app screen from a JSON element list |

### Workflow & Status

| Tool | Description |
|------|-------------|
| `figma_status` | Bridge status + last known plugin status |
| `figma_create_screen_frames` | Sitemap → frames + persisted screen registry |
| `figma_get_screen_registry` | Read the screen registry file |
| `figma_get_screen` | Resolve one screen by key + return live node details |

---

## Security

The bridge binds `127.0.0.1` only. **Do not change the host** or expose port `18765` on a public interface — the bridge has no auth.

The plugin manifest currently uses `networkAccess.allowedDomains: ["*"]` to simplify the dev path. Treat this repo as a **development plugin**, not a Figma Community submission. Production hardening (narrowed allow-list, signed bundle) is open work.

---

## Development

```bash
npm run build         # build server + plugin
npm run build:server  # tsc only
npm run build:plugin  # esbuild only
npm run dev           # run server from source via tsx (no plugin rebuild)
npm run start         # run the built server directly
npm run typecheck     # tsc --noEmit on the server
```

Adding a tool requires two edits in lockstep:

1. Add a `ToolSpec` to `bridgeTools` in `server/src/index.ts`
2. Add a matching `case "<command>":` in the `handleCommand` switch in `plugin/src/code.ts`
3. `npm run build` (both halves)

Forgetting either half produces an unhandled-command error at the plugin side.

---

## Contributing

Issues and PRs welcome. The architecture map lives at the top of `server/src/index.ts` (bridge wiring + `bridgeTools` array) and `plugin/src/code.ts` (the `handleCommand` switch). Keep those two in lockstep when adding tools.

## License

[MIT](LICENSE) © Hemil Patel
