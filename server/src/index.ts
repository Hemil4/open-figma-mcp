#!/usr/bin/env node

import * as fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FigmaBridge } from "./bridge.js";
import { BridgeClient } from "./bridge-client.js";
import { normalizeNodeId, ScreenEntry, ScreenRegistryStore } from "./registry.js";

type Bridge = FigmaBridge | BridgeClient;

const port = Number(process.env.FIGMA_MCP_PORT || 18765);
const bridge: Bridge = await createBridge(port);
const registryStore = new ScreenRegistryStore();

async function createBridge(port: number): Promise<Bridge> {
  try {
    return await FigmaBridge.create(port);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "EADDRINUSE") {
      console.error(`[open-figma-mcp] port ${port} in use; joining existing bridge as peer`);
      return new BridgeClient(port);
    }
    throw err;
  }
}

const server = new McpServer({
  name: "open-figma-mcp",
  version: "0.1.1"
});

type Shape = Record<string, z.ZodTypeAny>;
type ScreenTarget = "parent" | "node" | "none";

type ToolSpec = {
  name: string;
  command: string;
  description: string;
  inputSchema?: Shape;
  screenTarget?: ScreenTarget;
  timeoutMs?: number;
};

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function registerTool(
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown
) {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema
    },
    async (args) => jsonText(await handler(args as Record<string, unknown>))
  );
}

function registerBridgeTool(spec: ToolSpec) {
  registerTool(spec.name, spec.description, spec.inputSchema || {}, async (args) => {
    const params = await prepareBridgeArgs(args, spec.screenTarget || "none");
    return bridge.request(spec.command, params, spec.timeoutMs || 30000);
  });
}

async function prepareBridgeArgs(args: Record<string, unknown>, screenTarget: ScreenTarget) {
  const next = { ...args };

  for (const key of ["nodeId", "parentId", "componentId", "instanceId"]) {
    if (typeof next[key] === "string") next[key] = normalizeNodeId(String(next[key]));
  }
  if (Array.isArray(next.nodeIds)) next.nodeIds = next.nodeIds.map((id) => normalizeNodeId(String(id)));

  const screenKey = typeof next.screenKey === "string" ? next.screenKey : undefined;
  if (screenKey && screenTarget !== "none") {
    const screen = await registryStore.findScreen(screenKey);
    if (!screen) throw new Error(`No screen registered for key "${screenKey}". Run figma_create_screen_frames first.`);
    if (screenTarget === "parent" && !next.parentId) next.parentId = screen.figmaNodeId;
    if (screenTarget === "node" && !next.nodeId && !next.nodeIds) next.nodeId = screen.figmaNodeId;
  }

  return next;
}

const nodeSelector = {
  nodeId: z.string().optional().describe("Figma node ID. Colon or URL hyphen format accepted."),
  nodeIds: z.array(z.string()).optional().describe("Figma node IDs. Colon or URL hyphen format accepted."),
  screenKey: z.string().optional()
};
const parentSelector = {
  parentId: z.string().optional(),
  screenKey: z.string().optional()
};
const positionSize = {
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional()
};
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional();
const fillStroke = {
  color,
  fillColor: color,
  strokeColor: color,
  opacity: z.number().min(0).max(1).optional(),
  mode: z.enum(["replace", "append"]).optional()
};
const styleSelector = {
  styleId: z.string().optional(),
  styleName: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional()
};
const pageSelector = {
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  name: z.string().optional()
};
const designSystemType = z.enum(["component", "paintStyle", "textStyle", "effectStyle", "gridStyle", "variable", "font", "page"]);
const diagramNode = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  fillColor: color
}).passthrough();
const diagramEdge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional()
}).passthrough();
const screenElement = z.record(z.unknown());

registerTool("figma_status", "Check MCP bridge status and the last known Figma plugin status.", {}, async () => {
  return {
    bridge: bridge.status(),
    registryPath: registryStore.filePath,
    registry: await registryStore.load()
  };
});

