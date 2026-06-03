import { WebSocket } from "ws";

type ClientStatus = {
  connected: boolean;
  mode: "peer";
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

type Message = {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  type?: string;
  payload?: unknown;
};

export class BridgeClient {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private counter = 0;
  private connectedOnce = false;
  private lastPluginStatus: unknown = null;
  private connectionPromise: Promise<void>;
  private connectResolve!: () => void;
  private connectReject!: (err: Error) => void;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly port: number,
    private readonly host = "127.0.0.1"
  ) {
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });
    this.connect();
  }

  status(): ClientStatus {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      mode: "peer",
      host: this.host,
      port: this.port,
      pendingRequests: this.pending.size,
      lastPluginStatus: this.lastPluginStatus
    };
  }

  async request(command: string, params: Record<string, unknown> = {}, timeoutMs = 30000) {
    await this.connectionPromise;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Open Figma MCP bridge owner is not reachable.");
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
        this.socket?.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending("Bridge client closed.");
    try {
      this.socket?.close(1000, "client closed");
    } catch {
    }
    this.socket = null;
  }

  private connect() {
    const ws = new WebSocket(`ws://${this.host}:${this.port}/ws`);
    this.socket = ws;

    ws.on("open", () => {
      try {
        ws.send(JSON.stringify({ type: "register", role: "mcp_peer" }));
      } catch (err) {
        console.error("[open-figma-mcp] peer register send failed:", err);
      }
      if (!this.connectedOnce) {
        this.connectedOnce = true;
        this.connectResolve();
        console.error(`[open-figma-mcp] peer connected to bridge owner ws://${this.host}:${this.port}/ws`);
      } else {
        console.error("[open-figma-mcp] peer reconnected to bridge owner");
      }
    });

    ws.on("message", (raw) => this.handleMessage(raw.toString()));

    ws.on("error", (err) => {
      if (!this.connectedOnce) {
        this.connectReject(err);
      } else {
        console.error("[open-figma-mcp] peer socket error:", err.message);
      }
    });

    ws.on("close", () => {
      const wasConnected = this.connectedOnce;
      this.socket = null;
      this.rejectAllPending("Bridge owner connection closed.");
      if (wasConnected) {
        console.error("[open-figma-mcp] peer disconnected from bridge owner; retrying in 1500ms");
        this.reconnectTimer = setTimeout(() => this.connect(), 1500);
      }
    });
  }

  private nextId() {
    this.counter += 1;
    return `peer-${process.pid}-${this.counter}`;
  }

  private handleMessage(raw: string) {
    let message: Message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === "plugin_status") {
      this.lastPluginStatus = message.payload ?? message;
      return;
    }

    if (!message.id) return;

    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || `${pending.command} failed in Figma plugin.`));
  }

  private rejectAllPending(reason: string) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
