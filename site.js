const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
const composer = document.querySelector("#composer");
const form = document.querySelector("#post-form");
const detail = document.querySelector("#post-detail");
const newPostButton = document.querySelector("#new-post");
const ownerActions = document.querySelector("#owner-actions");
const confirmDialog = document.querySelector("#confirm-dialog");
const authDialog = document.querySelector("#auth-dialog");
const authForm = document.querySelector("#auth-form");
const searchRegion = document.querySelector("#search-region");
const searchInput = document.querySelector("#search-input");
const clearSearchButton = document.querySelector("#clear-search");
const boardStatus = document.querySelector("#board-status");
const content = document.querySelector(".content");
const shareAction = document.querySelector("#share-action");
const copyStatus = document.querySelector("#copy-link-status");
const contacts = document.querySelector("#contacts");
const contactIcons = document.querySelector("#contact-icons");
const boardControls = document.querySelector("#board-controls");
const linksDialog = document.querySelector("#links-dialog");
const linksForm = document.querySelector("#links-form");

const config = window.portfolioConfig || {};
const hasConfig = typeof config.supabaseUrl === "string"
  && /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl)
  && typeof config.supabaseAnonKey === "string"
  && config.supabaseAnonKey.length > 20;
const categories = ["work", "notes", "about"];
const magicLinkCooldownMs = 60 * 1000;
const contactPlatforms = ["email", "github", "linkedin", "telegram", "discord", "x", "cv"];

let client = null;
let posts = [];
let activeCategory = "work";
let openPostId = null;
let editingId = null;
let editingStatus = "published";
let canPublish = false;
let loading = true;
let loadError = false;
let nextMagicLinkAt = 0;
let searchTerm = "";
let postsRevision = 0;
let ownerRevision = 0;
let savingPost = false;
let deletingPost = false;
let initialFormState = "";
let searchIndex = new Map();
let locationRestored = false;
let contactLinks = new Map();
let linksRevision = 0;
let savingLinks = false;
let copyStatusTimer = null;

function resetCopyStatus() {
  window.clearTimeout(copyStatusTimer);
  copyStatus.textContent = "";
}

function postUrl(id) {
  const canonical = document.querySelector('link[rel="canonical"]');
  const url = new URL(canonical?.href || window.location.pathname, window.location.origin);
  url.hash = "post/" + id;
  return url.href;
}

