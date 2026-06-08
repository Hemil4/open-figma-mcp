figma.showUI(__html__, { width: 280, height: 156 });

type BridgeRequest = {
  id: string;
  command: string;
  params?: Record<string, unknown>;
};

type DetailLevel = "minimal" | "compact" | "full";
type AnyNode = BaseNode & Record<string, any>;

figma.ui.onmessage = async (message: BridgeRequest | { type: string; width?: number; height?: number }) => {
  if (!message || !("id" in message)) {
    if (message?.type === "resize-ui") {
      figma.ui.resize(Number(message.width || 280), Number(message.height || 156));
    }
    return;
  }

  try {
    const result = await handleCommand(message);
    figma.ui.postMessage({ id: message.id, ok: true, result });
    postPluginStatus();
  } catch (error) {
    figma.ui.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

figma.on("selectionchange", postPluginStatus);
figma.on("currentpagechange", postPluginStatus);
postPluginStatus();

async function handleCommand(message: BridgeRequest) {
  const params = message.params || {};

  switch (message.command) {
    case "get_document":
      return getDocument(params);
    case "get_metadata":
      return getMetadata();
    case "get_pages":
      return getPages();
    case "get_selection":
      return Promise.all(figma.currentPage.selection.map((node) => serializeNode(node, 1, "compact")));
    case "get_node":
      return serializeNode(await requireNode(String(params.nodeId)), Number(params.depth ?? 2), "full");
    case "get_nodes_info":
      return getNodesInfo(params);
    case "get_design_context":
      return getDesignContext(params);
    case "search_nodes":
      return searchNodes(params);
    case "scan_text_nodes":
      return scanTextNodes(params);
    case "scan_nodes_by_types":
      return scanNodesByTypes(params);
    case "get_reactions":
      return getReactions(params);
    case "get_viewport":
      return getViewport();
    case "get_fonts":
      return getFonts(params);
    case "get_styles":
      return getStyles();
    case "get_variable_defs":
      return getVariableDefs();
    case "get_local_components":
      return getLocalComponents();
    case "get_annotations":
      return getAnnotations(params);
    case "export_tokens":
      return exportTokens();
    case "get_libraries":
      return getLibraries(params);
    case "search_design_system":
      return searchDesignSystem(params);

    case "create_frame":
      return createFrame(params);
    case "create_rectangle":
      return createRectangle(params);
    case "create_ellipse":
      return createEllipse(params);
    case "create_text":
      return createText(params);
    case "import_image":
      return importImage(params);
    case "create_component":
      return createComponent(params);
    case "create_section":
      return createSection(params);
    case "create_screen_frames":
      return createScreenFrames(params);

    case "set_text":
      return setText(String(params.nodeId), String(params.text));
    case "set_fills":
      return setFills(params);
    case "set_strokes":
      return setStrokes(params);
    case "move_nodes":
      return moveNodes(params);
    case "resize_nodes":
      return resizeNodes(params);
    case "rename_node":
      return renameNode(params);
    case "clone_node":
      return cloneNode(params);
    case "set_opacity":
      return setOpacity(params);
    case "set_corner_radius":
      return setCornerRadius(params);
    case "set_auto_layout":
      return setAutoLayout(params);
    case "delete_nodes":
      return deleteNodes(params);
    case "set_visible":
      return setVisible(params);
    case "lock_nodes":
      return setLocked(params, true);
    case "unlock_nodes":
      return setLocked(params, false);
    case "rotate_nodes":
      return rotateNodes(params);
    case "reorder_nodes":
      return reorderNodes(params);
    case "set_blend_mode":
      return setBlendMode(params);
    case "set_constraints":
      return setConstraints(params);
    case "measure_spacing":
      return measureSpacing(params);
    case "align_distribute":
      return alignDistribute(params);
    case "set_layout_grid":
      return setLayoutGrid(params);
    case "reparent_nodes":
      return reparentNodes(params);
    case "batch_rename_nodes":
      return batchRenameNodes(params);
    case "find_replace_text":
      return findReplaceText(params);
    case "set_effects":
      return setEffects(params);

    case "create_paint_style":
      return createPaintStyle(params);
    case "create_text_style":
      return createTextStyle(params);
    case "create_effect_style":
      return createEffectStyle(params);
    case "create_grid_style":
      return createGridStyle(params);
    case "update_paint_style":
      return updatePaintStyle(params);
    case "delete_style":
      return deleteStyle(params);
    case "apply_style_to_node":
      return applyStyleToNode(params);
    case "bind_variable_to_node":
      return bindVariableToNode(params);
    case "create_variable_collection":
      return createVariableCollection(params);
    case "add_variable_mode":
      return addVariableMode(params);
    case "create_variable":
      return createVariable(params);
    case "set_variable_value":
      return setVariableValue(params);
    case "delete_variable":
      return deleteVariable(params);

    case "navigate_to_page":
      return navigateToPage(params);
    case "add_page":
      return addPage(params);
    case "delete_page":
      return deletePage(params);
    case "rename_page":
      return renamePage(params);
    case "group_nodes":
      return groupNodes(params);
    case "ungroup_nodes":
      return ungroupNodes(params);
    case "create_component_set":
      return createComponentSet(params);
    case "swap_component":
      return swapComponent(params);
    case "detach_instance":
      return detachInstance(params);
    case "set_reactions":
      return setReactions(params);
    case "remove_reactions":
      return removeReactions(params);

    case "get_screenshot":
      return getScreenshot(params);
    case "export_frames_to_pdf":
      return exportFramesToPdf(params);
    case "generate_diagram":
      return generateDiagram(params);
    case "generate_screen":
      return generateScreen(params);

    default:
      throw new Error(`Unknown command: ${message.command}`);
  }
}

function postPluginStatus() {
  figma.ui.postMessage({
    type: "plugin_status",
    payload: {
      fileName: figma.root.name,
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
      selectionCount: figma.currentPage.selection.length
    }
  });
}

async function getDocument(params: Record<string, unknown>) {
  const depth = clamp(Number(params.depth ?? 2), 0, 6);
  const detail = parseDetail(params.detail);
  if (depth > 0) await loadAllPagesForTraversal();
  return {
    fileName: figma.root.name,
    pages: await Promise.all(figma.root.children.map((page) => serializeNode(page, depth, detail)))
  };
}

function getMetadata() {
  return {
    fileName: figma.root.name,
    currentPage: {
      id: figma.currentPage.id,
      name: figma.currentPage.name
    },
    pages: getPages(),
    selectionCount: figma.currentPage.selection.length
  };
}

function getPages() {
  return figma.root.children.map((page) => ({
    id: page.id,
    name: page.name
  }));
}

async function getNodesInfo(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  return Promise.all(nodes.map((node) => serializeNode(node, Number(params.depth ?? 1), parseDetail(params.detail))));
}

async function getDesignContext(params: Record<string, unknown>) {
  const depth = clamp(Number(params.depth ?? 2), 0, 6);
  const detail = parseDetail(params.detail);
  const root = typeof params.nodeId === "string" && params.nodeId
    ? await requireNode(params.nodeId)
    : figma.currentPage.selection[0] || figma.currentPage;

  return serializeNode(root, depth, detail);
}

async function searchNodes(params: Record<string, unknown>) {
  const query = String(params.query || "").toLowerCase();
  const limit = clamp(Number(params.limit ?? 50), 1, 500);
  const types = Array.isArray(params.types) ? new Set(params.types.map(String)) : null;
  const root = await getSearchRoot(params);
  const results: unknown[] = [];

  await walk(root, async (node) => {
    if (results.length >= limit) return;
    if (!("name" in node) || !("type" in node)) return;
    if (query && !node.name.toLowerCase().includes(query)) return;
    if (types && !types.has(node.type)) return;
    results.push(await serializeNode(node, 0, "compact"));
  });

  return { query, count: results.length, results };
}

async function scanTextNodes(params: Record<string, unknown>) {
  const root = await getSearchRoot(params);
  const limit = clamp(Number(params.limit ?? 500), 1, 2000);
  const results: unknown[] = [];
  await walk(root, async (node) => {
    if (results.length >= limit || node.type !== "TEXT") return;
    const text = node as TextNode;
    results.push({
      id: text.id,
      name: text.name,
      characters: text.characters,
      bounds: getBounds(text),
      fontName: isMixed(text.fontName) ? "mixed" : text.fontName,
      fontSize: isMixed(text.fontSize) ? "mixed" : text.fontSize
    });
  });
  return { count: results.length, results };
}

async function scanNodesByTypes(params: Record<string, unknown>) {
  const types = new Set((Array.isArray(params.types) ? params.types : []).map(String));
  if (types.size === 0) throw new Error("types must be a non-empty array.");
  const root = await getSearchRoot(params);
  const limit = clamp(Number(params.limit ?? 500), 1, 2000);
  const results: unknown[] = [];
  await walk(root, async (node) => {
    if (results.length >= limit || !types.has(node.type)) return;
    results.push(await serializeNode(node, 0, "compact"));
  });
  return { types: Array.from(types), count: results.length, results };
}

async function getReactions(params: Record<string, unknown>) {
  const node = await requireNode(String(params.nodeId));
  return {
    nodeId: node.id,
    nodeName: node.name,
    reactions: "reactions" in node ? (node as AnyNode).reactions || [] : []
  };
}

function getViewport() {
  const viewport = figma.viewport as any;
  return {
    center: viewport.center,
    zoom: viewport.zoom,
    bounds: viewport.bounds || undefined
  };
}

async function getFonts(params: Record<string, unknown>) {
  const root = params.nodeId ? await requireNode(String(params.nodeId)) : figma.currentPage;
  const used = new Map<string, FontName>();
  await walk(root, async (node) => {
    if (node.type !== "TEXT") return;
    const fontName = (node as TextNode).fontName;
    if (!isMixed(fontName)) used.set(`${fontName.family}::${fontName.style}`, fontName);
  });

  let available: unknown[] | undefined;
  const listFonts = (figma as any).listAvailableFontsAsync;
  if (typeof listFonts === "function" && params.includeAvailable === true) {
    available = await listFonts.call(figma);
  }

  return { used: Array.from(used.values()), available };
}

async function getStyles() {
  const paint = await getLocalStyles("Paint");
  const text = await getLocalStyles("Text");
  const effect = await getLocalStyles("Effect");
  const grid = await getLocalStyles("Grid");
  return {
    paintStyles: paint.map(serializeStyle),
    textStyles: text.map(serializeStyle),
    effectStyles: effect.map(serializeStyle),
    gridStyles: grid.map(serializeStyle)
  };
}

async function getVariableDefs() {
  const api = getVariablesApi();
  if (!api) return { collections: [], variables: [], warning: "Variables API is not available in this Figma runtime." };
  const collections = await callMaybeAsync(api, "getLocalVariableCollections");
  const variables = await callMaybeAsync(api, "getLocalVariables");
  return {
    collections: (collections || []).map(serializeVariableCollection),
    variables: (variables || []).map(serializeVariable)
  };
}

async function getLocalComponents() {
  const components = typeof (figma as any).getLocalComponentsAsync === "function"
    ? await (figma as any).getLocalComponentsAsync()
    : typeof (figma as any).getLocalComponents === "function"
      ? (figma as any).getLocalComponents()
      : [];
  return { components: components.map((component: ComponentNode) => serializeComponent(component)) };
}

async function getAnnotations(params: Record<string, unknown>) {
  const root = params.nodeId ? await requireNode(String(params.nodeId)) : figma.currentPage;
  const annotations: unknown[] = [];
  await walk(root, async (node) => {
    const anyNode = node as AnyNode;
    const keys = typeof anyNode.getPluginDataKeys === "function" ? anyNode.getPluginDataKeys() : [];
    const annotationKeys = keys.filter((key: string) => key.toLowerCase().includes("annotation"));
    if (annotationKeys.length > 0) {
      annotations.push({
        nodeId: node.id,
        nodeName: node.name,
        annotations: Object.fromEntries(annotationKeys.map((key: string) => [key, anyNode.getPluginData(key)]))
      });
    }
  });
  return { annotations };
}

async function exportTokens() {
  const styles = await getStyles();
  const variables = await getVariableDefs();
  return { styles, variables };
}

async function getLibraries(params: Record<string, unknown>) {
  const components = await getLocalComponents();
  const styles = await getStyles();
  const variables = await getVariableDefs();
  const fonts = await getFonts({ nodeId: params.nodeId, includeAvailable: params.includeAvailableFonts === true });
  return {
    metadata: getMetadata(),
    pages: getPages(),
    components: components.components,
    styles,
    variables,
    fonts
  };
}

async function searchDesignSystem(params: Record<string, unknown>) {
  const query = String(params.query || "").toLowerCase();
  const limit = clamp(Number(params.limit ?? 50), 1, 500);
  const types = Array.isArray(params.types) ? new Set(params.types.map(String)) : null;
  const libraries = await getLibraries({ includeAvailableFonts: params.includeAvailableFonts === true });
  const results: Record<string, unknown[]> = {
    component: [],
    paintStyle: [],
    textStyle: [],
    effectStyle: [],
    gridStyle: [],
    variable: [],
    font: [],
    page: []
  };
  let total = 0;

  const add = (type: string, item: Record<string, unknown>) => {
    if (total >= limit) return;
    if (types && !types.has(type)) return;
    const name = String(item.name || item.family || "");
    if (query && !name.toLowerCase().includes(query)) return;
    results[type].push({ type, ...item });
    total += 1;
  };

  for (const component of (libraries.components as Record<string, unknown>[])) add("component", component);
  const styles = libraries.styles as Record<string, Record<string, unknown>[]>;
  for (const style of styles.paintStyles || []) add("paintStyle", style);
  for (const style of styles.textStyles || []) add("textStyle", style);
  for (const style of styles.effectStyles || []) add("effectStyle", style);
  for (const style of styles.gridStyles || []) add("gridStyle", style);
  const variables = libraries.variables as { variables?: Record<string, unknown>[] };
  for (const variable of variables.variables || []) add("variable", variable);
  const fonts = libraries.fonts as { used?: Record<string, unknown>[]; available?: Record<string, unknown>[] };
  for (const font of [...(fonts.used || []), ...(fonts.available || [])]) {
    const family = typeof font.fontName === "object" && font.fontName ? (font.fontName as FontName).family : String(font.family || "");
    const style = typeof font.fontName === "object" && font.fontName ? (font.fontName as FontName).style : String(font.style || "");
    add("font", { name: `${family} ${style}`.trim(), family, style });
  }
  for (const page of libraries.pages as Record<string, unknown>[]) add("page", page);

  return { query, types: types ? Array.from(types) : undefined, count: total, results };
}

async function createFrame(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const frame = figma.createFrame();
  frame.name = String(params.name || "Frame");
  setNodePositionAndSize(frame, params, 360, 240);
  if (params.fillColor !== null) frame.fills = [makeSolidPaint(String(params.fillColor || "#FFFFFF"))];
  applyAutoLayout(frame, params);
  parent.appendChild(frame);
  selectAndCommit([frame], true);
  return serializeNode(frame, 1, "compact");
}

async function createRectangle(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const rect = figma.createRectangle();
  rect.name = String(params.name || "Rectangle");
  setNodePositionAndSize(rect, params, 240, 120);
  rect.fills = [makeSolidPaint(String(params.fillColor || "#18A0FB"))];
  if (params.cornerRadius != null) rect.cornerRadius = Number(params.cornerRadius);
  parent.appendChild(rect);
  selectAndCommit([rect]);
  return serializeNode(rect, 0, "compact");
}

async function createEllipse(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const ellipse = figma.createEllipse();
  ellipse.name = String(params.name || "Ellipse");
  setNodePositionAndSize(ellipse, params, 120, 120);
  ellipse.fills = [makeSolidPaint(String(params.fillColor || "#18A0FB"))];
  parent.appendChild(ellipse);
  selectAndCommit([ellipse]);
  return serializeNode(ellipse, 0, "compact");
}

async function createText(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const fontName = {
    family: String(params.fontFamily || "Inter"),
    style: String(params.fontStyle || "Regular")
  };
  const loadedFontName = await loadFontWithFallback(fontName);
  const textNode = figma.createText();
  textNode.fontName = loadedFontName;
  textNode.fontSize = Number(params.fontSize ?? 16);
  textNode.characters = String(params.text || "");
  textNode.name = String(params.name || params.text || "Text");
  textNode.x = Number(params.x ?? 0);
  textNode.y = Number(params.y ?? 0);
  if (params.width != null && "resize" in textNode) {
    textNode.resize(Number(params.width), textNode.height);
  }
  textNode.fills = [makeSolidPaint(String(params.fillColor || "#111827"))];
  parent.appendChild(textNode);
  selectAndCommit([textNode]);
  return serializeNode(textNode, 0, "full");
}

async function importImage(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const data = String(params.imageData || params.base64 || "");
  if (!data) throw new Error("imageData is required.");
  const image = figma.createImage(base64ToBytes(data));
  const rect = figma.createRectangle();
  rect.name = String(params.name || "Image");
  setNodePositionAndSize(rect, params, 200, 200);
  rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: String(params.scaleMode || "FILL") as any }];
  parent.appendChild(rect);
  selectAndCommit([rect]);
  return serializeNode(rect, 0, "compact");
}

