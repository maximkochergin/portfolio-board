import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4174);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
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
  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { ...securityHeaders, allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    const pathFromRoot = relative(root, file);
    if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      response.writeHead(403, securityHeaders).end();
      return;
    }
    if (!statSync(file).isFile()) throw new Error("not a file");
    const headers = {
      ...securityHeaders,
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": pathname === "/config.js" ? "no-store" : "no-cache"
    };
    response.writeHead(200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, securityHeaders).end();
  }
}).listen(port, "127.0.0.1", function () {
  console.log("portfolio board is available at http://127.0.0.1:" + port);
});