function safeLink(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function appendFormattedText(element, value) {
  if (!window.postFormat) {
    element.textContent = value;
    return;
  }
  window.postFormat.parseInline(value).forEach(function (token) {
    if (token.type === "text") {
      element.append(document.createTextNode(token.text));
      return;
    }
    const tag = token.type === "strong" ? "strong" : token.type === "em" ? "em" : "code";
    const child = document.createElement(tag);
    child.textContent = token.text;
    element.append(child);
  });
}

function renderPostBody(value) {
  const body = document.querySelector("#detail-body");
  body.replaceChildren();
  if (!window.postFormat) {
    const paragraph = document.createElement("p");
    paragraph.textContent = value;
    body.append(paragraph);
    return;
  }
  window.postFormat.parsePostText(value).forEach(function (block) {
    if (block.type === "list") {
      const list = document.createElement(block.kind === "ordered" ? "ol" : "ul");
      block.items.forEach(function (item) {
        const li = document.createElement("li");
        appendFormattedText(li, item);
        list.append(li);
      });
      body.append(list);
      return;
    }
    if (block.type === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.append(code);
      body.append(pre);
      return;
    }
    const element = document.createElement(block.type === "heading" ? `h${block.level}` : "p");
    appendFormattedText(element, block.text);
    body.append(element);
  });
}

function safeContactLink(platform, raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (platform === "email") {
    const address = value.startsWith("mailto:") ? value.slice(7) : value;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? `mailto:${address}` : null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hosts = {
      github: ["github.com"], linkedin: ["linkedin.com", "www.linkedin.com"],
      telegram: ["t.me"], discord: ["discord.com", "discord.gg"],
      x: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"]
    };
    if (hosts[platform] && !hosts[platform].includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

function renderContactLinks() {
  contactIcons.replaceChildren();
  contactPlatforms.forEach(function (platform) {
    const href = safeContactLink(platform, contactLinks.get(platform));
    if (!href) return;
    const anchor = document.createElement("a");
    anchor.className = "contact-link";
    anchor.href = href;
    anchor.setAttribute("aria-label", platform === "email" ? "send email" : `open ${platform} profile in a new tab`);
    anchor.title = platform;
    if (platform !== "email") {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#contact-${platform}`);
    icon.append(use);
    anchor.append(icon);
    contactIcons.append(anchor);
  });
  contacts.hidden = !contactIcons.childElementCount;
}

async function refreshContactLinks() {
  if (!client) return false;
  const revision = ++linksRevision;
  let result;
  try {
    result = await client.from("external_links").select("platform, url");
  } catch {
    result = { error: true };
  }
  if (revision !== linksRevision || result.error || !Array.isArray(result.data)) return false;
  contactLinks = new Map(result.data.map(function (entry) { return [entry.platform, entry.url]; }));
  renderContactLinks();
  return true;
}

function normalizeSearch(value) {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function matchesSearch(post, term) {
  if (!term) return true;
  return searchIndex.get(post.id)?.includes(term) || false;
}

function postsForCategory(category, term) {
  return posts.filter(function (post) {
    return post.category === category && matchesSearch(post, term);
  });
}

function emptyCopy(category) {
  if (loading) return "loading...";
  if (loadError) return "couldn't load this page.";
  if (normalizeSearch(searchTerm)) return "nothing matches that search.";
  if (posts.length) return `nothing in ${category} yet.`;
  return "nothing published yet.";
}

function syncSearch() {
  searchRegion.hidden = false;
  clearSearchButton.hidden = !searchTerm;
  if (searchInput.value !== searchTerm) searchInput.value = searchTerm;
}

function announce(message) {
  if (boardStatus.textContent !== message) boardStatus.textContent = message;
}

function retryPosts() {
  if (client) void refreshPosts();
  else window.location.reload();
}

function showMessage(message, retry) {
  searchRegion.hidden = true;
  content.setAttribute("aria-busy", "false");
  announce(message);
  document.querySelectorAll(".post-list").forEach(function (list) {
    list.replaceChildren();
    const state = document.createElement("div");
    state.className = "empty-state";
    const copy = document.createElement("p");
    copy.textContent = message;
    state.append(copy);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plain";
      button.textContent = "try again";
      button.addEventListener("click", retryPosts);
      state.append(button);
    }
    list.append(state);
  });
}

function renderPosts(onlyCategory = null) {
  if (!hasConfig) {
    showMessage("this place is being connected.");
    return;
  }
  if (loadError) {
    showMessage("couldn't load this page.", true);
    return;
  }
  syncSearch();
  content.setAttribute("aria-busy", String(loading));
  const term = normalizeSearch(searchTerm);
  const currentCount = postsForCategory(activeCategory, term).length;
  announce(loading ? "loading posts." : term
    ? currentCount ? `${currentCount} matching posts.` : "nothing matches that search."
    : currentCount ? `${currentCount} posts in ${activeCategory}.` : "nothing published yet.");
  document.querySelectorAll(".post-list").forEach(function (list) {
    if (onlyCategory && list.dataset.category !== onlyCategory) return;
    list.replaceChildren();
    const items = postsForCategory(list.dataset.category, term);
    if (!items.length) {
      const state = document.createElement("div");
      state.className = "empty-state";
      const copy = document.createElement("p");
      copy.textContent = emptyCopy(list.dataset.category);
      state.append(copy);
      if (!loading && !normalizeSearch(searchTerm)) {
        const detail = document.createElement("p");
        detail.className = "empty-detail";
        detail.textContent = "this space is taking shape.";
        state.append(detail);
      }
      list.append(state);
      return;
    }
    items.forEach(function (post) {
      const item = document.createElement("div");
      item.className = "post-item";
      const title = document.createElement("button");
      title.className = "post-title";
      title.type = "button";
      title.dataset.postId = post.id;
      title.textContent = post.title;
      title.addEventListener("click", function () {
        showPost(post.id);
        setHash("post/" + post.id, false, { fromList: post.category });
      });
      item.append(title);
      if (canPublish && post.status === "draft") {
        const state = document.createElement("span");
        state.className = "post-state";
        state.textContent = "draft";
        item.append(state);
      }
      list.append(item);
    });
  });
}

function setHash(value, replace, state = null) {
  const hash = "#" + value;
  if (window.location.hash === hash) return;
  window.history[replace ? "replaceState" : "pushState"](state, "", hash);
}

function showPost(id, resetScroll = true, moveFocus = true) {
  const post = posts.find(function (item) { return item.id === id; });
  if (!post) return;
  resetCopyStatus();
  openPostId = id;
  document.title = `${post.title.replace(/\s+/g, " ").trim()} · archive`;
  shareAction.hidden = post.status !== "published";
  document.querySelector("#detail-error").hidden = true;
  document.querySelector("#detail-title").textContent = post.title;
  renderPostBody(post.body);
  const meta = document.querySelector("#detail-meta");
  meta.hidden = !(canPublish && post.status === "draft");
  const subtitle = document.querySelector("#detail-subtitle");
  subtitle.textContent = post.subtitle || "";
  subtitle.hidden = !post.subtitle;
  const link = document.querySelector("#detail-link");
  const href = safeLink(post.link || "");
  link.hidden = !href;
  if (href) {
    link.href = href;
    link.textContent = new URL(href).hostname;
  } else {
    link.removeAttribute("href");
    link.textContent = "";
  }
  ownerActions.hidden = !canPublish;
  newPostButton.hidden = true;
  searchRegion.hidden = true;
  panels.forEach(function (panel) { panel.hidden = true; });
  detail.hidden = false;
  if (resetScroll) detail.scrollTop = 0;
  if (moveFocus) detail.focus();
  announce(`opened ${post.title}.`);
}

function showMissingPost(moveFocus = true) {
  resetCopyStatus();
  document.title = "post unavailable · archive";
  shareAction.hidden = true;
  const alreadyShown = !detail.hidden && document.querySelector("#detail-title").textContent === "this post isn't available.";
  openPostId = null;
  document.querySelector("#detail-meta").hidden = true;
  document.querySelector("#detail-title").textContent = "this post isn't available.";
  document.querySelector("#detail-body").textContent = "the link may be out of date.";
  document.querySelector("#detail-subtitle").textContent = "";
  document.querySelector("#detail-subtitle").hidden = true;
  const link = document.querySelector("#detail-link");
  link.hidden = true;
  link.removeAttribute("href");
  link.textContent = "";
  document.querySelector("#detail-error").hidden = true;
  ownerActions.hidden = true;
  newPostButton.hidden = true;
  searchRegion.hidden = true;
  panels.forEach(function (panel) { panel.hidden = true; });
  detail.hidden = false;
  detail.scrollTop = 0;
  if (moveFocus && !alreadyShown) detail.focus();
  announce("this post isn't available.");
}

function showList(restoreFocus) {
  resetCopyStatus();
  document.title = "archive";
  shareAction.hidden = true;
  const previous = openPostId;
  openPostId = null;
  detail.hidden = true;
  syncSearch();
  newPostButton.hidden = !canPublish;
  panels.forEach(function (panel) {
    panel.hidden = panel.id !== "panel-" + activeCategory;
  });
  if (restoreFocus) {
    const button = Array.from(document.querySelectorAll("#panel-" + activeCategory + " .post-title"))
      .find(function (element) { return element.dataset.postId === previous; });
    (button || document.querySelector("#tab-" + activeCategory)).focus();
  }
}

function selectTab(tab) {
  activeCategory = tab.id.slice(4);
  tabs.forEach(function (item) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  showList(false);
  renderPosts(activeCategory);
}

function restoreLocation(moveFocus = true) {
  const hash = window.location.hash.slice(1);
  if (hash.indexOf("post/") === 0) {
    const id = hash.slice(5);
    const post = posts.find(function (item) { return item.id === id; });
    if (post) {
      if (openPostId !== post.id || activeCategory !== post.category) {
        selectTab(document.querySelector("#tab-" + post.category));
      }
      showPost(post.id, false, moveFocus);
      return;
    }
    if (!loading && !loadError) {
      showMissingPost(moveFocus);
      return;
    }
  }
  const category = categories.includes(hash) ? hash : "work";
  selectTab(document.querySelector("#tab-" + category));
  if (!categories.includes(hash)) setHash(category, true);
}

async function refreshPosts() {
  if (!client) return;
  const revision = ++postsRevision;
  loading = true;
  loadError = false;
  renderPosts();
  let result;
  try {
    let query = client.from("posts")
      .select("id, category, title, body, subtitle, link, status, published_at");
    if (!canPublish) query = query.eq("status", "published");
    result = await query.order("published_at", { ascending: false });
  } catch {
    result = { error: true };
  }
  if (revision !== postsRevision) return;
  loading = false;
  if (result.error) {
    posts = [];
    loadError = true;
    if (openPostId) showList(false);
    renderPosts();
    return;
  }
  posts = Array.isArray(result.data)
    ? result.data.filter(function (post) { return canPublish || post.status === "published"; })
    : [];
  searchIndex = new Map(posts.map(function (post) {
    return [post.id, normalizeSearch([post.title, post.subtitle, post.body].filter(Boolean).join(" "))];
  }));
  loadError = false;
  renderPosts();
  restoreLocation(!locationRestored);
  locationRestored = true;
}

function clearPrivateView() {
  ++postsRevision;
  canPublish = false;
  boardControls.hidden = true;
  posts = [];
  searchIndex.clear();
  searchTerm = "";
  loading = true;
  loadError = false;
  if (composer.open) composer.close();
  if (linksDialog.open) linksDialog.close();
  if (confirmDialog.open) confirmDialog.close("cancel");
  form.reset();
  editingId = null;
  const hadOpenPost = Boolean(openPostId);
  showList(false);
  if (hadOpenPost) setHash(activeCategory, true);
  document.querySelector("#detail-title").textContent = "";
  document.querySelector("#detail-body").textContent = "";
  document.querySelector("#detail-subtitle").textContent = "";
  const link = document.querySelector("#detail-link");
  link.removeAttribute("href");
  link.textContent = "";
  renderPosts();
}

async function refreshOwnerState() {
  if (!client) return;
  const revision = ++ownerRevision;
  let session = null;
  try {
    const sessionResult = await client.auth.getSession();
    session = sessionResult.data && sessionResult.data.session;
  } catch {
    session = null;
  }
  let nextCanPublish = false;
  if (session) {
    try {
      const result = await client.from("site_settings")
        .select("owner_id")
        .eq("singleton", true)
        .maybeSingle();
      nextCanPublish = Boolean(result.data && !result.error);
    } catch {
      nextCanPublish = false;
    }
  }
  if (revision !== ownerRevision) return false;
  if (canPublish && !nextCanPublish) clearPrivateView();
  canPublish = nextCanPublish;
  newPostButton.hidden = !canPublish || Boolean(openPostId);
  boardControls.hidden = !canPublish;
  ownerActions.hidden = !canPublish || !openPostId;
  return true;
}

function updateAboutFields() {
  const about = form.elements.category.value === "about";
  document.querySelector("#about-fields").hidden = !about;
  form.elements.subtitle.disabled = !about;
  form.elements.link.disabled = !about;
}

function updateComposerActions() {
  const saveDraft = document.querySelector("#save-draft");
  const publish = document.querySelector("#submit-post");
  if (!editingId) {
    saveDraft.textContent = "save draft";
    publish.textContent = "publish";
    return;
  }
  saveDraft.textContent = editingStatus === "draft" ? "save draft" : "move to drafts";
  publish.textContent = editingStatus === "draft" ? "publish" : "save";
}

function formSnapshot() {
  return JSON.stringify([
    form.elements.category.value,
    form.elements.title.value,
    form.elements.body.value,
    form.elements.subtitle.value,
    form.elements.link.value
  ]);
}

function openComposer(post) {
  if (!canPublish) return;
  form.reset();
  editingId = post ? post.id : null;
  editingStatus = post ? post.status : "published";
  form.elements.category.value = post ? post.category : activeCategory;
  form.elements.title.value = post ? post.title : "";
  form.elements.body.value = post ? post.body : "";
  form.elements.subtitle.value = post ? post.subtitle || "" : "";
  form.elements.link.value = post ? post.link || "" : "";
  document.querySelector("#composer-title").textContent = post ? "edit post" : "new post";
  document.querySelector("#form-error").hidden = true;
  updateAboutFields();
  updateComposerActions();
  initialFormState = formSnapshot();
  form.removeAttribute("aria-busy");
  composer.showModal();
  form.elements.title.focus();
}

function showFormError(message) {
  const error = document.querySelector("#form-error");
  error.textContent = message;
  error.hidden = false;
}

function askConfirmation(title, copy, action, cancelText = "keep post") {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-copy").textContent = copy;
  document.querySelector("#confirm-action").textContent = action;
  document.querySelector('#confirm-dialog button[value="cancel"]').textContent = cancelText;
  confirmDialog.returnValue = "";
  return new Promise(function (resolve) {
    confirmDialog.addEventListener("close", function () {
      resolve(confirmDialog.returnValue === "confirm");
    }, { once: true });
    confirmDialog.showModal();
  });
}

async function closeComposer() {
  if (savingPost || confirmDialog.open) return;
  if (formSnapshot() !== initialFormState) {
    const discard = await askConfirmation(
      "discard your changes?",
      "the text you entered has not been saved.",
      "discard changes",
      "keep editing"
    );
    if (!discard) return;
  }
  composer.close();
}

tabs.forEach(function (tab, index) {
  tab.addEventListener("click", function () {
    selectTab(tab);
    setHash(activeCategory);
  });
  tab.addEventListener("keydown", function (event) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    selectTab(tabs[next]);
    setHash(activeCategory);
  });
});

searchInput.addEventListener("input", function () {
  searchTerm = searchInput.value;
  renderPosts(activeCategory);
  document.querySelector("#panel-" + activeCategory + " .post-list").scrollTop = 0;
});
clearSearchButton.addEventListener("click", function () {
  searchTerm = "";
  renderPosts(activeCategory);
  document.querySelector("#panel-" + activeCategory + " .post-list").scrollTop = 0;
  searchInput.focus();
});
window.addEventListener("hashchange", restoreLocation);
document.querySelector("#back-to-list").addEventListener("click", function () {
  const cameFromList = window.history.state?.fromList === activeCategory;
  showList(true);
  if (cameFromList) window.history.back();
  else setHash(activeCategory, true);
});
document.querySelector("#copy-post-link").addEventListener("click", async function () {
  if (!openPostId) return;
  const id = openPostId;
  try {
    await navigator.clipboard.writeText(postUrl(id));
    if (openPostId !== id) return;
    copyStatus.textContent = "link copied.";
    announce("post link copied.");
  } catch {
    if (openPostId !== id) return;
    copyStatus.textContent = "couldn't copy the link here.";
  }
  window.clearTimeout(copyStatusTimer);
  copyStatusTimer = window.setTimeout(function () { copyStatus.textContent = ""; }, 4000);
});
newPostButton.addEventListener("click", function () { openComposer(null); });
document.querySelector("#edit-post").addEventListener("click", function () {
  openComposer(posts.find(function (post) { return post.id === openPostId; }));
});
document.querySelector("#cancel-composer").addEventListener("click", () => { void closeComposer(); });
document.querySelector("#edit-links").addEventListener("click", async function () {
  if (!canPublish || savingLinks) return;
  if (!await refreshContactLinks()) {
    announce("couldn't load external links. please try again.");
    return;
  }
  contactPlatforms.forEach(function (platform) {
    const url = contactLinks.get(platform) || "";
    linksForm.elements[platform].value = platform === "email" ? url.replace(/^mailto:/, "") : url;
  });
  document.querySelector("#links-error").hidden = true;
  linksDialog.showModal();
  linksForm.elements.email.focus();
});
document.querySelector("#close-links").addEventListener("click", function () { linksDialog.close(); });
linksForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!canPublish || !client || savingLinks) return;
  const entries = [];
  const error = document.querySelector("#links-error");
  error.hidden = true;
  for (const platform of contactPlatforms) {
    const raw = linksForm.elements[platform].value.trim();
    const url = safeContactLink(platform, raw);
    if (raw && !url) {
      error.textContent = platform === "email" ? "enter a valid email address." : `enter a valid ${platform} https link.`;
      error.hidden = false;
      linksForm.elements[platform].focus();
      return;
    }
    entries.push({ platform, url });
  }
  savingLinks = true;
  linksForm.setAttribute("aria-busy", "true");
  const controls = Array.from(linksForm.querySelectorAll("button, input"));
  controls.forEach(function (control) { control.disabled = true; });
  let result;
  try {
    result = await client.from("external_links").upsert(entries, { onConflict: "platform" });
  } catch {
    result = { error: true };
  }
  savingLinks = false;
  linksForm.removeAttribute("aria-busy");
  controls.forEach(function (control) { control.disabled = false; });
  if (!canPublish) return;
  if (result.error) {
    error.textContent = "couldn't save the links. nothing in this form was cleared.";
    error.hidden = false;
    return;
  }
  contactLinks = new Map(entries.map(function (entry) { return [entry.platform, entry.url]; }));
  renderContactLinks();
  linksDialog.close();
  announce("external links saved.");
});
composer.addEventListener("cancel", function (event) {
  event.preventDefault();
  void closeComposer();
});
form.elements.category.addEventListener("change", updateAboutFields);

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!canPublish || !client || savingPost) return;
  const intent = event.submitter && event.submitter.value === "draft" ? "draft" : "published";
  const payload = {
    category: form.elements.category.value,
    title: form.elements.title.value.trim(),
    body: form.elements.body.value.trim(),
    subtitle: form.elements.category.value === "about" ? form.elements.subtitle.value.trim() || null : null,
    link: form.elements.category.value === "about" ? form.elements.link.value.trim() || null : null,
    status: intent
  };
  if (!payload.title || !payload.body) {
    showFormError("please add a title and some text.");
    return;
  }
  if (payload.link && !safeLink(payload.link)) {
    showFormError("please use a full http or https link.");
    return;
  }
  if (intent === "published" && editingStatus === "draft") payload.published_at = new Date().toISOString();
  const buttons = [document.querySelector("#save-draft"), document.querySelector("#submit-post"), document.querySelector("#cancel-composer")];
  const fields = [form.elements.category, form.elements.title, form.elements.body, form.elements.subtitle, form.elements.link];
  savingPost = true;
  buttons.forEach(function (button) { button.disabled = true; });
  fields.forEach(function (field) { field.disabled = true; });
  form.setAttribute("aria-busy", "true");
  announce("saving post.");
  document.querySelector("#form-error").hidden = true;
  const query = editingId
    ? client.from("posts").update(payload).eq("id", editingId).select().single()
    : client.from("posts").insert(payload).select().single();
  let result;
  try {
    result = await query;
  } catch {
    result = { error: true };
  }
  savingPost = false;
  buttons.forEach(function (button) { button.disabled = false; });
  fields.forEach(function (field) { field.disabled = false; });
  updateAboutFields();
  form.removeAttribute("aria-busy");
  if (!canPublish) return;
  if (result.error || !result.data) {
    showFormError("could not save this post. your text is still here.");
    return;
  }
  composer.close();
  announce(intent === "draft" ? "draft saved." : "post saved.");
  editingStatus = result.data.status;
  await refreshPosts();
  selectTab(document.querySelector("#tab-" + result.data.category));
  if (editingId) {
    showPost(result.data.id);
    setHash("post/" + result.data.id, true);
  } else {
    setHash(result.data.category, true);
  }
});

