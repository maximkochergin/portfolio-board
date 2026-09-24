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
let postsRevision = 0;
let ownerRevision = 0;
let savingPost = false;

function safeLink(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeSearch(value) {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function matchesSearch(post) {
  const term = normalizeSearch(searchTerm);
  if (!term) return true;
  return normalizeSearch([post.title, post.subtitle, post.body].filter(Boolean).join(" ")).includes(term);
}

function postsForCategory(category) {
  return posts.filter(function (post) {
    return post.category === category && matchesSearch(post);
  });
}

function emptyCopy() {
  if (normalizeSearch(searchTerm)) return "nothing matches that search.";
  if (loading) return "loading...";
  if (loadError) return "couldn't load this page.";
  return "nothing published yet.";
}

function syncSearch() {
  const showSearch = Boolean(posts.length || normalizeSearch(searchTerm));
  searchRegion.hidden = !showSearch;
  clearSearchButton.hidden = !searchTerm;
  if (searchInput.value !== searchTerm) searchInput.value = searchTerm;
}

function retryPosts() {
  if (client) void refreshPosts();
  else window.location.reload();
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
      button.addEventListener("click", retryPosts);
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
  if (loadError) {
    showMessage("couldn't load this page.", true);
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
      copy.textContent = emptyCopy();
      state.append(copy);
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
  loadError = false;
  renderPosts();
  restoreLocation();
}

function clearPrivateView() {
  ++postsRevision;
  canPublish = false;
  posts = [];
  searchTerm = "";
  loading = true;
  loadError = false;
  if (composer.open) composer.close();
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
  searchTerm = searchInput.value;
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
  const cameFromList = window.history.state?.fromList === activeCategory;
  showList(true);
  if (cameFromList) window.history.back();
  else setHash(activeCategory, true);
});
newPostButton.addEventListener("click", function () { openComposer(null); });
document.querySelector("#edit-post").addEventListener("click", function () {
  openComposer(posts.find(function (post) { return post.id === openPostId; }));
});
document.querySelector("#cancel-composer").addEventListener("click", function () {
  if (!savingPost) composer.close();
});
composer.addEventListener("cancel", function (event) {
  if (savingPost) event.preventDefault();
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
  savingPost = true;
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
  savingPost = false;
  buttons.forEach(function (button) { button.disabled = false; });
  if (!canPublish) return;
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
  button.disabled = true;
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
  if (!deskToken || !tokenCard) return;
  const board = document.querySelector(".board");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const edge = 12;
  const boardGap = 4;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let left = 0;
  let top = 0;
  let placed = false;
  let dragged = false;
  let suppressTokenClick = false;
  let bounds = null;
  let touchTimer = null;
  function clearBoardTouch() {
    window.clearTimeout(touchTimer);
    touchTimer = null;
    board?.classList.remove("is-touched");
  }
  function touchBoard(hit, dx, dy, brief) {
    clearBoardTouch();
    if (!board || !hit) return;
    board.style.setProperty("--paper-push-x", (hit.axis === "x" ? Math.sign(dx) * 2 : 0) + "px");
    board.style.setProperty("--paper-push-y", (hit.axis === "y" ? Math.sign(dy) * 2 : 0) + "px");
    board.classList.add("is-touched");
    if (brief) touchTimer = window.setTimeout(clearBoardTouch, 180);
  }
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }
  function measure() {
    clearBoardTouch();
    const tokenRect = deskToken.getBoundingClientRect();
    if (!tokenRect.width || !tokenRect.height) {
      bounds = null;
      return;
    }
    const boardRect = board && board.getBoundingClientRect();
    bounds = {
      maxX: Math.max(edge, window.innerWidth - tokenRect.width - edge),
      maxY: Math.max(edge, window.innerHeight - tokenRect.height - edge),
      wall: boardRect && {
        left: boardRect.left - tokenRect.width - boardGap,
        right: boardRect.right + boardGap,
        top: boardRect.top - tokenRect.height - boardGap,
        bottom: boardRect.bottom + boardGap
      }
    };
  }
  function overlapsBoard(point) {
    const wall = bounds.wall;
    return wall && point.x > wall.left && point.x < wall.right
      && point.y > wall.top && point.y < wall.bottom;
  }
  function safePosition(x, y) {
    const desired = { x: clamp(x, edge, bounds.maxX), y: clamp(y, edge, bounds.maxY) };
    if (!overlapsBoard(desired)) return desired;
    const wall = bounds.wall;
    const candidates = [
      { x: wall.left, y: desired.y },
      { x: wall.right, y: desired.y },
      { x: desired.x, y: wall.top },
      { x: desired.x, y: wall.bottom }
    ].map(function (point) {
      return { x: clamp(point.x, edge, bounds.maxX), y: clamp(point.y, edge, bounds.maxY) };
    }).filter(function (point) { return !overlapsBoard(point); });
    if (!candidates.length) return desired;
    candidates.sort(function (a, b) {
      const distanceA = (a.x - desired.x) ** 2 + (a.y - desired.y) ** 2;
      const distanceB = (b.x - desired.x) ** 2 + (b.y - desired.y) ** 2;
      return distanceA - distanceB;
    });
    return candidates[0];
  }
  function place(point) {
    if (!bounds) return;
    if (placed && point.x === left && point.y === top) return;
    left = point.x;
    top = point.y;
    deskToken.style.left = left + "px";
    deskToken.style.top = top + "px";
    deskToken.style.right = "auto";
    deskToken.style.bottom = "auto";
    placed = true;
  }
  // Sweep the token's top-left corner against the board enlarged by its own size.
  // This catches fast pointer moves that would otherwise skip straight across it.
  function collision(dx, dy) {
    const wall = bounds.wall;
    if (!wall || (!dx && !dy)) return null;
    let enterX = -Infinity;
    let leaveX = Infinity;
    let enterY = -Infinity;
    let leaveY = Infinity;
    if (dx) {
      const a = (wall.left - left) / dx;
      const b = (wall.right - left) / dx;
      enterX = Math.min(a, b);
      leaveX = Math.max(a, b);
    } else if (left <= wall.left || left >= wall.right) return null;
    if (dy) {
      const a = (wall.top - top) / dy;
      const b = (wall.bottom - top) / dy;
      enterY = Math.min(a, b);
      leaveY = Math.max(a, b);
    } else if (top <= wall.top || top >= wall.bottom) return null;
    const time = Math.max(enterX, enterY);
    if (time < 0 || time > 1 || time >= Math.min(leaveX, leaveY)) return null;
    return {
      time,
      axis: enterX === enterY ? (Math.abs(dx) > Math.abs(dy) ? "x" : "y")
        : enterX > enterY ? "x" : "y"
    };
  }
  function moveBy(deltaX, deltaY) {
    if (!bounds) return null;
    const targetX = clamp(left + deltaX, edge, bounds.maxX);
    const targetY = clamp(top + deltaY, edge, bounds.maxY);
    const dx = targetX - left;
    const dy = targetY - top;
    const hit = collision(dx, dy);
    if (!hit) {
      place({ x: targetX, y: targetY });
      return null;
    }
    // Keep the contact edge fixed and spend the remaining motion along it.
    // Releasing or reversing the pointer responds immediately, with no snap.
    const wall = bounds.wall;
    if (hit.axis === "x") {
      place({ x: dx > 0 ? wall.left : wall.right, y: targetY });
    } else {
      place({ x: targetX, y: dy > 0 ? wall.top : wall.bottom });
    }
    return hit;
  }
  function tilt(x, y, z) {
    if (reducedMotion.matches) {
      x = 0;
      y = tokenCard.classList.contains("is-turned") ? 28 : -14;
      z = tokenCard.classList.contains("is-turned") ? 3 : -4;
    }
    tokenCard.style.setProperty("--tilt-x", x + "deg");
    tokenCard.style.setProperty("--tilt-y", y + "deg");
    tokenCard.style.setProperty("--tilt-z", z + "deg");
  }
  function rest() {
    const turned = tokenCard.classList.contains("is-turned");
    tilt(0, turned ? 28 : -14, turned ? 3 : -4);
  }
  function hover(event) {
    const rect = tokenCard.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) - 0.5;
    const base = tokenCard.classList.contains("is-turned") ? 28 : -14;
    tilt(-y * 15, base + x * 18, x * 5);
  }
  function fitToViewport() {
    measure();
    if (!bounds) return;
    if (placed) place(safePosition(left, top));
    else {
      const initial = deskToken.getBoundingClientRect();
      place(safePosition(initial.left, initial.top));
    }
  }
  fitToViewport();
  tokenCard.addEventListener("pointerdown", function (event) {
    if (!bounds || pointerId !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastPointerX = startX;
    lastPointerY = startY;
    dragged = false;
    tokenCard.setPointerCapture(pointerId);
  });
  tokenCard.addEventListener("pointermove", function (event) {
    if (event.pointerId !== pointerId) {
      if (event.pointerType === "mouse") hover(event);
      return;
    }
    const wasDragging = dragged;
    if (!dragged && Math.hypot(event.clientX - startX, event.clientY - startY) > 5) {
      dragged = true;
      tokenCard.classList.add("is-dragging");
    }
    if (dragged) {
      const dx = event.clientX - (wasDragging ? lastPointerX : startX);
      const dy = event.clientY - (wasDragging ? lastPointerY : startY);
      const hit = moveBy(dx, dy);
      tokenCard.classList.toggle("is-blocked", Boolean(hit));
      touchBoard(hit, dx, dy, false);
      const base = tokenCard.classList.contains("is-turned") ? 28 : -14;
      tilt(clamp(-dy / 3, -11, 11), base + clamp(dx / 3, -12, 12), clamp(dx / 5, -7, 7));
    }
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  });
  tokenCard.addEventListener("pointerup", function (event) {
    if (event.pointerId !== pointerId) return;
    const activePointerId = pointerId;
    pointerId = null;
    if (tokenCard.hasPointerCapture(activePointerId)) tokenCard.releasePointerCapture(activePointerId);
    tokenCard.classList.remove("is-dragging", "is-blocked");
    if (board?.classList.contains("is-touched")) {
      touchTimer = window.setTimeout(clearBoardTouch, 120);
    } else clearBoardTouch();
    rest();
    suppressTokenClick = dragged;
    if (suppressTokenClick) window.setTimeout(function () { suppressTokenClick = false; }, 0);
  });
  tokenCard.addEventListener("click", function () {
    if (suppressTokenClick) {
      suppressTokenClick = false;
      return;
    }
    const turned = tokenCard.classList.toggle("is-turned");
    tokenCard.setAttribute("aria-pressed", String(turned));
    rest();
  });
  tokenCard.addEventListener("pointercancel", function () {
    pointerId = null;
    tokenCard.classList.remove("is-dragging", "is-blocked");
    clearBoardTouch();
    rest();
  });
  tokenCard.addEventListener("lostpointercapture", function () {
    if (pointerId === null) return;
    pointerId = null;
    tokenCard.classList.remove("is-dragging", "is-blocked");
    clearBoardTouch();
    rest();
  });
  tokenCard.addEventListener("pointerleave", function () {
    if (pointerId === null) rest();
  });
  tokenCard.addEventListener("keydown", function (event) {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 16;
    const dx = direction[0] * step;
    const dy = direction[1] * step;
    const hit = moveBy(dx, dy);
    touchBoard(hit, dx, dy, true);
  });
  window.addEventListener("resize", fitToViewport);
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
      await refreshPosts();
      if (event === "SIGNED_IN" && canPublish && authDialog.open) authDialog.close();
    }, 0);
  });
  showAuthLinkError();
  if (await refreshOwnerState()) await refreshPosts();
  if (isOwnerRoute() && !canPublish && !authDialog.open) openAuthDialog();
}

if (window.self !== window.top) {
  // GitHub Pages cannot send frame-ancestors or X-Frame-Options for this site.
  deskToken?.remove();
  const page = document.querySelector(".page");
  page.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "frame-notice";
  notice.textContent = "open this page directly.";
  page.append(notice);
} else {
  enableDeskToken();
  void start();
}
