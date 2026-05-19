# Open Figma MCP

Local Figma plugin bridge for AI agents using MCP without Figma REST or hosted MCP rate limits.

```text
AI agent -> MCP stdio server -> local WebSocket bridge -> Figma plugin -> Figma file
```

The first product workflow is:

```text
sitemap/screens -> create Figma frames -> save frame IDs -> edit by screenKey
```

## Setup

```bash
cd /Users/hemilpatel/Code/figma-plugin-mcp
npm install
npm run build
```

For normal MCP use, configure your MCP client to launch `server/dist/index.js`.
Do not keep a separate `npm start` process running at the same time, because
the MCP server process owns stdio and the local bridge port `18765`.

In Figma Desktop:

1. Open a design file.
2. Go to `Plugins -> Development -> Import plugin from manifest...`.
3. Select `/Users/hemilpatel/Code/figma-plugin-mcp/plugin/manifest.json`.
4. Run `Plugins -> Development -> Open Figma MCP`.
5. The plugin should show `Connected`.

For a local bridge smoke test outside an MCP client, you can run `npm start`,
open the plugin, confirm it connects, then stop `npm start` before using a
real MCP client.

## MCP Config

Use the built server file:

```json
{
  "mcpServers": {
    "open-figma-mcp": {
      "command": "node",
      "args": ["/Users/hemilpatel/Code/figma-plugin-mcp/server/dist/index.js"]
    }
  }
}
```

Codex local add command:

```bash
codex mcp add open-figma-mcp -- node /Users/hemilpatel/Code/figma-plugin-mcp/server/dist/index.js
```

## Current Tools

The server exposes 85 tools: 79 Figma bridge tools plus 6 local workflow/export tools.

- Read: document, metadata, pages, selection, node(s), design context, search, text/type scans, viewport, fonts, reactions
- Export: screenshots, saved screenshots, frame PDF exports
- Create: frames, rectangles, ellipses, text, images, components, sections
- Modify: text, fills, strokes, position, size, names, clones, opacity, corner radius, auto layout, delete, visibility, locks, rotation, order, blend mode, constraints, reparenting, batch rename, find/replace, effects
- Styles/variables: local libraries, design-system search, local styles, tokens, components, annotations, paint/text/effect/grid style creation, updates, deletes, style application, variable collections, modes, values, bindings
- Pages/components/prototypes: add/delete/rename/navigate pages, group/ungroup, component sets, swap/detach instances, set/remove reactions
- Layout/inspection: spacing measurement, align/distribute, direct layout grid application
- Generation: structured diagram generation and structured screen generation
- Workflow: `figma_status`, `figma_create_screen_frames`, `figma_get_screen_registry`, `figma_get_screen`

## Example Sitemap Input

Call `figma_create_screen_frames` with:

```json
{
  "projectName": "SaaS CRM",
  "sectionName": "SaaS CRM Screens",
  "screens": [
    { "key": "home", "title": "Home", "route": "/" },
    { "key": "pricing", "title": "Pricing", "route": "/pricing" },
    { "key": "login", "title": "Login", "route": "/login" },
    { "key": "dashboard", "title": "Dashboard", "route": "/dashboard" },
    { "key": "contacts", "title": "Contacts", "route": "/dashboard/contacts" },
    { "key": "settings", "title": "Settings", "route": "/dashboard/settings" }
  ]
}
```

This creates frames in Figma and writes a registry to:

```text
.open-figma-mcp/screen-registry.json
```

After that, tools can use `screenKey` instead of raw Figma node IDs:

```json
{
  "screenKey": "login",
  "text": "Welcome back",
  "x": 64,
  "y": 80,
  "fontSize": 32
}
```

## Security

The plugin connects to the local bridge at `ws://127.0.0.1:18765/ws`. The development manifest currently allows broad network access while we validate the local bridge path. Do not expose the bridge on a public network interface.