document.querySelector("#delete-post").addEventListener("click", async function () {
  if (!canPublish || !client || !openPostId || deletingPost) return;
  const postId = openPostId;
  const confirmed = await askConfirmation("delete this post?", "this can't be undone.", "delete");
  if (!confirmed || !canPublish) return;
  deletingPost = true;
  const actionButtons = Array.from(ownerActions.querySelectorAll("button"));
  actionButtons.forEach(function (button) { button.disabled = true; });
  ownerActions.setAttribute("aria-busy", "true");
  announce("deleting post.");
  let result;
  try {
    result = await client.from("posts").delete().eq("id", postId);
  } catch {
    result = { error: true };
  }
  deletingPost = false;
  actionButtons.forEach(function (button) { button.disabled = false; });
  ownerActions.removeAttribute("aria-busy");
  if (!canPublish) return;
  if (result.error) {
    const error = document.querySelector("#detail-error");
    error.textContent = "couldn't delete this post.";
    error.hidden = false;
    return;
  }
  announce("post deleted.");
  showList(false);
  setHash(activeCategory, true);
  await refreshPosts();
});

function openAuthDialog() {
  document.querySelector("#auth-error").hidden = true;
  document.querySelector("#auth-copy").textContent = "enter your email to receive a sign-in link.";
  const emailInput = document.querySelector("#auth-email");
  emailInput.removeAttribute("aria-invalid");
  emailInput.removeAttribute("aria-describedby");
  const button = document.querySelector("#send-sign-in");
  const secondsRemaining = Math.ceil((nextMagicLinkAt - Date.now()) / 1000);
  emailInput.disabled = secondsRemaining > 0;
  button.disabled = secondsRemaining > 0;
  button.textContent = secondsRemaining > 0 ? "link sent" : "send link";
  if (secondsRemaining <= 0) emailInput.value = "";
  authDialog.showModal();
  if (secondsRemaining <= 0) emailInput.focus();
}

