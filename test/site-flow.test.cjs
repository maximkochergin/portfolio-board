const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "site.js"), "utf8");

function makeSite() {
  const elements = new Map();
  let document;
  class Element {
    constructor(name) {
      this.name = name;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.classList = {
        add() {}, remove() {}, toggle() {}, contains() { return false; }
      };
      this.hidden = false;
      this.open = false;
      this.disabled = false;
      this.value = "";
      this.textContent = "";
    }
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(callback);
      this.listeners.set(name, callbacks);
    }
    async fire(name, event = {}) {
      for (const callback of this.listeners.get(name) || []) await callback(event);
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) || null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    get childElementCount() { return this.children.length; }
    querySelectorAll() { return []; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close(value = "") { this.open = false; this.returnValue = value; void this.fire("close"); }
    reset() {
      for (const [name, field] of Object.entries(this.elements || {})) {
        field.value = name === "category" ? "work" : "";
      }
    }
  }
  function get(selector) {
    if (!elements.has(selector)) elements.set(selector, new Element(selector));
    return elements.get(selector);
  }
  const tabs = ["work", "notes", "about"].map((category) => {
    const tab = get(`#tab-${category}`);
    tab.id = `tab-${category}`;
    return tab;
  });
  const panels = ["work", "notes", "about"].map((category) => {
    const panel = get(`#panel-${category}`);
    panel.id = `panel-${category}`;
    return panel;
  });
  const lists = ["work", "notes", "about"].map((category) => {
    const list = get(`#panel-${category} .post-list`);
    list.dataset.category = category;
    return list;
  });
  const form = get("#post-form");
  form.elements = Object.fromEntries(["category", "title", "body", "subtitle", "link"].map((name) => [name, get(`form-${name}`)]));
  const linksForm = get("#links-form");
  linksForm.elements = Object.fromEntries(["email", "github", "linkedin", "telegram", "discord", "x", "cv"].map((name) => [name, get(`links-${name}`)]));
  document = {
    activeElement: null,
    title: "archive",
    hidden: false,
    querySelector: get,
    querySelectorAll(selector) {
      if (selector === '[role="tab"]') return tabs;
      if (selector === '[role="tabpanel"]') return panels;
      if (selector === ".post-list") return lists;
      return [];
    },
    createElement: (name) => new Element(name),
    createElementNS: (_, name) => new Element(name),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener() {}
  };
  const window = {
    self: {}, top: {},
    portfolioConfig: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "x".repeat(24) },
    location: { hash: "#work", pathname: "/portfolio-board/", origin: "https://example.test", search: "" },
    history: { state: null, pushState() {}, replaceState() {}, back() {} },
    addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; }
  };
  get("#post-detail").hidden = true;
  get("link[rel=\"canonical\"]").href = "https://example.test/portfolio-board/";
  const context = vm.createContext({ document, window, URL, URLSearchParams, navigator: {}, console });
  vm.runInContext(source, context, { filename: "site.js" });
  return { context, get, form, linksForm, run: (code) => vm.runInContext(code, context) };
}

test("temporary owner-check failure keeps an unsaved post open", async () => {
  const site = makeSite();
  site.run("canPublish = true; client = { auth: { getSession: async () => ({ error: { message: 'offline' } }) } }");
  site.get("#composer").open = true;
  site.form.elements.body.value = "unsaved words";
  assert.equal(await site.run("refreshOwnerState()"), false);
  assert.equal(site.get("#composer").open, true);
  assert.equal(site.form.elements.body.value, "unsaved words");
  assert.equal(site.run("canPublish && ownerCheckUncertain"), true);
});

test("stale post update is rejected without clearing the editor", async () => {
  const site = makeSite();
  const post = {
    id: "post-1", category: "work", title: "first", body: "original",
    subtitle: null, link: null, status: "published", updated_at: "2026-09-25T12:00:00Z"
  };
  const filters = [];
  const query = {
    eq(name, value) { filters.push([name, value]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: null, error: null }; }
  };
  site.context.mockPost = post;
  site.context.mockClient = { from: () => ({ update: () => query }) };
  site.run("client = mockClient; canPublish = true; posts = [mockPost]; openComposer(mockPost)");
  site.form.elements.body.value = "my new text";
  await site.form.fire("submit", { preventDefault() {}, submitter: { value: "published" } });
  assert.deepEqual(filters, [["id", "post-1"], ["updated_at", post.updated_at]]);
  assert.equal(site.get("#composer").open, true);
  assert.equal(site.form.elements.body.value, "my new text");
  assert.match(site.get("#form-error").textContent, /changed in another tab/);
});

