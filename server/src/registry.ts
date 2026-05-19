import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScreenInput = {
  key: string;
  title: string;
  route?: string;
  type?: string;
  width?: number;
  height?: number;
};

export type ScreenEntry = ScreenInput & {
  index: number;
  figmaNodeId: string;
  figmaName: string;
  pageId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenRegistry = {
  version: 1;
  projectName: string;
  updatedAt: string;
  screens: ScreenEntry[];
};

export class ScreenRegistryStore {
  constructor(
    readonly filePath = process.env.FIGMA_MCP_REGISTRY_PATH ||
      path.join(process.cwd(), ".open-figma-mcp", "screen-registry.json")
  ) {}

  async load(): Promise<ScreenRegistry> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as ScreenRegistry;
    } catch {
      return this.empty();
    }
  }

  async save(registry: ScreenRegistry) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    registry.updatedAt = new Date().toISOString();
    await writeFile(this.filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    return registry;
  }

  async findScreen(key: string) {
    const registry = await this.load();
    const normalized = normalizeScreenKey(key);
    return registry.screens.find((screen) => normalizeScreenKey(screen.key) === normalized);
  }

  async replace(projectName: string, screens: ScreenEntry[]) {
    return this.save({
      version: 1,
      projectName,
      updatedAt: new Date().toISOString(),
      screens
    });
  }

  empty(): ScreenRegistry {
    return {
      version: 1,
      projectName: "Untitled",
      updatedAt: new Date().toISOString(),
      screens: []
    };
  }
}

export function normalizeScreenKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeNodeId(nodeId: string) {
  return nodeId.includes(":") ? nodeId : nodeId.replace(/-/g, ":");
}
