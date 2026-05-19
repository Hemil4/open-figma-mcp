import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer, type WebSocketConnection } from "ws";

type BridgeStatus = {
  connected: boolean;
  host: string;
  port: number;
  pendingRequests: number;
  lastPluginStatus: unknown;
};

type PendingRequest = {
  command: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type PluginMessage = {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  type?: string;
  payload?: unknown;
};

export class FigmaBridge {
  private readonly httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "*"
      });
      res.end();
      return;
    }

    if (req.url === "/health") {
      console.error("[open-figma-mcp] health check received");
      res.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "application/json"
      });
      res.end(JSON.stringify({ ok: true, service: "open-figma-mcp" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  private readonly wss: WebSocketServer;
  private readonly pending = new Map<string, PendingRequest>();
  private plugin: WebSocketConnection | null = null;
  private counter = 0;
  private lastPluginStatus: unknown = null;

  constructor(
    private readonly port = 8765,
    private readonly host = "127.0.0.1"
  ) {
    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: 100 * 1024 * 1024
    });

    this.httpServer.listen(port, host, () => {
      console.error(`[open-figma-mcp] bridge listening on http://${host}:${port}`);
    });

    this.wss.on("connection", (socket) => {
      if (this.plugin && this.plugin.readyState === WebSocket.OPEN) {
        console.error("[open-figma-mcp] replacing existing Figma plugin connection");
        this.plugin.close(1000, "replaced by newer Figma plugin connection");
      }

      this.plugin = socket;
      console.error(`[open-figma-mcp] Figma plugin connected on ws://${this.host}:${this.port}/ws`);

      socket.on("message", (raw) => {
        this.handleMessage(raw.toString());
      });

      socket.on("close", () => {
        if (this.plugin === socket) {
          this.plugin = null;
          console.error("[open-figma-mcp] Figma plugin disconnected");
          this.rejectAllPending("Figma plugin disconnected.");
        }
      });
    });
  }

  status(): BridgeStatus {
    return {
      connected: this.plugin?.readyState === WebSocket.OPEN,
      host: this.host,
      port: this.port,
      pendingRequests: this.pending.size,
      lastPluginStatus: this.lastPluginStatus
    };
  }

  request(command: string, params: Record<string, unknown> = {}, timeoutMs = 30000) {
    if (!this.plugin || this.plugin.readyState !== WebSocket.OPEN) {
      throw new Error("Figma plugin is not connected. Start this MCP server, then run the plugin in Figma Desktop.");
    }

    const id = this.nextId();
    const payload = { id, command, params };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Figma plugin response to ${command}.`));
      }, timeoutMs);

      this.pending.set(id, { command, resolve, reject, timeout });

      try {
        this.plugin?.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close() {
    this.rejectAllPending("Figma bridge closed.");
    this.plugin?.close(1000, "bridge closed");
    this.wss.close();
    this.httpServer.close();
  }

  private nextId() {
    this.counter += 1;
    return `req-${Date.now()}-${this.counter}`;
  }

  private handleMessage(raw: string) {
    let message: PluginMessage;

    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "plugin_status") {
      this.lastPluginStatus = message.payload ?? message;
      if (typeof message.payload === "object" && message.payload) {
        const status = message.payload as { fileName?: string; pageName?: string; selectionCount?: number };
        console.error(
          `[open-figma-mcp] status file="${status.fileName || "unknown"}" page="${status.pageName || "unknown"}" selection=${status.selectionCount ?? 0}`
        );
      }
      return;
    }

    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(message.error || `${pending.command} failed in Figma plugin.`));
  }

  private rejectAllPending(reason: string) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
