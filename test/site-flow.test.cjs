const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const postFormat = require("../assets/post-format.js");

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
    removeEventListener(name, callback) {
      this.listeners.set(name, (this.listeners.get(name) || []).filter((item) => item !== callback));
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
  const windowEvents = new Element("window");
  const timers = [];
  const historyCalls = [];
  document = {
    activeElement: null,
    title: "archive",
    hidden: false,
    querySelector: get,
    querySelectorAll(selector) {
      if (selector === '[role="tab"]') return tabs;
      if (selector === '[role="tabpanel"]') return panels;
      if (selector === ".post-list") return lists;
      const category = /^#panel-(work|notes|about) \.post-title$/.exec(selector)?.[1];
      if (category) return get(`#panel-${category} .post-list`).children.flatMap((item) => item.children.filter((child) => child.name === "h3").flatMap((heading) => heading.children));
      return [];
    },
    createElement: (name) => new Element(name),
    createElementNS: (_, name) => new Element(name),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener() {}
  };
  const window = {
    self: {}, top: {},
    postFormat,
    portfolioConfig: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "x".repeat(24) },
    location: { hash: "#work", pathname: "/portfolio-board/", origin: "https://example.test", search: "" },
    history: {
      state: null,
      pushState(state, _, url) { this.replaceState(state, _, url); },
      replaceState(state, _, url) { this.state = state; historyCalls.push(url); window.location.hash = new URL(url, window.location.origin + window.location.pathname).hash; },
      back() {}
    },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].active = false; },
    setTimeout(callback, delay) { timers.push({ callback, delay, active: true }); return timers.length; }
  };
  get("#post-detail").hidden = true;
  get("link[rel=\"canonical\"]").href = "https://example.test/portfolio-board/";
  const context = vm.createContext({ document, window, URL, URLSearchParams, navigator: {}, console });
  vm.runInContext(source, context, { filename: "site.js" });
  return { context, get, form, linksForm, windowEvents, historyCalls,
    async flushTimers() { for (const timer of timers.filter((item) => item.active && item.delay === 0)) { timer.active = false; await timer.callback(); } },
    run: (code) => vm.runInContext(code, context) };
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

test("entry previews keep untrusted titles as text and preserve real deep links", () => {
  const site = makeSite();
  site.context.entry = {
    id: "entry-1", category: "work", title: "<img src=x onerror=alert(1)>",
    body: "## A useful heading\n\nSome **important** text.", status: "published",
    published_at: "2026-10-09T09:00:00Z"
  };
  site.run("posts = [entry]; loading = false; renderPosts()");
  const item = site.get("#panel-work .post-list").children[0];
  assert.equal(item.name, "article");
  assert.equal(item.children[0].textContent, "9 Oct 2026");
  const title = item.children[1].children[0];
  assert.equal(title.name, "a");
  assert.equal(title.href, "#post/entry-1");
  assert.equal(title.textContent, site.context.entry.title);
  assert.equal(item.children[2].textContent, "A useful heading Some important text.");
  assert.equal(site.get("#count-work").textContent, "1");
  site.run("searchTerm = 'unmatched'; renderPosts()");
  assert.equal(site.get("#section-count").textContent, "0 entries found");
  assert.equal(site.get("#panel-work .post-list").children[0].name, "div");
});

test("footer sign in opens without a special URL and never creates a new account", async () => {
  const site = makeSite();
  let request;
  site.context.mockClient = {
    auth: { async signInWithOtp(input) { request = input; return { error: null }; } }
  };
  site.run("client = mockClient");
  await site.get("#owner-access").fire("click");
  assert.equal(site.get("#auth-dialog").open, true);
  const email = site.get("#auth-email");
  email.value = "owner@example.test";
  email.checkValidity = () => true;
  await site.get("#auth-form").fire("submit", { preventDefault() {} });
  assert.equal(request.email, "owner@example.test");
  assert.equal(request.options.shouldCreateUser, false);
  assert.equal(request.options.emailRedirectTo, "https://example.test/portfolio-board/?manage=1");
});

test("failed sign out keeps owner state; successful local sign out clears private content", async () => {
  const site = makeSite();
  let fail = true;
  let scope;
  site.context.mockClient = {
    auth: { async signOut(options) { scope = options.scope; return { error: fail ? true : null }; } },
    from(table) {
      if (table === "posts") return {
        select() { return this; }, eq() { return this; },
        async order() { return { data: [], error: null }; }
      };
      return { async select() { return { data: [], error: null }; } };
    }
  };
  site.run("client = mockClient; canPublish = true; posts = [{id:'private',category:'notes',status:'draft',body:'private words'}]");
  await site.get("#sign-out").fire("click");
  assert.equal(site.run("canPublish"), true);
  assert.equal(site.run("posts.length"), 1);
  assert.equal(site.get("#owner-notice").hidden, false);
  fail = false;
  await site.get("#sign-out").fire("click");
  assert.equal(scope, "local");
  assert.equal(site.run("canPublish"), false);
  assert.equal(site.run("posts.length"), 0);
  assert.equal(site.get("#board-controls").hidden, true);
  assert.equal(site.get("#owner-access").textContent, "Owner sign in");
});