async function createComponent(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  let component: ComponentNode;
  if (typeof (figma as any).createComponentFromNode === "function") {
    component = (figma as any).createComponentFromNode(node);
  } else {
    if (node.type !== "FRAME") throw new Error("create_component requires a FRAME node in this Figma runtime.");
    const frame = node as FrameNode;
    const parent = frame.parent as ChildrenMixin | null;
    const index = parent && "children" in parent ? (parent.children as readonly SceneNode[]).indexOf(frame) : -1;
    component = figma.createComponent();
    component.name = String(params.name || frame.name);
    component.resize(frame.width, frame.height);
    component.x = frame.x;
    component.y = frame.y;
    component.fills = frame.fills;
    for (const child of [...frame.children]) component.appendChild(child);
    if (parent && index >= 0) parent.insertChild(index, component);
    frame.remove();
  }
  if (params.name) component.name = String(params.name);
  selectAndCommit([component], true);
  return serializeNode(component, 1, "compact");
}

async function createSection(params: Record<string, unknown>) {
  const section = figma.createSection();
  section.name = String(params.name || "Section");
  section.x = Number(params.x ?? 0);
  section.y = Number(params.y ?? 0);
  section.resizeWithoutConstraints(Number(params.width ?? 1600), Number(params.height ?? 1200));
  selectAndCommit([section], true);
  return serializeNode(section, 0, "compact");
}

