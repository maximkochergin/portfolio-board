import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4174);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
if (port === 80) {
  allowedHosts.add("127.0.0.1");
  allowedHosts.add("localhost");
}
const publicFiles = new Set(["index.html", "styles.css", "site.js", "config.js"]);
function isPublicFile(path) {
  return publicFiles.has(path) || (path.startsWith(`assets${sep}`)
    && !path.split(sep).some((part) => part.startsWith(".")));
}
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};
const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://bctmgeblffqdmkiioxuf.supabase.co; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

createServer(function (request, response) {
  const host = request.headers.host;
  if (typeof host !== "string" || !allowedHosts.has(host.toLowerCase())) {
    response.writeHead(403, securityHeaders).end();
    return;
  }
  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { ...securityHeaders, allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isPublicFile(relative(root, file))) {
      response.writeHead(404, securityHeaders).end();
      return;
    }
    const realFile = realpathSync(file);
    if (!isPublicFile(relative(root, realFile)) || !statSync(realFile).isFile()) {
      response.writeHead(404, securityHeaders).end();
      return;
    }
    const headers = {
      ...securityHeaders,
      "content-type": types[extname(realFile)] || "application/octet-stream",
      "cache-control": pathname === "/config.js" ? "no-store" : "no-cache"
    };
    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(realFile).on("error", function () { response.destroy(); }).pipe(response);
  } catch {
    response.writeHead(404, securityHeaders).end();
  }
}).listen(port, "127.0.0.1", function () {
  console.log("portfolio board is available at http://127.0.0.1:" + port);
});