test("a pending post route survives loading and a failed read", () => {
  const site = makeSite();
  site.run("window.location.hash = '#post/waiting'; loading = true; restoreLocation(false)");
  assert.equal(site.context.window.location.hash, '#post/waiting');
  assert.equal(site.historyCalls.length, 0);
  site.run("loading = false; loadError = true; restoreLocation(false)");
  assert.equal(site.context.window.location.hash, '#post/waiting');
});

test("encoded post routes open the intended entry", () => {
  const site = makeSite();
  site.run("posts = [{id:'entry/one',category:'notes',title:'Encoded entry',body:'Body',status:'published'}]; loading = false; window.location.hash = '#post/entry%2Fone'; restoreLocation(false)");
  assert.equal(site.run("openPostId"), 'entry/one');
  assert.equal(site.get('#detail-title').textContent, 'Encoded entry');
});

test("unchanged lists retain their nodes and hidden sections render on demand", () => {
  const site = makeSite();
  site.run("posts = [{id:'one',category:'work',title:'Work',body:'Text',status:'published'},{id:'two',category:'notes',title:'Note',body:'Text',status:'draft'}]; loading = false; canPublish = true; renderPosts()");
  const list = site.get('#panel-work .post-list');
  const entry = list.children[0];
  assert.equal(site.get('#panel-notes .post-list').children.length, 0);
  site.run('renderPosts()');
  assert.equal(list.children[0], entry);
  site.run("selectTab(document.querySelector('#tab-notes'))");
  assert.equal(site.get('#panel-notes .post-list').children[0].name, 'article');
  site.run('clearPrivateView()');
  assert.equal(site.get('#panel-work .post-list').children.length, 0);
  assert.equal(site.get('#panel-notes .post-list').children[0].name, 'div');
});

test("preview text preserves escaped formatting and literal underscores", () => {
  const site = makeSite();
  assert.equal(site.run("postSummary({body:'Use snake_case and \\\\*literal\\\\* markers. **Bold**.'})"), 'Use snake_case and *literal* markers. Bold.');
});

test("a pending sign-in request cannot be submitted twice or reopened as idle", async () => {
  const site = makeSite();
  let release;
  let calls = 0;
  site.context.mockClient = { auth: { signInWithOtp() { calls++; return new Promise((resolve) => { release = resolve; }); } } };
  site.run('client = mockClient; openAuthDialog()');
  const email = site.get('#auth-email');
  email.value = 'owner@example.test';
  email.checkValidity = () => true;
  const first = site.get('#auth-form').fire('submit', { preventDefault() {} });
  await site.get('#auth-form').fire('submit', { preventDefault() {} });
  assert.equal(calls, 1);
  site.get('#auth-dialog').close();
  site.run('openAuthDialog()');
  assert.equal(site.get('#send-sign-in').disabled, true);
  assert.equal(email.disabled, true);
  release({ error: null });
  await first;
  assert.match(site.get('#auth-copy').textContent, /inbox/);
});

test("changed contacts require confirmation before being discarded", async () => {
  const site = makeSite();
  site.context.mockClient = { from: () => ({ async select() { return { data: [], error: null }; } }) };
  site.run('client = mockClient; canPublish = true');
  await site.get('#edit-links').fire('click');
  site.linksForm.elements.github.value = 'https://github.com/changed';
  const close = site.get('#close-links').fire('click');
  assert.equal(site.get('#confirm-dialog').open, true);
  site.get('#confirm-dialog').close('cancel');
  await close;
  assert.equal(site.get('#links-dialog').open, true);
  assert.equal(site.linksForm.elements.github.value, 'https://github.com/changed');
  const discard = site.get('#close-links').fire('click');
  site.get('#confirm-dialog').close('confirm');
  await discard;
  assert.equal(site.get('#links-dialog').open, false);
});

