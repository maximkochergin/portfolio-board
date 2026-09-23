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
const deskToken = document.querySelector("#desk-token");
const tokenCard = document.querySelector("#token-card");

const config = window.portfolioConfig || {};
const hasConfig = typeof config.supabaseUrl === "string"
  && /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl)
  && typeof config.supabaseAnonKey === "string"
  && config.supabaseAnonKey.length > 20;
const categories = ["work", "notes", "about"];
const magicLinkCooldownMs = 60 * 1000;

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

function safeLink(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeSearch(value) {
  return value.toLocaleLowerCase().trim();
}

function matchesSearch(post) {
  if (!searchTerm) return true;
  return [post.title, post.subtitle, post.body].filter(Boolean).join(" ").toLocaleLowerCase().includes(searchTerm);
}

function postsForCategory(category) {
  return posts.filter(function (post) {
    return post.category === category && matchesSearch(post);
  });
}

function emptyCopy(category) {
  if (searchTerm) return "nothing matches that search.";
  if (loading) return "loading...";
  if (loadError) return "couldn't load this page.";
  if (category === "about") return "a little more soon.";
  return "nothing published yet.";
}

function syncSearch() {
  const showSearch = Boolean(posts.length || searchTerm);
  searchRegion.hidden = !showSearch;
  clearSearchButton.hidden = !searchTerm;
  if (searchInput.value !== searchTerm) searchInput.value = searchTerm;
}

function showMessage(message, retry) {
  searchRegion.hidden = true;
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
      button.addEventListener("click", refreshPosts);
      state.append(button);
    }
    list.append(state);
  });
}

function renderPosts() {
  if (!hasConfig) {
    showMessage("this place is being connected.");
    return;
  }
  syncSearch();
  document.querySelectorAll(".post-list").forEach(function (list) {
    list.replaceChildren();
    const items = postsForCategory(list.dataset.category);
    if (!items.length) {
      const state = document.createElement("div");
      state.className = "empty-state";
      const copy = document.createElement("p");
      copy.textContent = emptyCopy(list.dataset.category);
      state.append(copy);
      if (loadError) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plain";
        button.textContent = "try again";
        button.addEventListener("click", refreshPosts);
        state.append(button);
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
        setHash("post/" + post.id);
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

function setHash(value, replace) {
  const hash = "#" + value;
  if (window.location.hash === hash) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", hash);
}

function showPost(id, resetScroll) {
  const post = posts.find(function (item) { return item.id === id; });
  if (!post) return;
  openPostId = id;
  document.querySelector("#detail-error").hidden = true;
  document.querySelector("#detail-title").textContent = post.title;
  document.querySelector("#detail-body").textContent = post.body;
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
  }
  ownerActions.hidden = !canPublish;
  newPostButton.hidden = true;
  searchRegion.hidden = true;
  panels.forEach(function (panel) { panel.hidden = true; });
  detail.hidden = false;
  if (resetScroll !== false) detail.scrollTop = 0;
  detail.focus();
}

function showList(restoreFocus) {
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
}

function restoreLocation() {
  const hash = window.location.hash.slice(1);
  if (hash.indexOf("post/") === 0) {
    const id = hash.slice(5);
    const post = posts.find(function (item) { return item.id === id; });
    if (post) {
      selectTab(document.querySelector("#tab-" + post.category));
      showPost(post.id, false);
      return;
    }
  }
  const category = categories.includes(hash) ? hash : "work";
  selectTab(document.querySelector("#tab-" + category));
  if (!categories.includes(hash)) setHash(category, true);
}

async function refreshPosts() {
  if (!client) return;
  loading = true;
  loadError = false;
  renderPosts();
  let result;
  try {
    result = await client.from("posts")
      .select("id, category, title, body, subtitle, link, status, published_at")
      .order("published_at", { ascending: false });
  } catch {
    loading = false;
    loadError = true;
    renderPosts();
    return;
  }
  loading = false;
  if (result.error) {
    loadError = true;
    renderPosts();
    return;
  }
  posts = Array.isArray(result.data) ? result.data : [];
  loadError = false;
  renderPosts();
  restoreLocation();
}

async function refreshOwnerState() {
  if (!client) return;
  let session = null;
  try {
    const sessionResult = await client.auth.getSession();
    session = sessionResult.data && sessionResult.data.session;
  } catch {
    session = null;
  }
  canPublish = false;
  if (session) {
    try {
      const result = await client.from("site_settings")
        .select("owner_id")
        .eq("singleton", true)
        .maybeSingle();
      canPublish = Boolean(result.data && !result.error);
    } catch {
      canPublish = false;
    }
  }
  newPostButton.hidden = !canPublish || Boolean(openPostId);
  ownerActions.hidden = !canPublish || !openPostId;
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
  composer.showModal();
  form.elements.title.focus();
}

function showFormError(message) {
  const error = document.querySelector("#form-error");
  error.textContent = message;
  error.hidden = false;
}

function askConfirmation(title, copy, action) {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-copy").textContent = copy;
  document.querySelector("#confirm-action").textContent = action;
  confirmDialog.returnValue = "";
  return new Promise(function (resolve) {
    confirmDialog.addEventListener("close", function () {
      resolve(confirmDialog.returnValue === "confirm");
    }, { once: true });
    confirmDialog.showModal();
  });
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
  searchTerm = normalizeSearch(searchInput.value);
  renderPosts();
  showList(false);
});
clearSearchButton.addEventListener("click", function () {
  searchTerm = "";
  renderPosts();
  showList(false);
  searchInput.focus();
});
window.addEventListener("hashchange", restoreLocation);
document.querySelector("#back-to-list").addEventListener("click", function () {
  showList(true);
  setHash(activeCategory, true);
});
newPostButton.addEventListener("click", function () { openComposer(null); });
document.querySelector("#edit-post").addEventListener("click", function () {
  openComposer(posts.find(function (post) { return post.id === openPostId; }));
});
document.querySelector("#cancel-composer").addEventListener("click", function () { composer.close(); });
form.elements.category.addEventListener("change", updateAboutFields);

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!canPublish || !client) return;
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
  const buttons = [document.querySelector("#save-draft"), document.querySelector("#submit-post")];
  buttons.forEach(function (button) { button.disabled = true; });
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
  buttons.forEach(function (button) { button.disabled = false; });
  if (result.error || !result.data) {
    showFormError("could not save this post. your text is still here.");
    return;
  }
  composer.close();
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
  if (!canPublish || !client || !openPostId) return;
  const confirmed = await askConfirmation("delete this post?", "this can't be undone.", "delete");
  if (!confirmed) return;
  let result;
  try {
    result = await client.from("posts").delete().eq("id", openPostId);
  } catch {
    result = { error: true };
  }
  if (result.error) {
    const error = document.querySelector("#detail-error");
    error.textContent = "couldn't delete this post.";
    error.hidden = false;
    return;
  }
  showList(false);
  setHash(activeCategory, true);
  await refreshPosts();
});