async function createScreenFrames(params: Record<string, unknown>) {
  const projectName = String(params.projectName || "Untitled");
  const screens = Array.isArray(params.screens) ? params.screens as Record<string, unknown>[] : [];
  if (screens.length === 0) throw new Error("screens array is required.");

  const frameWidth = Number(params.frameWidth ?? 1440);
  const frameHeight = Number(params.frameHeight ?? 1024);
  const startX = Number(params.startX ?? 0);
  const startY = Number(params.startY ?? 0);
  const gap = Number(params.gap ?? 160);
  const columns = Math.max(1, Number(params.columns ?? 3));
  const fillColor = String(params.fillColor || "#FFFFFF");
  const created: SceneNode[] = [];
  const entries = [];

  let section: SectionNode | null = null;
  if (params.sectionName) {
    section = figma.createSection();
    section.name = String(params.sectionName);
    section.x = startX - 80;
    section.y = startY - 80;
  }

  for (let index = 0; index < screens.length; index += 1) {
    const screen = screens[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const width = Number(screen.width ?? frameWidth);
    const height = Number(screen.height ?? frameHeight);
    const key = String(screen.key || `screen-${index + 1}`);
    const title = String(screen.title || key);
    const frame = figma.createFrame();
    frame.name = `${String(index + 1).padStart(2, "0")} ${title}`;
    frame.x = startX + col * (frameWidth + gap);
    frame.y = startY + row * (frameHeight + gap);
    frame.resize(width, height);
    frame.fills = [makeSolidPaint(fillColor)];
    frame.setPluginData("screenKey", key);
    if (screen.route) frame.setPluginData("route", String(screen.route));
    if (screen.type) frame.setPluginData("screenType", String(screen.type));
    created.push(frame);
    entries.push({
      key,
      title,
      route: screen.route ? String(screen.route) : undefined,
      type: screen.type ? String(screen.type) : undefined,
      index: index + 1,
      figmaNodeId: frame.id,
      figmaName: frame.name,
      pageId: figma.currentPage.id,
      x: frame.x,
      y: frame.y,
      width,
      height
    });
  }

  if (section) {
    const rows = Math.ceil(screens.length / columns);
    section.resizeWithoutConstraints(columns * frameWidth + (columns - 1) * gap + 160, rows * frameHeight + (rows - 1) * gap + 160);
    created.unshift(section);
  }

  selectAndCommit(created, true);
  return { projectName, pageId: figma.currentPage.id, pageName: figma.currentPage.name, sectionId: section && section.id, screens: entries };
}

async function setText(nodeId: string, text: string) {
  const node = await requireNode(nodeId);
  if (node.type !== "TEXT") throw new Error(`Node ${nodeId} is ${node.type}, not TEXT.`);
  const fontName = isMixed(node.fontName) ? { family: "Inter", style: "Regular" } : node.fontName;
  node.fontName = await loadFontWithFallback(fontName);
  node.characters = text;
  selectAndCommit([node]);
  return serializeNode(node, 0, "full");
}

async function setFills(params: Record<string, unknown>) {
  const paint = makeSolidPaint(String(params.color || params.fillColor || "#18A0FB"), numberOrUndefined(params.opacity));
  return mutateNodes(params, "set_fills", (node) => {
    requireMixin(node, "fills", "fills");
    node.fills = params.mode === "append" && Array.isArray(node.fills) ? [...node.fills, paint] : [paint];
    return { fills: serializePaints(node.fills) };
  });
}

async function setStrokes(params: Record<string, unknown>) {
  const paint = makeSolidPaint(String(params.color || params.strokeColor || "#111827"), numberOrUndefined(params.opacity));
  return mutateNodes(params, "set_strokes", (node) => {
    requireMixin(node, "strokes", "strokes");
    node.strokes = params.mode === "append" && Array.isArray(node.strokes) ? [...node.strokes, paint] : [paint];
    if (params.strokeWeight != null && "strokeWeight" in node) node.strokeWeight = Number(params.strokeWeight);
    return { strokes: serializePaints(node.strokes), strokeWeight: node.strokeWeight };
  });
}

async function moveNodes(params: Record<string, unknown>) {
  return mutateNodes(params, "move_nodes", (node) => {
    requireMixin(node, "x", "position");
    if (params.x != null) node.x = Number(params.x);
    if (params.y != null) node.y = Number(params.y);
    return { x: node.x, y: node.y };
  });
}

async function resizeNodes(params: Record<string, unknown>) {
  return mutateNodes(params, "resize_nodes", (node) => {
    if (typeof node.resize !== "function") throw new Error("Node does not support resize.");
    node.resize(Number(params.width ?? node.width), Number(params.height ?? node.height));
    return { width: node.width, height: node.height };
  });
}

async function renameNode(params: Record<string, unknown>) {
  const node = await requireNode(String(params.nodeId || getNodeIds(params)[0]));
  node.name = String(params.name || "");
  selectAndCommit([node as SceneNode]);
  return serializeNode(node, 0, "compact");
}

async function cloneNode(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  if (typeof (node as AnyNode).clone !== "function") throw new Error("Node does not support clone.");
  const clone = (node as AnyNode).clone() as SceneNode;
  if (params.x != null && "x" in clone) (clone as AnyNode).x = Number(params.x);
  if (params.y != null && "y" in clone) (clone as AnyNode).y = Number(params.y);
  if (params.parentId) {
    const parent = await getParentNode(params.parentId);
    parent.appendChild(clone);
  }
  selectAndCommit([clone], true);
  return serializeNode(clone, 1, "compact");
}

async function setOpacity(params: Record<string, unknown>) {
  return mutateNodes(params, "set_opacity", (node) => {
    requireMixin(node, "opacity", "opacity");
    node.opacity = clamp(Number(params.opacity), 0, 1);
    return { opacity: node.opacity };
  });
}

async function setCornerRadius(params: Record<string, unknown>) {
  return mutateNodes(params, "set_corner_radius", (node) => {
    requireMixin(node, "cornerRadius", "corner radius");
    if (params.cornerRadius != null) node.cornerRadius = Number(params.cornerRadius);
    if (params.topLeftRadius != null && "topLeftRadius" in node) node.topLeftRadius = Number(params.topLeftRadius);
    if (params.topRightRadius != null && "topRightRadius" in node) node.topRightRadius = Number(params.topRightRadius);
    if (params.bottomLeftRadius != null && "bottomLeftRadius" in node) node.bottomLeftRadius = Number(params.bottomLeftRadius);
    if (params.bottomRightRadius != null && "bottomRightRadius" in node) node.bottomRightRadius = Number(params.bottomRightRadius);
    return { cornerRadius: isMixed(node.cornerRadius) ? "mixed" : node.cornerRadius };
  });
}

async function setAutoLayout(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") throw new Error("Node does not support auto layout.");
  applyAutoLayout(node as FrameNode, params);
  selectAndCommit([node]);
  return serializeNode(node, 0, "full");
}

async function deleteNodes(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  const results = nodes.map((node) => ({ nodeId: node.id, nodeName: node.name, removed: true }));
  for (const node of nodes) node.remove();
  figma.commitUndo();
  return { count: results.length, results };
}

async function setVisible(params: Record<string, unknown>) {
  return mutateNodes(params, "set_visible", (node) => {
    requireMixin(node, "visible", "visibility");
    node.visible = Boolean(params.visible);
    return { visible: node.visible };
  });
}

async function setLocked(params: Record<string, unknown>, locked: boolean) {
  return mutateNodes(params, locked ? "lock_nodes" : "unlock_nodes", (node) => {
    requireMixin(node, "locked", "locking");
    node.locked = locked;
    return { locked: node.locked };
  });
}

async function rotateNodes(params: Record<string, unknown>) {
  return mutateNodes(params, "rotate_nodes", (node) => {
    requireMixin(node, "rotation", "rotation");
    node.rotation = Number(params.rotation ?? 0);
    return { rotation: node.rotation };
  });
}

async function reorderNodes(params: Record<string, unknown>) {
  const order = String(params.order || "bringToFront");
  return mutateNodes(params, "reorder_nodes", (node) => {
    const parent = node.parent as AnyNode | null;
    if (!parent || !("children" in parent) || typeof parent.insertChild !== "function") throw new Error("Node has no reorderable parent.");
    const siblings = parent.children as SceneNode[];
    const currentIndex = siblings.indexOf(node);
    const targetIndex = order === "sendToBack" ? 0
      : order === "bringForward" ? Math.min(currentIndex + 1, siblings.length - 1)
        : order === "sendBackward" ? Math.max(currentIndex - 1, 0)
          : siblings.length - 1;
    parent.insertChild(targetIndex, node);
    return { order, index: targetIndex };
  });
}

async function setBlendMode(params: Record<string, unknown>) {
  return mutateNodes(params, "set_blend_mode", (node) => {
    requireMixin(node, "blendMode", "blend mode");
    node.blendMode = String(params.blendMode || "NORMAL") as any;
    return { blendMode: node.blendMode };
  });
}

async function setConstraints(params: Record<string, unknown>) {
  return mutateNodes(params, "set_constraints", (node) => {
    requireMixin(node, "constraints", "constraints");
    node.constraints = {
      horizontal: String(params.horizontal || node.constraints.horizontal || "MIN") as any,
      vertical: String(params.vertical || node.constraints.vertical || "MIN") as any
    };
    return { constraints: node.constraints };
  });
}

async function measureSpacing(params: Record<string, unknown>) {
  const nodes = await getNodesForMeasurement(params);
  const items = nodes.map((node) => {
    const bounds = requireBounds(node);
    return {
      nodeId: node.id,
      nodeName: node.name,
      type: node.type,
      bounds,
      center: {
        x: round(bounds.x + bounds.width / 2),
        y: round(bounds.y + bounds.height / 2)
      }
    };
  });
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const aRight = a.bounds.x + a.bounds.width;
      const bRight = b.bounds.x + b.bounds.width;
      const aBottom = a.bounds.y + a.bounds.height;
      const bBottom = b.bounds.y + b.bounds.height;
      const overlapX = a.bounds.x < bRight && b.bounds.x < aRight;
      const overlapY = a.bounds.y < bBottom && b.bounds.y < aBottom;
      pairs.push({
        a: a.nodeId,
        b: b.nodeId,
        horizontalGap: overlapX ? 0 : round(aRight <= b.bounds.x ? b.bounds.x - aRight : a.bounds.x - bRight),
        verticalGap: overlapY ? 0 : round(aBottom <= b.bounds.y ? b.bounds.y - aBottom : a.bounds.y - bBottom),
        overlaps: overlapX && overlapY,
        alignmentDelta: {
          left: round(b.bounds.x - a.bounds.x),
          centerX: round(b.center.x - a.center.x),
          right: round(bRight - aRight),
          top: round(b.bounds.y - a.bounds.y),
          centerY: round(b.center.y - a.center.y),
          bottom: round(bBottom - aBottom)
        }
      });
    }
  }
  const union = getBoundsUnion(nodes);
  return {
    count: items.length,
    union,
    nodes: items,
    pairs: params.includeOverlaps === false ? pairs.map(({ overlaps, ...pair }) => pair) : pairs
  };
}

