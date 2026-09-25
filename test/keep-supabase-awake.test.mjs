import assert from "node:assert/strict";
import { test } from "node:test";
import { readPublicPost } from "../scripts/keep-supabase-awake.mjs";

const config = {
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "sb_publishable_test"
};

test("keepalive reads at most one public post without Auth or writes", async () => {
  let calls = 0;
  await readPublicPost(config, async (url, options) => {
    calls += 1;
    assert.equal(url, "https://example.supabase.co/rest/v1/posts?select=id&limit=1");
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, {
      apikey: config.supabaseAnonKey,
      accept: "application/json",
      "cache-control": "no-cache"
    });
    assert.equal(options.redirect, "error");
    assert.equal(options.body, undefined);
    return { ok: true, json: async () => [] };
  });
  assert.equal(calls, 1);
});

test("keepalive fails visibly when the database read fails", async () => {
  await assert.rejects(
    readPublicPost(config, async () => ({ ok: false, status: 503 })),
    /HTTP 503/
  );
});
