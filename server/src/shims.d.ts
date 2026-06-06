declare const process: {
  pid: number;
  env: Record<string, string | undefined>;
  cwd(): string;
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  on(event: "uncaughtException", listener: (err: Error) => void): void;
  exit(code?: number): never;
};

declare const Buffer: {
  from(data: string, encoding: "base64"): Uint8Array;
};

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  export function writeFile(path: string, data: Uint8Array, options?: { flag?: string }): Promise<void>;
}

declare module "node:path" {
  const path: {
    basename(value: string, ext?: string): string;
    dirname(value: string): string;
    extname(value: string): string;
    isAbsolute(value: string): boolean;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
  };
  export default path;
}

declare module "node:http" {
  export type IncomingMessage = {
    method?: string;
    url?: string;
  };

  export type ServerResponse = {
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(data?: string): void;
  };

  export type Server = {
    listen(port: number, host: string, listener?: () => void): void;
    listen(port: number, host: string): void;
    close(): void;
    on(event: "error", listener: (err: Error & { code?: string }) => void): void;
    on(event: "listening", listener: () => void): void;
    once(event: "error", listener: (err: Error & { code?: string }) => void): void;
    once(event: "listening", listener: () => void): void;
    removeListener(event: "error" | "listening", listener: (...args: any[]) => void): void;
  };

  export function createServer(
    listener: (req: IncomingMessage, res: ServerResponse) => void
  ): Server;
}

declare module "ws" {
  export class WebSocket {
    static readonly OPEN: number;
    static readonly CONNECTING: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    constructor(url: string);
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: "open", listener: () => void): void;
    on(event: "close", listener: (code?: number, reason?: Buffer) => void): void;
    on(event: "error", listener: (err: Error) => void): void;
    on(event: "message", listener: (raw: { toString(): string }) => void): void;
    removeAllListeners(): void;
  }

  export class WebSocketServer {
    constructor(options: { host?: string; port?: number; server?: unknown; maxPayload?: number });
    on(event: "connection", listener: (socket: WebSocketConnection) => void): void;
    on(event: "error", listener: (err: Error) => void): void;
    close(): void;
  }

  export type WebSocketConnection = {
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: "message", listener: (raw: { toString(): string }) => void): void;
    on(event: "close", listener: () => void): void;
  };
}