async function alignDistribute(params: Record<string, unknown>) {
  const nodes = await getNodesFromParamsOrSelection(params);
  if (nodes.length === 0) throw new Error("No nodes selected or provided.");
  const align = params.align ? String(params.align) : "";
  const distribute = params.distribute ? String(params.distribute) : "";
  if (!align && !distribute) throw new Error("align or distribute is required.");

  const bounds = nodes.map((node) => requireBounds(node));
  const union = getBoundsUnion(nodes);
  if (!union) throw new Error("Nodes do not have measurable bounds.");

  if (align) {
    nodes.forEach((node, index) => {
      const box = bounds[index];
      if (align === "left") node.x = union.x;
      else if (align === "centerX") node.x = union.x + union.width / 2 - box.width / 2;
      else if (align === "right") node.x = union.x + union.width - box.width;
      else if (align === "top") node.y = union.y;
      else if (align === "centerY") node.y = union.y + union.height / 2 - box.height / 2;
      else if (align === "bottom") node.y = union.y + union.height - box.height;
    });
  }

  if (distribute) {
    if (nodes.length < 2) throw new Error("At least two nodes are required to distribute.");
    const axis = distribute === "vertical" ? "y" : "x";
    const size = distribute === "vertical" ? "height" : "width";
    const sorted = [...nodes].sort((a, b) => requireBounds(a)[axis] - requireBounds(b)[axis]);
    if (params.spacing != null) {
      let cursor = requireBounds(sorted[0])[axis];
      for (const node of sorted) {
        node[axis] = cursor;
        cursor += requireBounds(node)[size] + Number(params.spacing);
      }
    } else {
      const sortedBounds = sorted.map(requireBounds);
      const first = sortedBounds[0];
      const last = sortedBounds[sortedBounds.length - 1];
      const span = (last[axis] + last[size]) - first[axis];
      const totalSize = sortedBounds.reduce((sum, box) => sum + box[size], 0);
      const gap = (span - totalSize) / Math.max(1, sorted.length - 1);
      let cursor = first[axis];
      sorted.forEach((node) => {
        const box = requireBounds(node);
        node[axis] = cursor;
        cursor += box[size] + gap;
      });
    }
  }

  selectAndCommit(nodes);
  return {
    count: nodes.length,
    align: align || undefined,
    distribute: distribute || undefined,
    spacing: params.spacing,
    nodes: nodes.map((node) => ({ nodeId: node.id, nodeName: node.name, bounds: getBounds(node) }))
  };
}

async function setLayoutGrid(params: Record<string, unknown>) {
  const nodes = await getNodesFromParamsOrSelection(params);
  if (nodes.length === 0) throw new Error("nodeId or current selection is required.");
  const node = nodes[0];
  const anyNode = node as AnyNode;
  if (!("layoutGrids" in anyNode)) throw new Error("Node does not support layout grids.");
  const grid = parseLayoutGrid({ ...params, offset: params.offset ?? params.margin });
  anyNode.layoutGrids = [grid];
  selectAndCommit([node]);
  return { nodeId: node.id, nodeName: node.name, layoutGrids: anyNode.layoutGrids };
}

async function reparentNodes(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  return mutateNodes(params, "reparent_nodes", (node) => {
    parent.appendChild(node);
    return { parentId: parent.id };
  }, false);
}

async function batchRenameNodes(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  const pattern = String(params.pattern || "");
  const replacement = String(params.replacement || "");
  const prefix = String(params.prefix || "");
  const suffix = String(params.suffix || "");
  const start = Number(params.start ?? 1);
  const results = nodes.map((node, index) => {
    const oldName = node.name;
    let newName = pattern ? oldName.replace(new RegExp(pattern, params.regex === false ? "" : "g"), replacement) : oldName;
    if (prefix || suffix) newName = `${prefix}${newName}${suffix}`;
    if (params.numbered === true) newName = `${newName} ${start + index}`;
    node.name = newName;
    return { nodeId: node.id, oldName, newName };
  });
  selectAndCommit(nodes);
  return { count: results.length, results };
}

async function findReplaceText(params: Record<string, unknown>) {
  const root = params.nodeId ? await requireNode(String(params.nodeId)) : figma.currentPage;
  const find = String(params.find || params.query || "");
  const replace = String(params.replace || params.replacement || "");
  if (!find) throw new Error("find is required.");
  const useRegex = params.regex === true;
  const matcher = useRegex ? new RegExp(find, "g") : null;
  const results: unknown[] = [];
  await walk(root, async (node) => {
    if (node.type !== "TEXT") return;
    const text = node as TextNode;
    const original = text.characters;
    const next = matcher ? original.replace(matcher, replace) : original.split(find).join(replace);
    if (next === original) return;
    text.fontName = await loadFontWithFallback(isMixed(text.fontName) ? { family: "Inter", style: "Regular" } : text.fontName);
    text.characters = next;
    results.push({ nodeId: text.id, nodeName: text.name, oldText: original, newText: next });
  });
  figma.commitUndo();
  return { count: results.length, results };
}

async function setEffects(params: Record<string, unknown>) {
  const effects = parseEffects(params.effects);
  return mutateNodes(params, "set_effects", (node) => {
    requireMixin(node, "effects", "effects");
    node.effects = effects;
    return { effects: node.effects };
  });
}

async function createPaintStyle(params: Record<string, unknown>) {
  const style = figma.createPaintStyle();
  style.name = String(params.name || "Paint Style");
  style.paints = [makeSolidPaint(String(params.color || params.fillColor || "#18A0FB"), numberOrUndefined(params.opacity))];
  if (params.description) style.description = String(params.description);
  return serializeStyle(style);
}

