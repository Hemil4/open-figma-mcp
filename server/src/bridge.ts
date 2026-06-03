import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer, type WebSocketConnection } from "ws";

type BridgeStatus = {
  connected: boolean;
  mode: "owner";
  host: string;
  port: number;
  peers: number;
  pendingRequests: number;
  lastPluginStatus: unknown;
};

type PendingRequest = {
  command: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type RoutedRequest = {
  peerId: string;
  originalId: string;
  command: string;
  timeout: ReturnType<typeof setTimeout>;
};

type PeerEntry = {
  id: string;
  socket: WebSocketConnection;
  routedIds: Set<string>;
};

type PluginMessage = {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  type?: string;
  payload?: unknown;
  command?: string;
  params?: Record<string, unknown>;
  role?: string;
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
      res.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "application/json"
      });
      res.end(JSON.stringify({ ok: true, service: "open-figma-mcp", mode: "owner", peers: this.peers.size, plugin: this.plugin?.readyState === WebSocket.OPEN }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });
  private readonly wss: WebSocketServer;
  private readonly ownPending = new Map<string, PendingRequest>();
  private readonly routedPending = new Map<string, RoutedRequest>();
  private readonly peers = new Map<string, PeerEntry>();
  private plugin: WebSocketConnection | null = null;
  private counter = 0;
  private peerCounter = 0;
  private lastPluginStatus: unknown = null;

  private constructor(
    private readonly port: number,
    private readonly host: string
  ) {
    this.wss = new WebSocketServer({
      server: this.httpServer,
      maxPayload: 100 * 1024 * 1024
    });

    this.wss.on("connection", (socket) => this.handleConnection(socket));
    this.wss.on("error", (err) => {
      const code = (err as Error & { code?: string }).code;
      if (code === "EADDRINUSE") return;
      console.error("[open-figma-mcp] WebSocket server error:", err);
    });
  }

  static create(port: number, host = "127.0.0.1"): Promise<FigmaBridge> {
    return new Promise((resolve, reject) => {
      const bridge = new FigmaBridge(port, host);
      const onError = (err: Error) => {
        bridge.httpServer.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        bridge.httpServer.removeListener("error", onError);
        console.error(`[open-figma-mcp] bridge owner listening on http://${host}:${port}`);
        resolve(bridge);
      };
      bridge.httpServer.once("error", onError);
      bridge.httpServer.once("listening", onListening);
      bridge.httpServer.listen(port, host);
    });
  }

  status(): BridgeStatus {
    return {
      connected: this.plugin?.readyState === WebSocket.OPEN,
      mode: "owner",
      host: this.host,
      port: this.port,
      peers: this.peers.size,
      pendingRequests: this.ownPending.size + this.routedPending.size,
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
        this.ownPending.delete(id);
        reject(new Error(`Timed out waiting for Figma plugin response to ${command}.`));
      }, timeoutMs);

      this.ownPending.set(id, { command, resolve, reject, timeout });

      try {
        this.plugin?.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timeout);
        this.ownPending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close() {
    this.rejectAllOwnPending("Figma bridge closed.");
    this.rejectAllRoutedPending("Figma bridge closed.");
    this.plugin?.close(1000, "bridge closed");
    for (const peer of this.peers.values()) {
      peer.socket.close(1000, "bridge closed");
    }
    this.peers.clear();
    this.wss.close();
    this.httpServer.close();
  }

  private handleConnection(socket: WebSocketConnection) {
    let role: "plugin" | "mcp_peer" | "unknown" = "unknown";
    let peerId: string | null = null;

    socket.on("message", (raw) => {
      const text = raw.toString();
      let message: PluginMessage;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }

      if (role === "unknown") {
        if (message.type === "register" && (message.role === "plugin" || message.role === "mcp_peer")) {
          role = message.role;
          if (role === "plugin") this.attachPlugin(socket);
          else {
            peerId = this.attachPeer(socket);
          }
          return;
        }
        if (message.command && message.id) {
          role = "mcp_peer";
          peerId = this.attachPeer(socket);
        } else {
          role = "plugin";
          this.attachPlugin(socket);
        }
      }

      if (role === "plugin") {
        this.handlePluginMessage(message);
      } else if (role === "mcp_peer" && peerId) {
        this.handlePeerMessage(peerId, message);
      }
    });

    socket.on("close", () => {
      if (role === "plugin" && this.plugin === socket) {
        this.plugin = null;
        console.error("[open-figma-mcp] Figma plugin disconnected");
        this.rejectAllOwnPending("Figma plugin disconnected.");
        this.rejectAllRoutedPending("Figma plugin disconnected.");
      } else if (role === "mcp_peer" && peerId) {
        this.detachPeer(peerId);
      }
    });
  }

  private attachPlugin(socket: WebSocketConnection) {
    if (this.plugin && this.plugin !== socket && this.plugin.readyState === WebSocket.OPEN) {
      console.error("[open-figma-mcp] replacing existing Figma plugin connection");
      this.plugin.close(1000, "replaced by newer Figma plugin connection");
    }
    this.plugin = socket;
    console.error(`[open-figma-mcp] Figma plugin connected on ws://${this.host}:${this.port}/ws`);
  }

  private attachPeer(socket: WebSocketConnection): string {
    this.peerCounter += 1;
    const id = `peer-${Date.now()}-${this.peerCounter}`;
    this.peers.set(id, { id, socket, routedIds: new Set() });
    console.error(`[open-figma-mcp] MCP peer connected (${id}); peers=${this.peers.size}`);
    return id;
  }

  private detachPeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    for (const internalId of peer.routedIds) {
      const routed = this.routedPending.get(internalId);
      if (routed) {
        clearTimeout(routed.timeout);
        this.routedPending.delete(internalId);
      }
    }
    this.peers.delete(peerId);
    console.error(`[open-figma-mcp] MCP peer disconnected (${peerId}); peers=${this.peers.size}`);
  }

  private nextId() {
    this.counter += 1;
    return `req-${Date.now()}-${this.counter}`;
  }

  private handlePluginMessage(message: PluginMessage) {
    if (message.type === "plugin_status") {
      this.lastPluginStatus = message.payload ?? message;
      if (typeof message.payload === "object" && message.payload) {
        const status = message.payload as { fileName?: string; pageName?: string; selectionCount?: number };
        console.error(
          `[open-figma-mcp] status file="${status.fileName || "unknown"}" page="${status.pageName || "unknown"}" selection=${status.selectionCount ?? 0}`
        );
      }
      this.broadcastToPeers({ type: "plugin_status", payload: this.lastPluginStatus });
      return;
    }

    if (!message.id) return;

    const ownPending = this.ownPending.get(message.id);
    if (ownPending) {
      clearTimeout(ownPending.timeout);
      this.ownPending.delete(message.id);
      if (message.ok) ownPending.resolve(message.result);
      else ownPending.reject(new Error(message.error || `${ownPending.command} failed in Figma plugin.`));
      return;
    }

    const routed = this.routedPending.get(message.id);
    if (routed) {
      clearTimeout(routed.timeout);
      this.routedPending.delete(message.id);
      const peer = this.peers.get(routed.peerId);
      if (peer) {
        peer.routedIds.delete(message.id);
        try {
          peer.socket.send(
            JSON.stringify({
              id: routed.originalId,
              ok: message.ok,
              result: message.result,
              error: message.error
            })
          );
        } catch (err) {
          console.error("[open-figma-mcp] failed to route plugin response to peer:", err);
        }
      }
    }
  }

  private handlePeerMessage(peerId: string, message: PluginMessage) {
    if (message.type === "register") return;
    if (!message.command || !message.id) return;

    if (!this.plugin || this.plugin.readyState !== WebSocket.OPEN) {
      const peer = this.peers.get(peerId);
      peer?.socket.send(
        JSON.stringify({
          id: message.id,
          ok: false,
          error: "Figma plugin is not connected to the bridge owner."
        })
      );
      return;
    }

    const internalId = this.nextId();
    const timeout = setTimeout(() => {
      const routed = this.routedPending.get(internalId);
      if (!routed) return;
      this.routedPending.delete(internalId);
      const peer = this.peers.get(routed.peerId);
      peer?.routedIds.delete(internalId);
      peer?.socket.send(
        JSON.stringify({
          id: routed.originalId,
          ok: false,
          error: `Timed out waiting for Figma plugin response to ${routed.command}.`
        })
      );
    }, 120000);

    this.routedPending.set(internalId, { peerId, originalId: message.id, command: message.command, timeout });
    const peer = this.peers.get(peerId);
    peer?.routedIds.add(internalId);

    try {
      this.plugin.send(JSON.stringify({ id: internalId, command: message.command, params: message.params || {} }));
    } catch (err) {
      clearTimeout(timeout);
      this.routedPending.delete(internalId);
      peer?.routedIds.delete(internalId);
      peer?.socket.send(
        JSON.stringify({ id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) })
      );
    }
  }

  private broadcastToPeers(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const peer of this.peers.values()) {
      if (peer.socket.readyState === WebSocket.OPEN) {
        try {
          peer.socket.send(data);
        } catch {
        }
      }
    }
  }

  private rejectAllOwnPending(reason: string) {
    for (const [, pending] of this.ownPending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.ownPending.clear();
  }

  private rejectAllRoutedPending(reason: string) {
    for (const [, routed] of this.routedPending) {
      clearTimeout(routed.timeout);
      const peer = this.peers.get(routed.peerId);
      peer?.routedIds.delete(routed.originalId);
      peer?.socket.send(
        JSON.stringify({ id: routed.originalId, ok: false, error: reason })
      );
    }
    this.routedPending.clear();
  }
}