test("unload protection is installed only while there are unsaved changes", async () => {
  const site = makeSite();
  site.run('canPublish = true; openComposer(null)');
  assert.equal((site.windowEvents.listeners.get('beforeunload') || []).length, 0);
  site.form.elements.body.value = 'Unsaved';
  await site.form.fire('input');
  let prevented = false;
  await site.windowEvents.fire('beforeunload', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  site.form.elements.body.value = '';
  await site.form.fire('input');
  assert.equal(site.windowEvents.listeners.get('beforeunload').length, 0);
});

test("delete checks the version the owner reviewed", async () => {
  const site = makeSite();
  const filters = [];
  const query = { eq(key, value) { filters.push([key, value]); return this; }, select() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
  site.context.mockClient = { from: () => ({ delete: () => query }) };
  site.run("client = mockClient; canPublish = true; posts = [{id:'entry',category:'work',title:'Original',body:'Body',status:'published',updated_at:'version-1'}]; showPost('entry',false,false)");
  const pending = site.get('#delete-post').fire('click');
  site.run("posts = [{...posts[0], updated_at:'version-2'}]");
  site.get('#confirm-dialog').close('confirm');
  await pending;
  assert.deepEqual(filters, [['id', 'entry'], ['updated_at', 'version-1']]);
  assert.match(site.get('#detail-error').textContent, /changed|removed/);
});

test("a saved post's refresh respects later navigation and a newly opened editor", async () => {
  const site = makeSite();
  const saved = { id: "entry", category: "work", title: "Saved", body: "Updated", status: "published", updated_at: "v2" };
  let releaseRead;
  let reading;
  const readStarted = new Promise((resolve) => { reading = resolve; });
  const update = { eq() { return this; }, select() { return this; }, async maybeSingle() { return { data: saved, error: null }; } };
  site.context.mockPost = { ...saved, body: "Original", updated_at: "v1" };
  site.context.mockClient = { from: () => ({
    update: () => update,
    select() { return { order() { reading(); return new Promise((resolve) => { releaseRead = resolve; }); } }; }
  }) };
  site.run("client = mockClient; canPublish = true; posts = [mockPost]; openComposer(mockPost)");
  site.form.elements.body.value = "Updated";
  const submitting = site.form.fire("submit", { preventDefault() {}, submitter: { value: "published" } });
  await readStarted;
  assert.equal(site.run("window.location.hash"), "#post/entry");
  await site.get("#tab-notes").fire("click");
  await site.get("#new-post").fire("click");
  site.form.elements.body.value = "Another unsaved entry";
  releaseRead({ data: [saved], error: null });
  await submitting;
  assert.equal(site.run("window.location.hash"), "#notes");
  assert.equal(site.run("activeCategory"), "notes");
  assert.equal(site.get("#composer").open, true);
  assert.equal(site.form.elements.body.value, "Another unsaved entry");
});

test("a failed deep-link load can be retried without losing its destination", async () => {
  const site = makeSite();
  let failed = true;
  const post = { id: "entry", category: "notes", title: "Recovered", body: "Text", status: "published" };
  site.context.mockClient = { from: () => ({
    select() { return this; }, eq() { return this; },
    async order() { return failed ? { error: true } : { data: [post], error: null }; }
  }) };
  site.run("client = mockClient; window.location.hash = '#post/entry'; restoreLocation()");
  assert.equal(await site.run("refreshPosts()"), false);
  assert.equal(site.run("window.location.hash"), "#post/entry");
  failed = false;
  assert.equal(await site.run("refreshPosts()"), true);
  assert.equal(site.get("#detail-title").textContent, "Recovered");
  assert.equal(site.get("#post-detail").hidden, false);
});

test("auth events coalesce reads and token refresh does not reload unchanged content", async () => {
  const site = makeSite();
  let authEvent;
  const reads = { sessions: 0, posts: 0, links: 0 };
  const mockClient = {
    auth: {
      onAuthStateChange(callback) { authEvent = callback; },
      async getSession() { reads.sessions++; return { data: { session: null }, error: null }; }
    },
    from(table) {
      if (table === "external_links") return { async select() { reads.links++; return { data: [], error: null }; } };
      return { select() { return this; }, eq() { return this; }, async order() { reads.posts++; return { data: [], error: null }; } };
    }
  };
  site.context.mockClient = mockClient;
  site.run("window.supabase = { createClient: () => mockClient }");
  await site.run("start()");
  const initial = { ...reads };
  authEvent("INITIAL_SESSION");
  authEvent("TOKEN_REFRESHED");
  await site.flushTimers();
  assert.deepEqual(reads, initial);
  authEvent("SIGNED_IN");
  authEvent("SIGNED_IN");
  authEvent("USER_UPDATED");
  await site.flushTimers();
  assert.deepEqual(reads, { sessions: initial.sessions + 1, posts: initial.posts + 1, links: initial.links + 1 });
  site.run("canPublish = true; posts = [{id:'private', category:'notes', status:'draft', title:'Private', body:'Secret'}]; selectTab(document.querySelector('#tab-notes'))");
  authEvent("SIGNED_OUT");
  assert.equal(site.run("posts.length"), 0);
  assert.equal(site.get("#panel-notes .post-list").children[0].name, "div");
});

test("contact changes also protect against reload and sign out removes that protection", async () => {
  const site = makeSite();
  site.context.mockClient = { from: () => ({ async select() { return { data: [], error: null }; } }) };
  site.run("client = mockClient; canPublish = true");
  await site.get("#edit-links").fire("click");
  assert.equal((site.windowEvents.listeners.get("beforeunload") || []).length, 0);
  site.linksForm.elements.github.value = "https://github.com/example";
  await site.linksForm.fire("input");
  assert.equal(site.windowEvents.listeners.get("beforeunload").length, 1);
  site.run("clearPrivateView()");
  assert.equal(site.windowEvents.listeners.get("beforeunload").length, 0);
  assert.equal(site.get("#links-dialog").open, false);
});