async function createTextStyle(params: Record<string, unknown>) {
  const style = figma.createTextStyle();
  style.name = String(params.name || "Text Style");
  const fontName = await loadFontWithFallback({ family: String(params.fontFamily || "Inter"), style: String(params.fontStyle || "Regular") });
  style.fontName = fontName;
  if (params.fontSize != null) style.fontSize = Number(params.fontSize);
  if (params.lineHeight != null) style.lineHeight = { unit: "PIXELS", value: Number(params.lineHeight) };
  if (params.description) style.description = String(params.description);
  return serializeStyle(style);
}

async function createEffectStyle(params: Record<string, unknown>) {
  const style = figma.createEffectStyle();
  style.name = String(params.name || "Effect Style");
  style.effects = parseEffects(params.effects);
  if (params.description) style.description = String(params.description);
  return serializeStyle(style);
}

async function createGridStyle(params: Record<string, unknown>) {
  const style = figma.createGridStyle();
  style.name = String(params.name || "Grid Style");
  style.layoutGrids = [parseLayoutGrid(params)];
  if (params.description) style.description = String(params.description);
  return serializeStyle(style);
}

async function updatePaintStyle(params: Record<string, unknown>) {
  const style = await findStyle(params);
  if (!style || !("paints" in style)) throw new Error("Paint style not found.");
  if (params.name) style.name = String(params.name);
  (style as PaintStyle).paints = [makeSolidPaint(String(params.color || params.fillColor || "#18A0FB"), numberOrUndefined(params.opacity))];
  return serializeStyle(style);
}

async function deleteStyle(params: Record<string, unknown>) {
  const style = await findStyle(params);
  if (!style || typeof (style as AnyNode).remove !== "function") throw new Error("Style not found.");
  const result = serializeStyle(style);
  (style as AnyNode).remove();
  return { deleted: true, style: result };
}

async function applyStyleToNode(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  const style = await findStyle(params);
  if (!style) throw new Error("Style not found.");
  const styleType = String(params.styleType || inferStyleType(style));
  const anyNode = node as AnyNode;
  if (styleType === "fill" || styleType === "paint") anyNode.fillStyleId = style.id;
  else if (styleType === "stroke") anyNode.strokeStyleId = style.id;
  else if (styleType === "text") anyNode.textStyleId = style.id;
  else if (styleType === "effect") anyNode.effectStyleId = style.id;
  else if (styleType === "grid") anyNode.gridStyleId = style.id;
  else throw new Error(`Unsupported styleType: ${styleType}`);
  selectAndCommit([node]);
  return serializeNode(node, 0, "full");
}

async function bindVariableToNode(params: Record<string, unknown>) {
  const api = getVariablesApi();
  if (!api) throw new Error("Variables API is not available in this Figma runtime.");
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  const variable = await getVariable(String(params.variableId || params.variableName || ""));
  const field = String(params.field || params.property || "fills");
  const anyNode = node as AnyNode;
  if (typeof anyNode.setBoundVariable !== "function") throw new Error("Node does not support variable binding.");
  anyNode.setBoundVariable(field, variable);
  selectAndCommit([node]);
  return { nodeId: node.id, field, variable: serializeVariable(variable) };
}

async function createVariableCollection(params: Record<string, unknown>) {
  const api = requireVariablesApi();
  const collection = api.createVariableCollection(String(params.name || "Collection"));
  return serializeVariableCollection(collection);
}

async function addVariableMode(params: Record<string, unknown>) {
  const collection = await getVariableCollection(String(params.collectionId || params.collectionName || ""));
  const modeId = collection.addMode(String(params.modeName || params.name || "Mode"));
  return serializeVariableCollection(collection, modeId);
}

async function createVariable(params: Record<string, unknown>) {
  const api = requireVariablesApi();
  const collection = await getVariableCollection(String(params.collectionId || params.collectionName || ""));
  const variable = api.createVariable(String(params.name || "Variable"), collection, String(params.resolvedType || params.type || "COLOR") as any);
  return serializeVariable(variable);
}

async function setVariableValue(params: Record<string, unknown>) {
  const variable = await getVariable(String(params.variableId || params.variableName || ""));
  const collectionRef = params.collectionId || params.collectionName || (variable as any).variableCollectionId;
  const collection = await getVariableCollection(String(collectionRef || ""));
  const modeId = String(params.modeId || params.modeName || collection.defaultModeId);
  const resolvedModeId = collection.modes.find((mode: any) => mode.modeId === modeId || mode.name === modeId)?.modeId || modeId;
  variable.setValueForMode(resolvedModeId, parseVariableValue(params.value, variable.resolvedType));
  return serializeVariable(variable);
}

async function deleteVariable(params: Record<string, unknown>) {
  const variable = await getVariable(String(params.variableId || params.variableName || ""));
  const result = serializeVariable(variable);
  variable.remove();
  return { deleted: true, variable: result };
}

async function navigateToPage(params: Record<string, unknown>) {
  const page = findPage(params);
  await setCurrentPage(page);
  return { id: page.id, name: page.name };
}

async function addPage(params: Record<string, unknown>) {
  const page = figma.createPage();
  page.name = String(params.name || "New Page");
  if (params.setCurrent !== false) await setCurrentPage(page);
  return { id: page.id, name: page.name };
}

async function deletePage(params: Record<string, unknown>) {
  const page = findPage(params);
  if (figma.root.children.length <= 1) throw new Error("Cannot delete the only page.");
  if (page.id === figma.currentPage.id) {
    const next = figma.root.children.find((candidate) => candidate.id !== page.id);
    if (next) await setCurrentPage(next);
  }
  const result = { id: page.id, name: page.name, deleted: true };
  page.remove();
  return result;
}

async function renamePage(params: Record<string, unknown>) {
  const page = findPage(params);
  page.name = String(params.newName || params.name || "");
  return { id: page.id, name: page.name };
}

async function groupNodes(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  if (nodes.length < 2) throw new Error("At least two nodes are required.");
  const parent = params.parentId ? await getParentNode(params.parentId) : nodes[0].parent as ChildrenMixin;
  const group = figma.group(nodes, parent);
  if (params.name) group.name = String(params.name);
  selectAndCommit([group], true);
  return serializeNode(group, 1, "compact");
}

async function ungroupNodes(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  const results = [];
  for (const node of nodes) {
    if (node.type !== "GROUP") throw new Error(`Node ${node.id} is not a GROUP.`);
    const children = figma.ungroup(node as GroupNode);
    results.push({ groupId: node.id, children: children.map((child) => ({ id: child.id, name: child.name, type: child.type })) });
  }
  figma.commitUndo();
  return { results };
}

async function createComponentSet(params: Record<string, unknown>) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  if (nodes.length < 2) throw new Error("At least two component nodes are required.");
  if (typeof (figma as any).combineAsVariants !== "function") throw new Error("This Figma runtime does not support combineAsVariants.");
  for (const node of nodes) {
    if (node.type !== "COMPONENT") throw new Error(`Node ${node.id} is ${node.type}, not COMPONENT.`);
  }
  const parent = nodes[0].parent as BaseNode & ChildrenMixin;
  if (!parent || !("appendChild" in parent)) throw new Error("Component nodes must have a common parent.");
  for (const node of nodes) {
    if (node.parent !== parent) throw new Error("All component nodes must share the same parent.");
  }
  const componentSet = (figma as any).combineAsVariants(nodes as ComponentNode[], parent) as ComponentSetNode;
  if (params.name) componentSet.name = String(params.name);
  selectAndCommit([componentSet], true);
  return serializeNode(componentSet, 1, "compact");
}

async function swapComponent(params: Record<string, unknown>) {
  const instance = await requireSceneNode(String(params.nodeId || params.instanceId || getNodeIds(params)[0]));
  if (instance.type !== "INSTANCE") throw new Error("nodeId must point to an INSTANCE.");
  const component = await requireSceneNode(String(params.componentId));
  if (component.type !== "COMPONENT" && component.type !== "COMPONENT_SET") throw new Error("componentId must point to a component.");
  (instance as InstanceNode).swapComponent(component as ComponentNode);
  selectAndCommit([instance]);
  return serializeNode(instance, 1, "compact");
}

async function detachInstance(params: Record<string, unknown>) {
  const instance = await requireSceneNode(String(params.nodeId || params.instanceId || getNodeIds(params)[0]));
  if (instance.type !== "INSTANCE") throw new Error("nodeId must point to an INSTANCE.");
  const node = (instance as InstanceNode).detachInstance();
  selectAndCommit([node], true);
  return serializeNode(node, 1, "compact");
}

async function setReactions(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  if (!("reactions" in node)) throw new Error("Node does not support prototype reactions.");
  (node as AnyNode).reactions = Array.isArray(params.reactions) ? params.reactions : [];
  selectAndCommit([node]);
  return { nodeId: node.id, reactions: (node as AnyNode).reactions };
}

async function removeReactions(params: Record<string, unknown>) {
  const node = await requireSceneNode(String(params.nodeId || getNodeIds(params)[0]));
  if (!("reactions" in node)) throw new Error("Node does not support prototype reactions.");
  (node as AnyNode).reactions = [];
  selectAndCommit([node]);
  return { nodeId: node.id, reactions: [] };
}

