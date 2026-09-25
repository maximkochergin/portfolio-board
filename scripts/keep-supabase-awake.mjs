import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function readPublicPost(config, request = fetch) {
  const { supabaseUrl, supabaseAnonKey } = config ?? {};
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and publishable key are required in config.js.");
  }

  const endpoint = new URL("/rest/v1/posts?select=id&limit=1", supabaseUrl);
  if (endpoint.protocol !== "https:") {
    throw new Error("Supabase URL must use HTTPS.");
  }

  const response = await request(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      accept: "application/json",
      "cache-control": "no-cache"
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Supabase database read failed (HTTP ${response.status}).`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("Supabase database read returned an unexpected response.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  globalThis.window = {};
  await import("../config.js");
  await readPublicPost(globalThis.window.portfolioConfig);
  console.log("Supabase database read succeeded.");
}
