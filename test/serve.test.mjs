import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function availablePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  listener.close();
  await once(listener, "close");
  return port;
}

function get(port, path, host, method = "GET") {
  return new Promise((resolve, reject) => {
    const call = request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: { host }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    call.on("error", reject);
    call.setTimeout(3000, () => call.destroy(new Error("request timed out")));
    call.end();
  });
}

test("local preview serves only the public site to local hosts", async () => {
  const port = await availablePort();
  const server = spawn(process.execPath, ["serve.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    let startupTimeout;
    await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(() => { throw new Error("preview server exited early"); }),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(() => reject(new Error("preview server did not start")), 3000);
      })
    ]).finally(() => clearTimeout(startupTimeout));
    const localHost = `127.0.0.1:${port}`;
    const localPage = await get(port, "/?manage=1", localHost);
    assert.equal(localPage.status, 200);
    assert.match(localPage.body, /<title>work and notes<\/title>/);
    assert.equal((await get(port, "/index.html", `localhost:${port}`)).status, 200);
    assert.equal((await get(port, "/assets/icons/paper-mark.svg", localHost)).status, 200);
    assert.equal((await get(port, "/site.js", localHost, "HEAD")).status, 200);
    assert.equal((await get(port, "/site.js", localHost, "POST")).status, 405);

    assert.equal((await get(port, "/index.html", `attacker.example:${port}`)).status, 403);
    assert.equal((await get(port, "/.gitignore", `attacker.example:${port}`)).status, 403);
    assert.equal((await get(port, `http://attacker.example:${port}/.gitignore`, `attacker.example:${port}`)).status, 403);
    assert.equal((await get(port, "/.gitignore", localHost)).status, 404);
    assert.equal((await get(port, "/.gitignore", localHost, "HEAD")).status, 404);
    assert.equal((await get(port, "/%2egitignore", localHost)).status, 404);
    assert.equal((await get(port, "/assets%2F..%2FREADME.md", localHost)).status, 404);
    assert.equal((await get(port, "/site.js", `localhost:${port}.example`)).status, 403);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "exit");
      server.kill();
      await stopped;
    }
  }
});