async function getScreenshot(params: Record<string, unknown>) {
  const nodeIds = getNodeIds(params);
  const nodes = nodeIds.length > 0 ? await requireSceneNodes(nodeIds) : [figma.currentPage.selection[0] || figma.currentPage];
  const format = String(params.format || "PNG").toUpperCase() as "PNG" | "JPG" | "SVG" | "PDF";
  const scale = Number(params.scale || 1);
  const exports = [];
  for (const node of nodes) {
    const bytes = await (node as AnyNode).exportAsync({
      format,
      constraint: format === "SVG" || format === "PDF" ? undefined : { type: "SCALE", value: scale }
    });
    exports.push({
      nodeId: node.id,
      nodeName: node.name,
      format,
      width: "width" in node ? round((node as AnyNode).width) : undefined,
      height: "height" in node ? round((node as AnyNode).height) : undefined,
      base64: bytesToBase64(bytes)
    });
  }
  return { exports };
}

async function exportFramesToPdf(params: Record<string, unknown>) {
  return getScreenshot({ ...params, format: "PDF" });
}

async function generateDiagram(params: Record<string, unknown>) {
  const parent = await getParentNode(params.parentId);
  const specs = Array.isArray(params.nodes) ? params.nodes as Record<string, unknown>[] : [];
  const edges = Array.isArray(params.edges) ? params.edges as Record<string, unknown>[] : [];
  if (specs.length === 0) throw new Error("nodes must be a non-empty array.");

  const maxX = Math.max(...specs.map((item) => Number(item.x ?? 0) + Number(item.width ?? 180)));
  const maxY = Math.max(...specs.map((item) => Number(item.y ?? 0) + Number(item.height ?? 72)));
  const frame = figma.createFrame();
  frame.name = String(params.name || "Diagram");
  frame.x = Number(params.x ?? 0);
  frame.y = Number(params.y ?? 0);
  frame.resize(Number(params.width ?? Math.max(640, maxX + 80)), Number(params.height ?? Math.max(360, maxY + 80)));
  frame.fills = [makeSolidPaint(String(params.backgroundColor || "#FFFFFF"))];
  parent.appendChild(frame);

  const createdNodes: SceneNode[] = [frame];
  const nodeMap: Record<string, { boxId: string; labelId: string; x: number; y: number; width: number; height: number }> = {};
  for (const spec of specs) {
    const id = String(spec.id || "");
    if (!id) throw new Error("Each diagram node requires an id.");
    const label = String(spec.label || id);
    const width = Number(spec.width ?? 180);
    const height = Number(spec.height ?? 72);
    const box = figma.createFrame();
    box.name = `Node: ${label}`;
    box.x = Number(spec.x ?? 0);
    box.y = Number(spec.y ?? 0);
    box.resize(width, height);
    box.fills = [makeSolidPaint(String(spec.fillColor || "#F8FAFC"))];
    box.strokes = [makeSolidPaint(String(spec.strokeColor || "#CBD5E1"))];
    box.strokeWeight = Number(spec.strokeWeight ?? 1);
    box.cornerRadius = Number(spec.cornerRadius ?? 8);
    frame.appendChild(box);

    const text = await makeTextNode({
      text: label,
      name: `Label: ${label}`,
      x: 12,
      y: Math.max(8, height / 2 - 10),
      width: Math.max(1, width - 24),
      fontSize: Number(spec.fontSize ?? 14),
      fillColor: String(spec.textColor || "#0F172A")
    });
    box.appendChild(text);

    nodeMap[id] = { boxId: box.id, labelId: text.id, x: box.x, y: box.y, width, height };
    createdNodes.push(box);
  }

  const edgeResults = [];
  for (const edge of edges) {
    const from = nodeMap[String(edge.from || "")];
    const to = nodeMap[String(edge.to || "")];
    if (!from || !to) throw new Error(`Diagram edge references an unknown node: ${String(edge.from)} -> ${String(edge.to)}`);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const line = figma.createLine();
    line.name = `Edge: ${String(edge.from)} -> ${String(edge.to)}`;
    line.x = start.x;
    line.y = start.y;
    line.resize(Math.max(1, distance(start, end)), 0);
    line.rotation = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    line.strokes = [makeSolidPaint(String(edge.color || "#64748B"))];
    line.strokeWeight = Number(edge.strokeWeight ?? 2);
    frame.appendChild(line);
    const result: Record<string, unknown> = { from: edge.from, to: edge.to, lineId: line.id };

    if (edge.label) {
      const label = await makeTextNode({
        text: String(edge.label),
        name: `Edge Label: ${String(edge.label)}`,
        x: (start.x + end.x) / 2 + 8,
        y: (start.y + end.y) / 2 - 10,
        fontSize: 12,
        fillColor: "#475569"
      });
      frame.appendChild(label);
      result.labelId = label.id;
    }
    edgeResults.push(result);
  }

  selectAndCommit([frame], true);
  return { frame: await serializeNode(frame, 1, "compact"), nodeMap, edges: edgeResults };
}

async function generateScreen(params: Record<string, unknown>) {
  const elements = Array.isArray(params.elements) ? params.elements as Record<string, unknown>[] : [];
  if (elements.length === 0) throw new Error("elements must be a non-empty array.");

  let screen: FrameNode;
  if (params.screenKey && params.parentId) {
    const existing = await requireSceneNode(String(params.parentId));
    if (!("appendChild" in existing) || typeof (existing as AnyNode).resize !== "function") throw new Error("screenKey must resolve to a frame-like node.");
    screen = existing as FrameNode;
    if (params.name) screen.name = String(params.name);
    if (params.width != null || params.height != null) screen.resize(Number(params.width ?? screen.width), Number(params.height ?? screen.height));
    screen.fills = [makeSolidPaint(String(params.backgroundColor || "#FFFFFF"))];
  } else {
    const parent = await getParentNode(params.parentId);
    screen = figma.createFrame();
    screen.name = String(params.name || "Generated Screen");
    screen.x = Number(params.x ?? 0);
    screen.y = Number(params.y ?? 0);
    screen.resize(Number(params.width ?? 1440), Number(params.height ?? 1024));
    screen.fills = [makeSolidPaint(String(params.backgroundColor || "#FFFFFF"))];
    parent.appendChild(screen);
  }

  const created: Array<{ key?: string; id: string; name: string; type: string }> = [];
  for (const element of elements) {
    const node = await createGeneratedElement(screen, element);
    created.push({
      key: element.key ? String(element.key) : element.id ? String(element.id) : undefined,
      id: node.id,
      name: node.name,
      type: node.type
    });
  }

  selectAndCommit([screen], true);
  return { screen: await serializeNode(screen, 1, "compact"), created };
}