const bridgeTools: ToolSpec[] = [
  { name: "figma_get_document", command: "get_document", description: "Get a serialized Figma document tree.", inputSchema: { depth: z.number().int().min(0).max(6).optional(), detail: z.enum(["minimal", "compact", "full"]).optional() }, timeoutMs: 60000 },
  { name: "figma_get_metadata", command: "get_metadata", description: "Get Figma file metadata, page list, current page, and selection count." },
  { name: "figma_get_pages", command: "get_pages", description: "List pages in the Figma document." },
  { name: "figma_get_selection", command: "get_selection", description: "Get the current Figma selection." },
  { name: "figma_get_node", command: "get_node", description: "Get one node by Figma node ID.", inputSchema: { nodeId: z.string(), depth: z.number().int().min(0).max(6).optional() } },
  { name: "figma_get_nodes_info", command: "get_nodes_info", description: "Get multiple nodes by Figma node IDs.", inputSchema: { nodeIds: z.array(z.string()), depth: z.number().int().min(0).max(6).optional(), detail: z.enum(["minimal", "compact", "full"]).optional() } },
  { name: "figma_get_design_context", command: "get_design_context", description: "Get a depth-limited tree for the current selection, current page, node, or screen.", inputSchema: { ...nodeSelector, depth: z.number().int().min(0).max(6).optional(), detail: z.enum(["minimal", "compact", "full"]).optional() }, screenTarget: "node", timeoutMs: 60000 },
  { name: "figma_search_nodes", command: "search_nodes", description: "Search nodes by name and optional type under the current page or node.", inputSchema: { query: z.string().optional(), ...nodeSelector, types: z.array(z.string()).optional(), limit: z.number().int().min(1).max(500).optional() }, screenTarget: "node" },
  { name: "figma_scan_text_nodes", command: "scan_text_nodes", description: "Scan text nodes under a node, screen, or current page.", inputSchema: { ...nodeSelector, limit: z.number().int().min(1).max(2000).optional() }, screenTarget: "node", timeoutMs: 60000 },
  { name: "figma_scan_nodes_by_types", command: "scan_nodes_by_types", description: "Scan nodes by Figma node type under a node, screen, or current page.", inputSchema: { ...nodeSelector, types: z.array(z.string()), limit: z.number().int().min(1).max(2000).optional() }, screenTarget: "node", timeoutMs: 60000 },
  { name: "figma_get_reactions", command: "get_reactions", description: "Get prototype reactions for a node.", inputSchema: { nodeId: z.string() } },
  { name: "figma_get_viewport", command: "get_viewport", description: "Get the current Figma viewport center and zoom." },
  { name: "figma_get_fonts", command: "get_fonts", description: "List fonts used under the current page or a node.", inputSchema: { nodeId: z.string().optional(), includeAvailable: z.boolean().optional() }, timeoutMs: 60000 },
  { name: "figma_get_styles", command: "get_styles", description: "List local paint, text, effect, and grid styles." },
  { name: "figma_get_variable_defs", command: "get_variable_defs", description: "List local variable collections and variables." },
  { name: "figma_get_local_components", command: "get_local_components", description: "List local components in the Figma file." },
  { name: "figma_get_annotations", command: "get_annotations", description: "List plugin-data annotations under a node or current page.", inputSchema: { nodeId: z.string().optional() }, timeoutMs: 60000 },
  { name: "figma_export_tokens", command: "export_tokens", description: "Export local styles and variables as design tokens." },
  { name: "figma_get_libraries", command: "get_libraries", description: "Get local components, styles, variables, fonts, pages, and file metadata.", inputSchema: { nodeId: z.string().optional(), includeAvailableFonts: z.boolean().optional() }, timeoutMs: 60000 },
  { name: "figma_search_design_system", command: "search_design_system", description: "Search local components, styles, variables, fonts, and pages.", inputSchema: { query: z.string().optional(), types: z.array(designSystemType).optional(), limit: z.number().int().min(1).max(500).optional() }, timeoutMs: 60000 },

  { name: "figma_create_frame", command: "create_frame", description: "Create a frame on the current page or inside a registered screen.", inputSchema: { ...parentSelector, ...positionSize, name: z.string().optional(), fillColor: color, layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(), paddingTop: z.number().optional(), paddingRight: z.number().optional(), paddingBottom: z.number().optional(), paddingLeft: z.number().optional(), itemSpacing: z.number().optional(), primaryAxisAlignItems: z.string().optional(), counterAxisAlignItems: z.string().optional() }, screenTarget: "parent" },
  { name: "figma_create_rectangle", command: "create_rectangle", description: "Create a rectangle on the current page or inside a registered screen.", inputSchema: { ...parentSelector, ...positionSize, name: z.string().optional(), fillColor: color, cornerRadius: z.number().optional() }, screenTarget: "parent" },
  { name: "figma_create_ellipse", command: "create_ellipse", description: "Create an ellipse on the current page or inside a registered screen.", inputSchema: { ...parentSelector, ...positionSize, name: z.string().optional(), fillColor: color }, screenTarget: "parent" },
  { name: "figma_create_text", command: "create_text", description: "Create a text node on the current page or inside a registered screen.", inputSchema: { ...parentSelector, ...positionSize, text: z.string(), name: z.string().optional(), fontSize: z.number().optional(), fontFamily: z.string().optional(), fontStyle: z.string().optional(), fillColor: color }, screenTarget: "parent" },
  { name: "figma_import_image", command: "import_image", description: "Create a rectangle filled with a base64 image.", inputSchema: { ...parentSelector, ...positionSize, imageData: z.string(), name: z.string().optional(), scaleMode: z.string().optional() }, screenTarget: "parent", timeoutMs: 60000 },
  { name: "figma_create_component", command: "create_component", description: "Convert a frame node into a component.", inputSchema: { nodeId: z.string(), name: z.string().optional() } },
  { name: "figma_create_section", command: "create_section", description: "Create a Figma section to organize frames.", inputSchema: { ...positionSize, name: z.string().optional() } },

  { name: "figma_set_text", command: "set_text", description: "Update text content of an existing TEXT node.", inputSchema: { nodeId: z.string(), text: z.string() } },
  { name: "figma_set_fills", command: "set_fills", description: "Set or append a solid fill on one or more nodes.", inputSchema: { ...nodeSelector, ...fillStroke }, screenTarget: "node" },
  { name: "figma_set_strokes", command: "set_strokes", description: "Set or append a solid stroke on one or more nodes.", inputSchema: { ...nodeSelector, ...fillStroke, strokeWeight: z.number().optional() }, screenTarget: "node" },
  { name: "figma_move_nodes", command: "move_nodes", description: "Move one or more nodes.", inputSchema: { ...nodeSelector, x: z.number().optional(), y: z.number().optional() }, screenTarget: "node" },
  { name: "figma_resize_nodes", command: "resize_nodes", description: "Resize one or more nodes.", inputSchema: { ...nodeSelector, width: z.number().optional(), height: z.number().optional() }, screenTarget: "node" },
  { name: "figma_rename_node", command: "rename_node", description: "Rename a node.", inputSchema: { nodeId: z.string(), name: z.string() } },
  { name: "figma_clone_node", command: "clone_node", description: "Clone a node, optionally moving it or reparenting it.", inputSchema: { nodeId: z.string(), parentId: z.string().optional(), x: z.number().optional(), y: z.number().optional() } },
  { name: "figma_set_opacity", command: "set_opacity", description: "Set opacity on one or more nodes.", inputSchema: { ...nodeSelector, opacity: z.number().min(0).max(1) }, screenTarget: "node" },
  { name: "figma_set_corner_radius", command: "set_corner_radius", description: "Set uniform or per-corner radius on one or more nodes.", inputSchema: { ...nodeSelector, cornerRadius: z.number().optional(), topLeftRadius: z.number().optional(), topRightRadius: z.number().optional(), bottomLeftRadius: z.number().optional(), bottomRightRadius: z.number().optional() }, screenTarget: "node" },
  { name: "figma_set_auto_layout", command: "set_auto_layout", description: "Configure auto layout on a frame/component/instance.", inputSchema: { ...nodeSelector, layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(), paddingTop: z.number().optional(), paddingRight: z.number().optional(), paddingBottom: z.number().optional(), paddingLeft: z.number().optional(), itemSpacing: z.number().optional(), primaryAxisAlignItems: z.string().optional(), counterAxisAlignItems: z.string().optional() }, screenTarget: "node" },
  { name: "figma_delete_nodes", command: "delete_nodes", description: "Delete one or more nodes.", inputSchema: { ...nodeSelector }, screenTarget: "node" },
  { name: "figma_set_visible", command: "set_visible", description: "Set visibility on one or more nodes.", inputSchema: { ...nodeSelector, visible: z.boolean() }, screenTarget: "node" },
  { name: "figma_lock_nodes", command: "lock_nodes", description: "Lock one or more nodes.", inputSchema: { ...nodeSelector }, screenTarget: "node" },
  { name: "figma_unlock_nodes", command: "unlock_nodes", description: "Unlock one or more nodes.", inputSchema: { ...nodeSelector }, screenTarget: "node" },
  { name: "figma_rotate_nodes", command: "rotate_nodes", description: "Set rotation on one or more nodes.", inputSchema: { ...nodeSelector, rotation: z.number() }, screenTarget: "node" },
  { name: "figma_reorder_nodes", command: "reorder_nodes", description: "Reorder one or more nodes within their parent.", inputSchema: { ...nodeSelector, order: z.enum(["bringToFront", "sendToBack", "bringForward", "sendBackward"]) }, screenTarget: "node" },
  { name: "figma_set_blend_mode", command: "set_blend_mode", description: "Set blend mode on one or more nodes.", inputSchema: { ...nodeSelector, blendMode: z.string() }, screenTarget: "node" },
  { name: "figma_set_constraints", command: "set_constraints", description: "Set horizontal and vertical constraints on one or more nodes.", inputSchema: { ...nodeSelector, horizontal: z.string().optional(), vertical: z.string().optional() }, screenTarget: "node" },
  { name: "figma_measure_spacing", command: "measure_spacing", description: "Measure bounds, gaps, overlaps, and alignment deltas for selected or provided nodes.", inputSchema: { ...nodeSelector, includeOverlaps: z.boolean().optional() }, screenTarget: "node", timeoutMs: 60000 },
  { name: "figma_align_distribute", command: "align_distribute", description: "Align and/or distribute selected or provided nodes.", inputSchema: { ...nodeSelector, align: z.enum(["left", "centerX", "right", "top", "centerY", "bottom"]).optional(), distribute: z.enum(["horizontal", "vertical"]).optional(), spacing: z.number().optional() }, screenTarget: "node" },
  { name: "figma_set_layout_grid", command: "set_layout_grid", description: "Apply a layout grid directly to a frame, component, or instance.", inputSchema: { ...nodeSelector, pattern: z.enum(["COLUMNS", "ROWS", "GRID"]).optional(), count: z.number().int().min(1).max(100).optional(), sectionSize: z.number().optional(), gutterSize: z.number().optional(), margin: z.number().optional(), offset: z.number().optional(), color, alignment: z.string().optional(), visible: z.boolean().optional() }, screenTarget: "node" },
  { name: "figma_reparent_nodes", command: "reparent_nodes", description: "Move one or more nodes under a new parent.", inputSchema: { ...nodeSelector, parentId: z.string() } },
  { name: "figma_batch_rename_nodes", command: "batch_rename_nodes", description: "Batch rename nodes using regex/prefix/suffix/numbering.", inputSchema: { ...nodeSelector, pattern: z.string().optional(), replacement: z.string().optional(), prefix: z.string().optional(), suffix: z.string().optional(), numbered: z.boolean().optional(), start: z.number().optional(), regex: z.boolean().optional() }, screenTarget: "node" },
  { name: "figma_find_replace_text", command: "find_replace_text", description: "Find and replace text under a node or current page.", inputSchema: { nodeId: z.string().optional(), find: z.string(), replace: z.string().optional(), regex: z.boolean().optional() }, timeoutMs: 60000 },
  { name: "figma_set_effects", command: "set_effects", description: "Set effects on one or more nodes.", inputSchema: { ...nodeSelector, effects: z.array(z.record(z.unknown())).optional() }, screenTarget: "node" },

  { name: "figma_create_paint_style", command: "create_paint_style", description: "Create a local paint style.", inputSchema: { name: z.string(), color, fillColor: color, opacity: z.number().optional(), description: z.string().optional() } },
  { name: "figma_create_text_style", command: "create_text_style", description: "Create a local text style.", inputSchema: { name: z.string(), fontFamily: z.string().optional(), fontStyle: z.string().optional(), fontSize: z.number().optional(), lineHeight: z.number().optional(), description: z.string().optional() } },
  { name: "figma_create_effect_style", command: "create_effect_style", description: "Create a local effect style.", inputSchema: { name: z.string(), effects: z.array(z.record(z.unknown())).optional(), description: z.string().optional() } },
  { name: "figma_create_grid_style", command: "create_grid_style", description: "Create a local grid style.", inputSchema: { name: z.string(), pattern: z.string().optional(), sectionSize: z.number().optional(), color, alignment: z.string().optional(), gutterSize: z.number().optional(), offset: z.number().optional(), count: z.number().optional(), description: z.string().optional() } },
  { name: "figma_update_paint_style", command: "update_paint_style", description: "Update a local paint style.", inputSchema: { ...styleSelector, color, fillColor: color, opacity: z.number().optional() } },
  { name: "figma_delete_style", command: "delete_style", description: "Delete a local style.", inputSchema: styleSelector },
  { name: "figma_apply_style_to_node", command: "apply_style_to_node", description: "Apply a local style to a node.", inputSchema: { nodeId: z.string(), ...styleSelector, styleType: z.string().optional() } },
  { name: "figma_bind_variable_to_node", command: "bind_variable_to_node", description: "Bind a variable to a node property.", inputSchema: { nodeId: z.string(), variableId: z.string().optional(), variableName: z.string().optional(), field: z.string().optional(), property: z.string().optional() } },
  { name: "figma_create_variable_collection", command: "create_variable_collection", description: "Create a local variable collection.", inputSchema: { name: z.string() } },
  { name: "figma_add_variable_mode", command: "add_variable_mode", description: "Add a mode to a variable collection.", inputSchema: { collectionId: z.string().optional(), collectionName: z.string().optional(), modeName: z.string().optional(), name: z.string().optional() } },
  { name: "figma_create_variable", command: "create_variable", description: "Create a local variable.", inputSchema: { collectionId: z.string().optional(), collectionName: z.string().optional(), name: z.string(), type: z.string().optional(), resolvedType: z.string().optional() } },
  { name: "figma_set_variable_value", command: "set_variable_value", description: "Set a local variable value for a mode.", inputSchema: { variableId: z.string().optional(), variableName: z.string().optional(), collectionId: z.string().optional(), modeId: z.string().optional(), modeName: z.string().optional(), value: z.unknown() } },
  { name: "figma_delete_variable", command: "delete_variable", description: "Delete a local variable.", inputSchema: { variableId: z.string().optional(), variableName: z.string().optional() } },

  { name: "figma_navigate_to_page", command: "navigate_to_page", description: "Set the current Figma page.", inputSchema: pageSelector },
  { name: "figma_add_page", command: "add_page", description: "Add a Figma page.", inputSchema: { name: z.string().optional(), setCurrent: z.boolean().optional() } },
  { name: "figma_delete_page", command: "delete_page", description: "Delete a Figma page.", inputSchema: pageSelector },
  { name: "figma_rename_page", command: "rename_page", description: "Rename a Figma page.", inputSchema: { ...pageSelector, newName: z.string() } },
  { name: "figma_group_nodes", command: "group_nodes", description: "Group two or more nodes.", inputSchema: { nodeIds: z.array(z.string()), parentId: z.string().optional(), name: z.string().optional() } },
  { name: "figma_ungroup_nodes", command: "ungroup_nodes", description: "Ungroup one or more groups.", inputSchema: { nodeIds: z.array(z.string()) } },
  { name: "figma_create_component_set", command: "create_component_set", description: "Combine two or more local components into a component set.", inputSchema: { nodeIds: z.array(z.string()).min(2), name: z.string().optional() } },
  { name: "figma_swap_component", command: "swap_component", description: "Swap an instance to another component.", inputSchema: { nodeId: z.string().optional(), instanceId: z.string().optional(), componentId: z.string() } },
  { name: "figma_detach_instance", command: "detach_instance", description: "Detach an instance.", inputSchema: { nodeId: z.string().optional(), instanceId: z.string().optional() } },
  { name: "figma_set_reactions", command: "set_reactions", description: "Set prototype reactions on a node.", inputSchema: { nodeId: z.string(), reactions: z.array(z.record(z.unknown())).optional() } },
  { name: "figma_remove_reactions", command: "remove_reactions", description: "Remove prototype reactions from a node.", inputSchema: { nodeId: z.string() } },

  { name: "figma_get_screenshot", command: "get_screenshot", description: "Export one or more nodes as PNG, JPG, SVG, or PDF base64.", inputSchema: { ...nodeSelector, format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional(), scale: z.number().optional() }, screenTarget: "node", timeoutMs: 120000 },
  { name: "figma_generate_diagram", command: "generate_diagram", description: "Create a structured diagram frame with boxes and connector lines.", inputSchema: { ...parentSelector, name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional(), backgroundColor: color, nodes: z.array(diagramNode).min(1), edges: z.array(diagramEdge).optional() }, screenTarget: "parent", timeoutMs: 120000 },
  { name: "figma_generate_screen", command: "generate_screen", description: "Create a structured app screen from JSON elements.", inputSchema: { ...parentSelector, name: z.string(), width: z.number().optional(), height: z.number().optional(), backgroundColor: color, elements: z.array(screenElement).min(1) }, screenTarget: "parent", timeoutMs: 120000 }
];

