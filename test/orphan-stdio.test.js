import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";

const entrypoint = path.resolve("server/dist/index.js");

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOutput(readOutput, expected, process) {
  const deadline = Date.now() + 4000;
  while (!readOutput().includes(expected)) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`Process exited before logging "${expected}":\n${readOutput()}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for "${expected}":\n${readOutput()}`);
    }
    await delay(20);
  }
}

function stop(process) {
  if (process.exitCode === null && process.signalCode === null) {
    process.kill("SIGKILL");
  }
}

test("peer exits instead of spinning after MCP stdio closes and the owner disappears", { timeout: 10000 }, async (t) => {
  const port = await getFreePort();
  const env = { ...process.env, FIGMA_MCP_PORT: String(port) };
  const owner = spawn(process.execPath, [entrypoint], { env, stdio: ["pipe", "ignore", "pipe"] });
  let ownerErrors = "";
  owner.stderr.on("data", (chunk) => {
    ownerErrors += chunk.toString();
  });
  t.after(() => stop(owner));

  await waitForOutput(() => ownerErrors, "bridge owner listening", owner);

  const peer = spawn(process.execPath, [entrypoint], { env, stdio: "pipe" });
  let peerErrors = "";
  peer.stderr.on("data", (chunk) => {
    peerErrors += chunk.toString();
  });
  t.after(() => stop(peer));

  await waitForOutput(() => peerErrors, "peer connected to bridge owner", peer);

  const exited = once(peer, "exit");
  peer.stdin.destroy();
  peer.stdout.destroy();
  peer.stderr.destroy();
  owner.kill("SIGKILL");

  const result = await Promise.race([
    exited,
    delay(3000).then(() => null)
  ]);

  assert.ok(result, `Peer remained alive after its MCP client disconnected.\n${peerErrors}`);
});

test("peer exits when reconnect logging fails because stderr is closed", { timeout: 10000 }, async (t) => {
  const port = await getFreePort();
  const env = { ...process.env, FIGMA_MCP_PORT: String(port) };
  const owner = spawn(process.execPath, [entrypoint], { env, stdio: ["pipe", "ignore", "pipe"] });
  let ownerErrors = "";
  owner.stderr.on("data", (chunk) => {
    ownerErrors += chunk.toString();
  });
  t.after(() => stop(owner));

  await waitForOutput(() => ownerErrors, "bridge owner listening", owner);

  const peer = spawn(process.execPath, [entrypoint], { env, stdio: "pipe" });
  let peerErrors = "";
  peer.stderr.on("data", (chunk) => {
    peerErrors += chunk.toString();
  });
  t.after(() => stop(peer));

  await waitForOutput(() => peerErrors, "peer connected to bridge owner", peer);

  peer.stderr.destroy();
  const exited = once(peer, "exit");
  owner.kill("SIGKILL");

  const result = await Promise.race([
    exited,
    delay(3000).then(() => null)
  ]);

  assert.ok(result, `Peer remained alive after stderr started returning EPIPE.\n${peerErrors}`);
});
