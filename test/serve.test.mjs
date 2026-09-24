import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
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
    assert.equal((await get(port, "/assets/ambient.js", localHost)).status, 200);
    assert.equal((await get(port, "/assets/fonts/Pencerio-Hairline.woff2", localHost)).status, 200);
    assert.equal((await get(port, "/portfolio-board/", localHost)).status, 200);
    assert.match((await get(port, "/robots.txt", localHost)).body, /Sitemap: https:\/\/maximkochergin\.github\.io\/portfolio-board\/sitemap\.xml/);
    assert.equal((await get(port, "/sitemap.xml", localHost)).headers["content-type"], "application/xml; charset=utf-8");
    assert.equal((await get(port, "/site.js", localHost, "POST")).status, 405);

    assert.equal((await get(port, "/index.html", `attacker.example:${port}`)).status, 403);
    assert.equal((await get(port, "/.gitignore", `attacker.example:${port}`)).status, 403);
    assert.equal((await get(port, `http://attacker.example:${port}/.gitignore`, `attacker.example:${port}`)).status, 403);
    const missing = await get(port, "/.gitignore", localHost);
    assert.equal(missing.status, 404);
    assert.match(missing.body, /page not found\./);
    assert.equal((await get(port, "/.gitignore", localHost, "HEAD")).body, "");
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

test("metadata JSON-LD hash is allowed by preview and page CSP", async () => {
  const [html, server] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../serve.mjs", import.meta.url), "utf8")
  ]);
  const json = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  assert.ok(json, "expected WebSite JSON-LD");
  assert.equal(JSON.parse(json)["@type"], "WebSite");
  const hash = "'sha256-" + createHash("sha256").update(json).digest("base64") + "'";
  assert.ok(html.includes(hash), "metadata script must match page CSP");
  assert.ok(server.includes(hash), "metadata script must match preview CSP");
});
