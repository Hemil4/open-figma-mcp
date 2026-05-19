import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export class ScreenRegistryStore {
    filePath;
    constructor(filePath = process.env.FIGMA_MCP_REGISTRY_PATH ||
        path.join(process.cwd(), ".open-figma-mcp", "screen-registry.json")) {
        this.filePath = filePath;
    }
    async load() {
        try {
            const raw = await readFile(this.filePath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return this.empty();
        }
    }
    async save(registry) {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        registry.updatedAt = new Date().toISOString();
        await writeFile(this.filePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
        return registry;
    }
    async findScreen(key) {
        const registry = await this.load();
        const normalized = normalizeScreenKey(key);
        return registry.screens.find((screen) => normalizeScreenKey(screen.key) === normalized);
    }
    async replace(projectName, screens) {
        return this.save({
            version: 1,
            projectName,
            updatedAt: new Date().toISOString(),
            screens
        });
    }
    empty() {
        return {
            version: 1,
            projectName: "Untitled",
            updatedAt: new Date().toISOString(),
            screens: []
        };
    }
}
export function normalizeScreenKey(key) {
    return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function normalizeNodeId(nodeId) {
    return nodeId.includes(":") ? nodeId : nodeId.replace(/-/g, ":");
}