function openAuthDialog() {
  document.querySelector("#auth-error").hidden = true;
  document.querySelector("#auth-copy").textContent = "enter your email to receive a sign-in link.";
  const emailInput = document.querySelector("#auth-email");
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
    return;
  }
  const button = document.querySelector("#send-sign-in");
  button.disabled = true;
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
  if (result.error) {
    error.textContent = "couldn't send the sign-in link. please try again.";
    error.hidden = false;
    return;
  }
  nextMagicLinkAt = Date.now() + magicLinkCooldownMs;
  emailInput.disabled = true;
  button.textContent = "link sent";
  document.querySelector("#auth-copy").textContent = "check your inbox for the sign-in link.";
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
  document.querySelector("#auth-email").focus();
}

function isOwnerRoute() {
  return new URLSearchParams(window.location.search).get("manage") === "1";
}

function enableDeskToken() {
  if (!deskToken || !tokenCard || window.matchMedia("(max-width: 42rem)").matches) return;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let dragged = false;
  let suppressTokenClick = false;
  function place(x, y) {
    const limitX = Math.max(0, window.innerWidth - deskToken.offsetWidth - 20);
    const limitY = Math.max(0, window.innerHeight - deskToken.offsetHeight - 20);
    offsetX = Math.min(limitX, Math.max(-limitX, x));
    offsetY = Math.min(limitY, Math.max(-limitY, y));
    deskToken.style.setProperty("--token-x", offsetX + "px");
    deskToken.style.setProperty("--token-y", offsetY + "px");
  }
  tokenCard.addEventListener("pointerdown", function (event) {
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragged = false;
    tokenCard.setPointerCapture(pointerId);
    tokenCard.classList.add("is-dragging");
  });
  tokenCard.addEventListener("pointermove", function (event) {
    if (event.pointerId !== pointerId) return;
    const distanceX = event.clientX - startX;
    const distanceY = event.clientY - startY;
    if (Math.abs(distanceX) > 4 || Math.abs(distanceY) > 4) dragged = true;
    if (dragged) place(offsetX + distanceX, offsetY + distanceY);
    startX = event.clientX;
    startY = event.clientY;
  });
  tokenCard.addEventListener("pointerup", function (event) {
    if (event.pointerId !== pointerId) return;
    if (tokenCard.hasPointerCapture(pointerId)) tokenCard.releasePointerCapture(pointerId);
    tokenCard.classList.remove("is-dragging");
    pointerId = null;
    suppressTokenClick = dragged;
    if (suppressTokenClick) window.setTimeout(function () { suppressTokenClick = false; }, 0);
  });
  tokenCard.addEventListener("click", function () {
    if (suppressTokenClick) {
      suppressTokenClick = false;
      return;
    }
    const colored = tokenCard.classList.toggle("is-color");
    tokenCard.setAttribute("aria-pressed", String(colored));
  });
  tokenCard.addEventListener("pointercancel", function () {
    pointerId = null;
    tokenCard.classList.remove("is-dragging");
  });
}

async function start() {
  renderPosts();
  if (!hasConfig || !window.supabase) return;
  client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  client.auth.onAuthStateChange(function (event) {
    void refreshOwnerState().then(async function () {
      await refreshPosts();
      if (event === "SIGNED_IN" && canPublish && authDialog.open) authDialog.close();
    });
  });
  showAuthLinkError();
  await refreshOwnerState();
  await refreshPosts();
  if (isOwnerRoute() && !canPublish && !authDialog.open) openAuthDialog();
}

enableDeskToken();
start();