test("editing one contact does not resend unchanged profiles", async () => {
  const site = makeSite();
  const saved = [
    { platform: "github", url: "https://github.com/first" },
    { platform: "telegram", url: "https://t.me/first" }
  ];
  let written = null;
  site.context.mockClient = {
    from(table) {
      assert.equal(table, "external_links");
      return {
        async select() { return { data: saved, error: null }; },
        async upsert(entries) { written = entries; return { error: null }; }
      };
    }
  };
  site.run("client = mockClient; canPublish = true");
  await site.get("#edit-links").fire("click");
  site.linksForm.elements.telegram.value = "https://t.me/second";
  await site.linksForm.fire("submit", { preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(written)), [
    { platform: "telegram", url: "https://t.me/second" }
  ]);
  assert.equal(site.get("#links-dialog").open, false);
});

test("failed post refresh keeps the last known post instead of blanking the board", async () => {
  const site = makeSite();
  const post = { id: "post-1", category: "work", title: "cached", body: "still here", status: "published" };
  const query = {
    select() { return this; }, eq() { return this; },
    async order() { return { error: { message: "offline" } }; }
  };
  site.context.mockPost = post;
  site.context.mockClient = { from: () => query };
  site.run("client = mockClient; posts = [mockPost]");
  assert.equal(await site.run("refreshPosts()"), false);
  assert.equal(site.run("posts.length"), 1);
  assert.equal(site.run("loadError"), false);
  assert.match(site.get("#board-status").textContent, /last loaded version/);
});

test("successful post save stays visible when the following read fails", async () => {
  const site = makeSite();
  const saved = {
    id: "post-2", category: "work", title: "new work", body: "new body",
    status: "published", subtitle: null, link: null,
    published_at: "2026-09-25T12:00:00Z", updated_at: "2026-09-25T12:00:00Z"
  };
  site.context.mockClient = {
    from: () => ({
      insert() { return { select() { return { async single() { return { data: saved, error: null }; } }; } }; },
      select() { return {
        eq() { return this; },
        async order() { return { error: { message: "offline" } }; }
      }; }
    })
  };
  site.run("client = mockClient; canPublish = true; openComposer(null)");
  site.form.elements.title.value = "new work";
  site.form.elements.body.value = "new body";
  await site.form.fire("submit", { preventDefault() {}, submitter: { value: "published" } });
  assert.equal(site.get("#composer").open, false);
  assert.equal(site.run("posts.length"), 1);
  assert.match(site.get("#board-status").textContent, /post saved.*couldn't refresh/);
});

test("a contacts failure is visible, recoverable, and Escape cannot hide a pending save", async () => {
  const site = makeSite();
  let fail = true;
  site.context.mockClient = {
    from: () => ({
      async select() { return fail ? { error: { message: "offline" } } : { data: [], error: null }; }
    })
  };
  site.run("client = mockClient");
  assert.equal(await site.run("refreshContactLinks()"), "error");
  assert.equal(site.get("#contacts-error").hidden, false);
  fail = false;
  assert.equal(await site.run("refreshContactLinks()"), "ok");
  assert.equal(site.get("#contacts-error").hidden, true);
  site.run("savingLinks = true");
  let prevented = false;
  await site.get("#links-dialog").fire("cancel", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test("public reads begin without waiting for an owner session check", async () => {
  const site = makeSite();
  const started = [];
  let releaseSession;
  const session = new Promise((resolve) => { releaseSession = resolve; });
  const client = {
    auth: {
      onAuthStateChange() {},
      getSession() { started.push("owner"); return session; }
    },
    from(table) {
      started.push(table);
      if (table === "posts") {
        return {
          select() { return this; }, eq() { return this; },
          async order() { return { data: [], error: null }; }
        };
      }
      return { async select() { return { data: [], error: null }; } };
    }
  };
  site.context.mockClient = client;
  site.context.window.supabase = { createClient: () => client };
  const startedSite = site.run("start()");
  assert.deepEqual(started, ["posts", "external_links", "owner"]);
  releaseSession({ data: { session: null }, error: null });
  await startedSite;
});