for (const spec of bridgeTools) registerBridgeTool(spec);

registerTool(
  "figma_export_frames_to_pdf",
  "Export one or more nodes to PDF. If outputPath is provided, write files on disk.",
  {
    nodeIds: z.array(z.string()),
    outputPath: z.string().optional()
  },
  async (args) => {
    const params = await prepareBridgeArgs({ ...args, format: "PDF" }, "none");
    const result = await bridge.request("export_frames_to_pdf", params, 120000) as ExportResponse;
    if (!args.outputPath) return result;
    return writeExports(result, String(args.outputPath), "pdf");
  }
);

registerTool(
  "figma_save_screenshots",
  "Export screenshots and save them to disk.",
  {
    items: z.array(z.object({ nodeId: z.string(), outputPath: z.string(), format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional(), scale: z.number().optional() })),
    format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional(),
    scale: z.number().optional()
  },
  async (args) => saveScreenshots(args)
);

registerTool(
  "figma_create_screen_frames",
  "Create one Figma frame per sitemap screen and save their node IDs in the local screen registry.",
  {
    projectName: z.string().default("Untitled"),
    sectionName: z.string().optional(),
    frameWidth: z.number().default(1440),
    frameHeight: z.number().default(1024),
    startX: z.number().default(0),
    startY: z.number().default(0),
    gap: z.number().default(160),
    columns: z.number().int().min(1).max(8).default(3),
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6,8}$/).default("#FFFFFF"),
    screens: z.array(
      z.object({
        key: z.string(),
        title: z.string(),
        route: z.string().optional(),
        type: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional()
      })
    )
  },
  async (args) => {
    const result = await bridge.request("create_screen_frames", args, 120000);
    const data = result as { projectName?: string; screens?: ScreenEntry[] };
    if (!Array.isArray(data.screens)) throw new Error("Figma plugin did not return screen frame IDs.");
    const registry = await registryStore.replace(String(data.projectName || args.projectName), data.screens);
    return { created: data.screens.length, registryPath: registryStore.filePath, registry };
  }
);