async function requireNode(nodeId: string) {
  const node = await figma.getNodeByIdAsync(normalizeNodeId(nodeId));
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

async function requireSceneNode(nodeId: string) {
  const node = await requireNode(nodeId);
  if (!("remove" in node)) throw new Error(`Node ${nodeId} is not a scene node.`);
  return node as SceneNode;
}

async function requireSceneNodes(nodeIds: string[]) {
  if (nodeIds.length === 0) throw new Error("nodeIds is required.");
  return Promise.all(nodeIds.map(requireSceneNode));
}

function getNodeIds(params: Record<string, unknown>) {
  if (Array.isArray(params.nodeIds)) return params.nodeIds.map((id) => normalizeNodeId(String(id)));
  if (typeof params.nodeId === "string" && params.nodeId) return [normalizeNodeId(params.nodeId)];
  return [];
}

async function getSearchRoot(params: Record<string, unknown>) {
  return typeof params.nodeId === "string" && params.nodeId ? await requireNode(params.nodeId) : figma.currentPage;
}

async function getParentNode(parentId: unknown) {
  if (!parentId) return figma.currentPage;
  const parent = await requireNode(String(parentId));
  if (!("appendChild" in parent)) throw new Error(`Node ${String(parentId)} cannot contain children.`);
  return parent as BaseNode & ChildrenMixin;
}

async function getNodesFromParamsOrSelection(params: Record<string, unknown>) {
  const nodeIds = getNodeIds(params);
  if (nodeIds.length > 0) return requireSceneNodes(nodeIds);
  return [...figma.currentPage.selection] as SceneNode[];
}

async function getNodesForMeasurement(params: Record<string, unknown>) {
  if (Array.isArray(params.nodeIds) && params.nodeIds.length > 0) return requireSceneNodes(getNodeIds(params));
  if (typeof params.nodeId === "string" && params.nodeId) {
    const node = await requireSceneNode(params.nodeId);
    if ("children" in node) return [...node.children].filter((child) => "remove" in child) as SceneNode[];
    return [node];
  }
  return [...figma.currentPage.selection] as SceneNode[];
}

function requireBounds(node: SceneNode) {
  const bounds = getBounds(node);
  if (!bounds) throw new Error(`Node ${node.id} does not have measurable bounds.`);
  return bounds;
}

function getBoundsUnion(nodes: SceneNode[]) {
  if (nodes.length === 0) return undefined;
  const bounds = nodes.map(requireBounds);
  const minX = Math.min(...bounds.map((box) => box.x));
  const minY = Math.min(...bounds.map((box) => box.y));
  const maxX = Math.max(...bounds.map((box) => box.x + box.width));
  const maxY = Math.max(...bounds.map((box) => box.y + box.height));
  return { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

async function makeTextNode(params: Record<string, unknown>) {
  const fontName = await loadFontWithFallback({
    family: String(params.fontFamily || "Inter"),
    style: String(params.fontStyle || "Regular")
  });
  const text = figma.createText();
  text.fontName = fontName;
  text.fontSize = Number(params.fontSize ?? 16);
  text.characters = String(params.text || "");
  text.name = String(params.name || params.text || "Text");
  text.x = Number(params.x ?? 0);
  text.y = Number(params.y ?? 0);
  if (params.width != null) text.resize(Number(params.width), text.height);
  if (params.textAlignHorizontal) text.textAlignHorizontal = String(params.textAlignHorizontal) as any;
  if (params.textAlignVertical) text.textAlignVertical = String(params.textAlignVertical) as any;
  text.fills = [makeSolidPaint(String(params.fillColor || params.color || "#111827"))];
  return text;
}

async function createGeneratedElement(parent: BaseNode & ChildrenMixin, spec: Record<string, unknown>): Promise<SceneNode> {
  const type = String(spec.type || "frame");
  const name = String(spec.name || spec.label || spec.text || type);
  const x = Number(spec.x ?? 0);
  const y = Number(spec.y ?? 0);
  const width = Number(spec.width ?? (type === "text" ? 240 : 320));
  const height = Number(spec.height ?? (type === "text" ? 32 : 120));

  if (type === "text") {
    const text = await makeTextNode({
      ...spec,
      name,
      text: spec.text || spec.label || name,
      x,
      y,
      width,
      fillColor: spec.fillColor || spec.textColor || "#111827"
    });
    parent.appendChild(text);
    return text;
  }

  if (type === "rectangle" || type === "imagePlaceholder") {
    const rect = figma.createRectangle();
    rect.name = name;
    rect.x = x;
    rect.y = y;
    rect.resize(width, height);
    rect.fills = [makeSolidPaint(String(spec.fillColor || (type === "imagePlaceholder" ? "#E5E7EB" : "#18A0FB")))];
    if (spec.cornerRadius != null) rect.cornerRadius = Number(spec.cornerRadius);
    parent.appendChild(rect);
    if (type === "imagePlaceholder" && spec.label !== false) {
      const label = await makeTextNode({
        text: String(spec.text || "Image"),
        name: `${name} Label`,
        x: x + 16,
        y: y + height / 2 - 10,
        width: Math.max(1, width - 32),
        fontSize: 14,
        fillColor: "#64748B",
        textAlignHorizontal: "CENTER"
      });
      parent.appendChild(label);
    }
    return rect;
  }

  if (type === "ellipse") {
    const ellipse = figma.createEllipse();
    ellipse.name = name;
    ellipse.x = x;
    ellipse.y = y;
    ellipse.resize(width, height);
    ellipse.fills = [makeSolidPaint(String(spec.fillColor || "#18A0FB"))];
    parent.appendChild(ellipse);
    return ellipse;
  }

  const frame = figma.createFrame();
  frame.name = name;
  frame.x = x;
  frame.y = y;
  frame.resize(width, height);
  frame.cornerRadius = Number(spec.cornerRadius ?? (type === "button" || type === "input" || type === "card" ? 8 : 0));
  frame.fills = [makeSolidPaint(String(spec.fillColor || defaultGeneratedFill(type)))];
  if (type === "input" || type === "card" || spec.strokeColor) {
    frame.strokes = [makeSolidPaint(String(spec.strokeColor || (type === "card" ? "#E5E7EB" : "#CBD5E1")))];
    frame.strokeWeight = Number(spec.strokeWeight ?? 1);
  }
  if (spec.key || spec.id) frame.setPluginData("generatedKey", String(spec.key || spec.id));
  parent.appendChild(frame);

  if (type === "button") {
    const label = await makeTextNode({
      text: String(spec.text || spec.label || name),
      name: `${name} Label`,
      x: 16,
      y: height / 2 - Number(spec.fontSize ?? 14) / 2,
      width: Math.max(1, width - 32),
      fontSize: Number(spec.fontSize ?? 14),
      fillColor: String(spec.textColor || "#FFFFFF"),
      textAlignHorizontal: "CENTER"
    });
    frame.appendChild(label);
  } else if (type === "input") {
    const placeholder = await makeTextNode({
      text: String(spec.placeholder || spec.text || "Placeholder"),
      name: `${name} Placeholder`,
      x: 14,
      y: height / 2 - 8,
      width: Math.max(1, width - 28),
      fontSize: Number(spec.fontSize ?? 14),
      fillColor: String(spec.textColor || "#64748B")
    });
    frame.appendChild(placeholder);
  }

  if (Array.isArray(spec.children)) {
    for (const child of spec.children as Record<string, unknown>[]) await createGeneratedElement(frame, child);
  }

  return frame;
}

function defaultGeneratedFill(type: string) {
  if (type === "button") return "#111827";
  if (type === "input" || type === "card" || type === "frame") return "#FFFFFF";
  return "#F8FAFC";
}

function normalizeNodeId(nodeId: string) {
  return nodeId.includes(":") ? nodeId : nodeId.replace(/-/g, ":");
}

function makeSolidPaint(colorInput: string, opacity?: number): SolidPaint {
  const { r, g, b, a } = hexToRgba(colorInput);
  const paint: SolidPaint = { type: "SOLID", color: { r, g, b } };
  const finalOpacity = opacity == null ? a : opacity;
  if (finalOpacity !== 1) paint.opacity = finalOpacity;
  return paint;
}

function hexToRgba(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean, 16);
  if (clean.length === 8) {
    return { r: ((value >> 24) & 255) / 255, g: ((value >> 16) & 255) / 255, b: ((value >> 8) & 255) / 255, a: (value & 255) / 255 };
  }
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255, a: 1 };
}

function applyAutoLayout(frame: AnyNode, params: Record<string, unknown>) {
  if (params.layoutMode) frame.layoutMode = params.layoutMode as "NONE" | "HORIZONTAL" | "VERTICAL";
  if (!frame.layoutMode || frame.layoutMode === "NONE") return;
  if (params.paddingTop != null) frame.paddingTop = Number(params.paddingTop);
  if (params.paddingRight != null) frame.paddingRight = Number(params.paddingRight);
  if (params.paddingBottom != null) frame.paddingBottom = Number(params.paddingBottom);
  if (params.paddingLeft != null) frame.paddingLeft = Number(params.paddingLeft);
  if (params.itemSpacing != null) frame.itemSpacing = Number(params.itemSpacing);
  if (params.primaryAxisAlignItems) frame.primaryAxisAlignItems = params.primaryAxisAlignItems;
  if (params.counterAxisAlignItems) frame.counterAxisAlignItems = params.counterAxisAlignItems;
  if (params.layoutWrap) frame.layoutWrap = params.layoutWrap;
}

async function loadFontWithFallback(fontName: FontName) {
  try {
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch {
    const fallback = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

async function serializeNode(node: BaseNode, depth: number, detail: DetailLevel): Promise<unknown> {
  const anyNode = node as AnyNode;
  const out: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };
  const bounds = getBounds(node);
  if (bounds) out.bounds = bounds;
  if ("visible" in anyNode) out.visible = anyNode.visible;
  if ("locked" in anyNode) out.locked = anyNode.locked;
  if (detail !== "minimal") {
    out.pluginData = typeof anyNode.getPluginData === "function" ? {
      screenKey: anyNode.getPluginData("screenKey") || undefined,
      route: anyNode.getPluginData("route") || undefined,
      screenType: anyNode.getPluginData("screenType") || undefined
    } : {};
    out.styles = await serializeStyles(anyNode, detail);
  }
  if (node.type === "TEXT") {
    const text = node as TextNode;
    out.characters = text.characters;
    if (detail === "full") {
      out.text = {
        fontName: isMixed(text.fontName) ? "mixed" : text.fontName,
        fontSize: isMixed(text.fontSize) ? "mixed" : text.fontSize,
        lineHeight: isMixed(text.lineHeight) ? "mixed" : text.lineHeight,
        letterSpacing: isMixed(text.letterSpacing) ? "mixed" : text.letterSpacing,
        textAlignHorizontal: isMixed(text.textAlignHorizontal) ? "mixed" : text.textAlignHorizontal
      };
    }
  }
  if (depth > 0 && "children" in anyNode) {
    out.children = await Promise.all(anyNode.children.map((child: BaseNode) => serializeNode(child, depth - 1, detail)));
  }
  return out;
}

async function serializeStyles(node: AnyNode, detail: DetailLevel) {
  const styles: Record<string, unknown> = {};
  if ("fills" in node && !isMixed(node.fills)) styles.fills = serializePaints(node.fills);
  if ("strokes" in node && !isMixed(node.strokes)) styles.strokes = serializePaints(node.strokes);
  if ("opacity" in node && node.opacity !== 1) styles.opacity = node.opacity;
  if ("cornerRadius" in node && node.cornerRadius !== 0 && !isMixed(node.cornerRadius)) styles.cornerRadius = node.cornerRadius;
  if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) styles.effects = node.effects;
  if (detail === "full" && "layoutMode" in node) {
    styles.autoLayout = {
      layoutMode: node.layoutMode,
      paddingTop: node.paddingTop,
      paddingRight: node.paddingRight,
      paddingBottom: node.paddingBottom,
      paddingLeft: node.paddingLeft,
      itemSpacing: node.itemSpacing,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems
    };
  }
  return styles;
}

function serializePaints(paints: readonly Paint[]) {
  return paints.map((paint) => {
    if (paint.type !== "SOLID") return { type: paint.type };
    const solid = paint as SolidPaint;
    const opacity = solid.opacity ?? 1;
    return opacity === 1 ? toHex(solid.color) : `${toHex(solid.color)}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
  });
}

function getBounds(node: BaseNode) {
  const anyNode = node as AnyNode;
  if ("x" in anyNode && "y" in anyNode && "width" in anyNode && "height" in anyNode) {
    return { x: round(anyNode.x), y: round(anyNode.y), width: round(anyNode.width), height: round(anyNode.height) };
  }
  return undefined;
}

function serializeStyle(style: any) {
  return {
    id: style.id,
    key: style.key,
    name: style.name,
    type: style.type,
    description: style.description || undefined,
    paints: style.paints ? serializePaints(style.paints) : undefined,
    fontName: style.fontName || undefined,
    fontSize: style.fontSize || undefined,
    effects: style.effects || undefined,
    layoutGrids: style.layoutGrids || undefined
  };
}

function serializeVariableCollection(collection: any, addedModeId?: string) {
  return {
    id: collection.id,
    key: collection.key,
    name: collection.name,
    defaultModeId: collection.defaultModeId,
    addedModeId,
    modes: collection.modes
  };
}

function serializeVariable(variable: any) {
  return {
    id: variable.id,
    key: variable.key,
    name: variable.name,
    resolvedType: variable.resolvedType,
    variableCollectionId: variable.variableCollectionId,
    valuesByMode: variable.valuesByMode
  };
}

function serializeComponent(component: ComponentNode) {
  return { id: component.id, key: component.key, name: component.name, description: component.description || undefined, bounds: getBounds(component) };
}

async function getLocalStyles(kind: "Paint" | "Text" | "Effect" | "Grid") {
  const asyncName = `getLocal${kind}StylesAsync`;
  const syncName = `getLocal${kind}Styles`;
  const anyFigma = figma as any;
  if (typeof anyFigma[asyncName] === "function") return anyFigma[asyncName]();
  if (typeof anyFigma[syncName] === "function") return anyFigma[syncName]();
  return [];
}

async function findStyle(params: Record<string, unknown>) {
  const id = String(params.styleId || params.id || "");
  const name = String(params.styleName || params.name || "");
  const styles = [
    ...(await getLocalStyles("Paint")),
    ...(await getLocalStyles("Text")),
    ...(await getLocalStyles("Effect")),
    ...(await getLocalStyles("Grid"))
  ];
  return styles.find((style: any) => style.id === id || style.key === id || (name && style.name === name));
}

function inferStyleType(style: any) {
  if ("fontName" in style) return "text";
  if ("effects" in style) return "effect";
  if ("layoutGrids" in style) return "grid";
  return "paint";
}

function getVariablesApi() {
  return (figma as any).variables;
}

function requireVariablesApi() {
  const api = getVariablesApi();
  if (!api) throw new Error("Variables API is not available in this Figma runtime.");
  return api;
}

async function callMaybeAsync(api: any, methodBase: string) {
  const asyncName = `${methodBase}Async`;
  if (typeof api[asyncName] === "function") return api[asyncName]();
  if (typeof api[methodBase] === "function") return api[methodBase]();
  return [];
}

async function getVariableCollection(idOrName: string) {
  const api = requireVariablesApi();
  const collections = await callMaybeAsync(api, "getLocalVariableCollections");
  const collection = collections.find((item: any) => item.id === idOrName || item.name === idOrName) || collections[0];
  if (!collection) throw new Error("Variable collection not found.");
  return collection;
}

async function getVariable(idOrName: string) {
  const api = requireVariablesApi();
  if (idOrName && typeof api.getVariableByIdAsync === "function") {
    const variable = await api.getVariableByIdAsync(idOrName);
    if (variable) return variable;
  }
  const variables = await callMaybeAsync(api, "getLocalVariables");
  const variable = variables.find((item: any) => item.id === idOrName || item.name === idOrName);
  if (!variable) throw new Error("Variable not found.");
  return variable;
}

function parseVariableValue(value: unknown, type: string) {
  if (type === "COLOR" && typeof value === "string") {
    const { r, g, b, a } = hexToRgba(value);
    return { r, g, b, a };
  }
  return value;
}

function parseEffects(value: unknown): Effect[] {
  if (Array.isArray(value)) return value as Effect[];
  return [];
}

function parseLayoutGrid(params: Record<string, unknown>): LayoutGrid {
  const pattern = String(params.pattern || "COLUMNS");
  return {
    pattern: pattern as any,
    sectionSize: Number(params.sectionSize || 8),
    visible: params.visible !== false,
    color: hexToRgbaPaint(String(params.color || "#FF000033")),
    alignment: String(params.alignment || "MIN") as any,
    gutterSize: Number(params.gutterSize || 0),
    offset: Number(params.offset || 0),
    count: Number(params.count || 5)
  } as LayoutGrid;
}

function hexToRgbaPaint(color: string) {
  const { r, g, b, a } = hexToRgba(color);
  return { r, g, b, a };
}

function findPage(params: Record<string, unknown>) {
  const pageId = String(params.pageId || "");
  const pageName = String(params.pageName || params.name || "");
  const page = figma.root.children.find((candidate) => candidate.id === pageId || (!!pageName && candidate.name === pageName));
  if (!page) throw new Error("Page not found.");
  return page;
}

async function setCurrentPage(page: PageNode) {
  if (typeof (figma as any).setCurrentPageAsync === "function") await (figma as any).setCurrentPageAsync(page);
  else figma.currentPage = page;
}

async function mutateNodes(
  params: Record<string, unknown>,
  type: string,
  mutate: (node: AnyNode) => unknown,
  select = true
) {
  const nodes = await requireSceneNodes(getNodeIds(params));
  const results = [];
  for (const node of nodes) {
    try {
      results.push({ nodeId: node.id, nodeName: node.name, ok: true, ...(mutate(node as AnyNode) as Record<string, unknown>) });
    } catch (error) {
      results.push({ nodeId: node.id, nodeName: node.name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (select) figma.currentPage.selection = nodes;
  figma.commitUndo();
  return { type, count: results.length, results };
}

function requireMixin(node: AnyNode, property: string, label: string) {
  if (!(property in node)) throw new Error(`Node does not support ${label}.`);
}

function setNodePositionAndSize(node: AnyNode, params: Record<string, unknown>, defaultWidth: number, defaultHeight: number) {
  node.x = Number(params.x ?? 0);
  node.y = Number(params.y ?? 0);
  if (typeof node.resize === "function") node.resize(Number(params.width ?? defaultWidth), Number(params.height ?? defaultHeight));
}

function selectAndCommit(nodes: SceneNode[], zoom = false) {
  figma.currentPage.selection = nodes;
  if (zoom) figma.viewport.scrollAndZoomIntoView(nodes);
  figma.commitUndo();
}

async function walk(node: BaseNode, visitor: (node: BaseNode) => Promise<void>) {
  await visitor(node);
  if ("children" in node) {
    for (const child of node.children) await walk(child, visitor);
  }
}

async function loadAllPagesForTraversal() {
  if (typeof (figma as any).loadAllPagesAsync === "function") {
    await (figma as any).loadAllPagesAsync();
    return;
  }

  await Promise.all(figma.root.children.map((page) => {
    const load = (page as AnyNode).loadAsync;
    return typeof load === "function" ? load.call(page) : Promise.resolve();
  }));
}

function parseDetail(value: unknown): DetailLevel {
  return value === "minimal" || value === "compact" || value === "full" ? value : "compact";
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function isMixed(value: unknown) {
  return typeof value === "symbol";
}

function toHex(color: RGB) {
  return `#${[color.r, color.g, color.b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

function numberOrUndefined(value: unknown) {
  return value == null ? undefined : Number(value);
}

function base64ToBytes(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}
