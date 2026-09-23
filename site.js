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

const config = window.portfolioConfig || {};
const hasConfig = typeof config.supabaseUrl === "string"
  && /^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl)
  && typeof config.supabaseAnonKey === "string"
  && config.supabaseAnonKey.length > 20;

let client = null;
let posts = [];
let activeCategory = "work";
let openPostId = null;
let editingId = null;
let canPublish = false;
let loading = true;
let loadError = false;
let nextMagicLinkAt = 0;

const magicLinkCooldownMs = 60 * 1000;

function safeLink(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function showMessage(message, retry) {
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
  document.querySelectorAll(".post-list").forEach(function (list) {
    list.replaceChildren();
    const items = posts.filter(function (post) { return post.category === list.dataset.category; });
    if (!items.length) {
      const state = document.createElement("div");
      state.className = "empty-state";
      const copy = document.createElement("p");
      copy.textContent = loading ? "loading..." : loadError ? "couldn't load this page." : "nothing published yet.";
      state.append(copy);
      if (loadError) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "plain";
        retry.textContent = "try again";
        retry.addEventListener("click", refreshPosts);
        state.append(retry);
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
  panels.forEach(function (panel) { panel.hidden = true; });
  detail.hidden = false;
  if (resetScroll !== false) detail.scrollTop = 0;
  detail.focus();
}

function showList(restoreFocus) {
  const previous = openPostId;
  openPostId = null;
  detail.hidden = true;
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
  const category = ["work", "notes", "about"].includes(hash) ? hash : "work";
  selectTab(document.querySelector("#tab-" + category));
}

async function refreshPosts() {
  if (!client) return;
  loading = true;
  renderPosts();
  let result;
  try {
    result = await client.from("posts").select("id, category, title, body, subtitle, link, published_at").order("published_at", { ascending: false });
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

function openComposer(post) {
  if (!canPublish) return;
  form.reset();
  editingId = post ? post.id : null;
  form.elements.category.value = post ? post.category : activeCategory;
  form.elements.title.value = post ? post.title : "";
  form.elements.body.value = post ? post.body : "";
  form.elements.subtitle.value = post ? post.subtitle || "" : "";
  form.elements.link.value = post ? post.link || "" : "";
  document.querySelector("#composer-title").textContent = post ? "edit post" : "new post";
  document.querySelector("#submit-post").textContent = post ? "save" : "publish";
  document.querySelector("#form-error").hidden = true;
  updateAboutFields();
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

window.addEventListener("hashchange", restoreLocation);
document.querySelector("#back-to-list").addEventListener("click", function () {
  showList(true);
  setHash(activeCategory, true);
});
newPostButton.addEventListener("click", function () { openComposer(null); });
document.querySelector("#edit-post").addEventListener("click", function () {
  openComposer(posts.find(function (post) { return post.id === openPostId; }));
});
document.querySelector("#close-composer").addEventListener("click", function () { composer.close(); });
document.querySelector("#cancel-composer").addEventListener("click", function () { composer.close(); });
form.elements.category.addEventListener("change", updateAboutFields);

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!canPublish || !client) return;
  const payload = {
    category: form.elements.category.value,
    title: form.elements.title.value.trim(),
    body: form.elements.body.value.trim(),
    subtitle: form.elements.category.value === "about" ? form.elements.subtitle.value.trim() || null : null,
    link: form.elements.category.value === "about" ? form.elements.link.value.trim() || null : null
  };
  if (!payload.title || !payload.body) {
    showFormError("please add a title and some text.");
    return;
  }
  if (payload.link && !safeLink(payload.link)) {
    showFormError("please use a full http or https link.");
    return;
  }
  const button = document.querySelector("#submit-post");
  button.disabled = true;
  document.querySelector("#form-error").hidden = true;
  const query = editingId
    ? client.from("posts").update(payload).eq("id", editingId).select().single()
    : client.from("posts").insert(payload).select().single();
  let result;
  try {
    result = await query;
  } catch {
    button.disabled = false;
    showFormError("could not save this post. your text is still here.");
    return;
  }
  button.disabled = false;
  if (result.error) {
    showFormError("could not save this post. your text is still here.");
    return;
  }
  composer.close();
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

document.querySelector("#close-auth").addEventListener("click", function () { authDialog.close(); });
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

async function start() {
  renderPosts();
  if (!hasConfig || !window.supabase) {
    return;
  }
  client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  client.auth.onAuthStateChange(function (event) {
    void refreshOwnerState().then(function () {
      if (event === "SIGNED_IN" && canPublish && authDialog.open) authDialog.close();
    });
  });
  showAuthLinkError();
  await Promise.all([refreshOwnerState(), refreshPosts()]);
  if (isOwnerRoute() && !canPublish && !authDialog.open) openAuthDialog();
}

start();