registerTool("figma_get_screen_registry", "Read the local sitemap-to-Figma-frame registry.", {}, async () => {
  return { registryPath: registryStore.filePath, registry: await registryStore.load() };
});

registerTool(
  "figma_get_screen",
  "Get a registered screen by key, with live Figma node details when the plugin is connected.",
  { screenKey: z.string() },
  async (args) => {
    const screen = await registryStore.findScreen(String(args.screenKey));
    if (!screen) throw new Error(`No screen registered for key "${String(args.screenKey)}".`);
    try {
      const node = await bridge.request("get_node", { nodeId: screen.figmaNodeId });
      return { screen, node };
    } catch (error) {
      return { screen, warning: error instanceof Error ? error.message : String(error) };
    }
  }
);

type ExportResponse = {
  exports?: Array<{
    nodeId: string;
    nodeName?: string;
    format?: string;
    base64: string;
    width?: number;
    height?: number;
  }>;
};

async function saveScreenshots(args: Record<string, unknown>) {
  const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : [];
  if (items.length === 0) throw new Error("items must be a non-empty array.");

  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const outputPath = String(item.outputPath || "");
    if (!outputPath) {
      results.push({ index, success: false, error: "outputPath is required" });
      continue;
    }
    const params = await prepareBridgeArgs({
      nodeId: item.nodeId,
      format: item.format || args.format || "PNG",
      scale: item.scale || args.scale || 1
    }, "none");
    const response = await bridge.request("get_screenshot", params, 120000) as ExportResponse;
    const exportItem = response.exports?.[0];
    if (!exportItem) {
      results.push({ index, nodeId: item.nodeId, outputPath, success: false, error: "No export returned" });
      continue;
    }
    const written = await writeBase64File(exportItem.base64, outputPath);
    results.push({ index, nodeId: exportItem.nodeId, nodeName: exportItem.nodeName, outputPath: written.path, bytesWritten: written.bytes, success: true });
  }

  const succeeded = results.filter((item) => item.success).length;
  return { total: results.length, succeeded, failed: results.length - succeeded, hasErrors: succeeded !== results.length, results };
}