document.querySelector("#cancel-auth").addEventListener("click", function () { authDialog.close(); });
authForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const secondsRemaining = Math.ceil((nextMagicLinkAt - Date.now()) / 1000);
  if (secondsRemaining > 0) {
    const error = document.querySelector("#auth-error");
    error.textContent = "a link was just sent. try again in about a minute.";
    error.hidden = false;
    return;
  }
  const emailInput = document.querySelector("#auth-email");
  const email = emailInput.value.trim();
  const error = document.querySelector("#auth-error");
  if (!email || !emailInput.checkValidity()) {
    error.textContent = "enter a valid email address.";
    error.hidden = false;
    emailInput.setAttribute("aria-invalid", "true");
    emailInput.setAttribute("aria-describedby", "auth-error");
    return;
  }
  error.hidden = true;
  emailInput.removeAttribute("aria-invalid");
  emailInput.removeAttribute("aria-describedby");
  const button = document.querySelector("#send-sign-in");
  button.disabled = true;
  button.textContent = "sending...";
  let result;
  try {
    result = await client.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname + "?manage=1",
        shouldCreateUser: false
      }
    });
  } catch {
    result = { error: true };
  }
  button.disabled = false;
  button.textContent = "send link";
  if (result.error) {
    error.textContent = "couldn't send the sign-in link. please try again.";
    error.hidden = false;
    emailInput.setAttribute("aria-describedby", "auth-error");
    return;
  }
  nextMagicLinkAt = Date.now() + magicLinkCooldownMs;
  emailInput.disabled = true;
  button.disabled = true;
  button.textContent = "link sent";
  document.querySelector("#auth-copy").textContent = "check your inbox for the sign-in link.";
  announce("sign-in link sent.");
  window.setTimeout(function () {
    if (Date.now() < nextMagicLinkAt) return;
    emailInput.disabled = false;
    button.disabled = false;
    button.textContent = "send link";
  }, magicLinkCooldownMs);
});