async function writeExports(result: ExportResponse, outputPath: string, extension: string) {
  const exports = result.exports || [];
  if (exports.length === 0) throw new Error("No exports returned.");
  if (exports.length === 1) {
    const written = await writeBase64File(exports[0].base64, ensureExtension(outputPath, extension));
    return { ...result, written: [written] };
  }

  const resolved = resolveOutputPath(outputPath);
  const ext = path.extname(resolved);
  const dir = ext ? path.dirname(resolved) : resolved;
  const stem = ext ? path.basename(resolved, ext) : "frame";
  const written = [];
  for (let index = 0; index < exports.length; index += 1) {
    const out = path.join(dir, `${stem}-${String(index + 1).padStart(2, "0")}.${extension}`);
    written.push(await writeBase64File(exports[index].base64, out));
  }
  return { ...result, written };
}

async function writeBase64File(base64: string, outputPath: string) {
  const resolved = resolveOutputPath(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const data = Buffer.from(base64, "base64");
  await fs.writeFile(resolved, data, { flag: "wx" });
  return { path: resolved, bytes: data.length };
}

function resolveOutputPath(outputPath: string) {
  return path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
}

function ensureExtension(outputPath: string, extension: string) {
  return path.extname(outputPath) ? outputPath : `${outputPath}.${extension}`;
}

process.on("SIGINT", () => {
  bridge.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bridge.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