function showAuthLinkError() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("error")) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search + "#work");
  document.querySelector("#auth-error").textContent = "this sign-in link is no longer valid. request a new one.";
  document.querySelector("#auth-error").hidden = false;
  document.querySelector("#auth-copy").textContent = "enter your email to receive a fresh sign-in link.";
  authDialog.showModal();
  document.querySelector("#auth-email").setAttribute("aria-describedby", "auth-error");
  document.querySelector("#auth-email").focus();
}

function isOwnerRoute() {
  return new URLSearchParams(window.location.search).get("manage") === "1";
}

async function start() {
  renderPosts();
  if (!hasConfig) return;
  if (!window.supabase) {
    loading = false;
    loadError = true;
    renderPosts();
    return;
  }
  try {
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  } catch {
    loading = false;
    loadError = true;
    renderPosts();
    return;
  }
  client.auth.onAuthStateChange(function (event) {
    if (event === "INITIAL_SESSION") return;
    ++ownerRevision;
    if (event === "SIGNED_OUT") clearPrivateView();
    window.setTimeout(async function () {
      const current = await refreshOwnerState();
      if (!current) return;
      await Promise.all([refreshPosts(), refreshContactLinks()]);
      if (event === "SIGNED_IN" && canPublish && authDialog.open) authDialog.close();
    }, 0);
  });
  showAuthLinkError();
  if (await refreshOwnerState()) await Promise.all([refreshPosts(), refreshContactLinks()]);
  if (isOwnerRoute() && !canPublish && !authDialog.open) openAuthDialog();
}

if (window.self !== window.top) {
  // GitHub Pages cannot send frame-ancestors or X-Frame-Options for this site.
  const page = document.querySelector(".page");
  page.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "frame-notice";
  notice.textContent = "open this page directly.";
  page.append(notice);
} else {
  void start();
}
