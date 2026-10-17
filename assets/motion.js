(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let transition = null;
  let pendingUpdate = null;
  let settlement = null;
  let intent = 0;
  let applying = false;
  let clearPanelFade = () => {};
  let createEntrySnapshot = () => null;
  let startEntryFade = () => {};
  let clearEntryFade = () => {};
  let entrySnapshot = null;

  function cancelTransition() {
    intent += 1;
    transition?.skipTransition();
    transition = null;
    pendingUpdate = null;
    entrySnapshot?.remove();
    entrySnapshot = null;
    clearEntryFade();
  }

  function cancelSettlement() {
    if (settlement) window.clearTimeout(settlement.timer);
    settlement = null;
  }

  function finishSettlement(current) {
    if (settlement !== current) return;
    const queued = current.queued;
    const ready = window.location.hash === current.hash && !document.hidden && !document.querySelector("dialog[open]");
    cancelSettlement();
    if (ready && queued) run(queued.update, queued.options);
  }

  function applyUpdate(update, options) {
    applying = true;
    try {
      const result = update();
      if (options.settleHash && window.location.hash !== options.settleHash) {
        cancelSettlement();
        const current = { hash: options.settleHash, queued: null, timer: null };
        settlement = current;
        current.timer = window.setTimeout(() => finishSettlement(current), 1500);
      }
      return result;
    } finally {
      applying = false;
    }
  }

  function run(update, options = {}) {
    cancelTransition();
    clearPanelFade();
    if (settlement) {
      settlement.queued = { update, options };
      return;
    }
    if (reducedMotion.matches || document.hidden || !document.startViewTransition || document.querySelector("dialog[open]")) {
      return applyUpdate(update, options);
    }

    const ticket = intent;
    const pending = {};
    pendingUpdate = pending;
    const ghost = createEntrySnapshot();
    entrySnapshot = ghost;
    let applied = false;
    let result;
    const apply = () => {
      if (applied || ticket !== intent) return;
      applied = true;
      if (pendingUpdate === pending) pendingUpdate = null;
      ghost?.remove();
      if (entrySnapshot === ghost) entrySnapshot = null;
      result = applyUpdate(update, options);
      startEntryFade();
      return result;
    };

    try {
      const current = document.startViewTransition(apply);
      transition = current;
      current.ready.catch(() => {
        if (transition === current) clearEntryFade();
      });
      current.finished.catch(() => {}).then(() => {
        if (transition === current) transition = null;
      });
      current.updateCallbackDone.catch(error => {
        // Keep callback failures visible without replaying a navigation action.
        queueMicrotask(() => { throw error; });
      }).then(() => {
        if (pendingUpdate === pending) pendingUpdate = null;
      });
    } catch (error) {
      if (applied) throw error;
      return apply();
    }
    return result;
  }

  window.portfolioMotion = Object.freeze({ run });

  function stopMotion() {
    cancelTransition();
    clearPanelFade();
  }

  document.addEventListener("pointerdown", stopMotion, true);
  document.addEventListener("keydown", stopMotion, true);
  const stopPageMotion = () => {
    cancelSettlement();
    stopMotion();
  };
  window.addEventListener("pagehide", stopPageMotion);
  const stopHistoryMotion = event => {
    if (settlement) {
      if (window.location.hash !== settlement.hash) {
        stopPageMotion();
      } else if (event.type === "hashchange") {
        const current = settlement;
        queueMicrotask(() => finishSettlement(current));
      }
      return;
    }
    if (!applying && pendingUpdate) stopMotion();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPageMotion();
  });
  reducedMotion.addEventListener("change", stopMotion);
  const finishEntrance = event => {
    if (event.animationName === "archive-enter" && event.target instanceof Element && !event.target.closest(".panel-ghost")) {
      event.target.classList.add("motion-entered");
    }
  };
  document.addEventListener("animationend", finishEntrance);
  document.addEventListener("animationcancel", finishEntrance);

  function initialize() {
    // Install after deferred application scripts so route restoration runs first.
    window.addEventListener("hashchange", stopHistoryMotion);
    window.addEventListener("popstate", stopHistoryMotion);
    const navigation = document.querySelector(".switcher");
    const content = document.querySelector(".content");
    const ownerControls = document.querySelector("#board-controls");
    if (!navigation || !content) return;
    const tabs = Array.from(navigation.querySelectorAll('[role="tab"]'));
    const panels = tabs.map(tab => document.getElementById(tab.getAttribute("aria-controls"))).filter(Boolean);
    if (!tabs.length || !panels.length) return;

    const indicator = document.createElement("span");
    indicator.className = "tab-indicator";
    indicator.setAttribute("aria-hidden", "true");
    let indicatorFrame = 0;
    let indicatorPosition = "";

    function syncIndicator() {
      indicatorFrame = 0;
      const selected = tabs.find(tab => tab.getAttribute("aria-selected") === "true");
      if (!selected) return;
      const category = selected.id.replace(/^tab-/, "");
      if (!["work", "notes", "about"].includes(category)) return;
      if (!indicator.isConnected) navigation.append(indicator);
      const label = selected.querySelector(".tab-top > span") || selected.querySelector(".tab-top") || selected;
      const navBox = navigation.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      if (!navBox.width || !labelBox.width) return;
      const fontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 15;
      const x = labelBox.left + labelBox.width / 2 - navBox.left + navigation.scrollLeft - navigation.clientLeft - 3;
      const y = labelBox.bottom - navBox.top + navigation.scrollTop - navigation.clientTop + fontSize * .4;
      const position = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (position !== indicatorPosition) {
        indicator.style.transform = position;
        indicatorPosition = position;
      }
      navigation.dataset.activeTab = category;
      navigation.dataset.motion = "ready";
    }

    function queueIndicator() {
      if (!indicatorFrame) indicatorFrame = window.requestAnimationFrame(syncIndicator);
    }

    window.addEventListener("resize", queueIndicator, { passive: true });
    window.addEventListener("orientationchange", queueIndicator, { passive: true });
    window.addEventListener("pageshow", queueIndicator);
    window.addEventListener("pagehide", () => {
      if (indicatorFrame) window.cancelAnimationFrame(indicatorFrame);
      indicatorFrame = 0;
    });
    if ("ResizeObserver" in window) {
      const geometry = new ResizeObserver(queueIndicator);
      geometry.observe(navigation);
      tabs.forEach(tab => {
        geometry.observe(tab);
        const label = tab.querySelector(".tab-top > span") || tab.querySelector(".tab-top");
        if (label) geometry.observe(label);
      });
    }
    if (document.fonts) {
      document.fonts.ready.then(queueIndicator).catch(() => {});
      document.fonts.addEventListener?.("loadingdone", queueIndicator);
    }

    function visiblePanel() {
      return panels.find(panel => !panel.hidden) || null;
    }

    function snapshot(panel, ghostClass = "panel-ghost") {
      if (!panel) return null;
      const copy = panel.cloneNode(true);
      copy.classList.remove("panel-enter", "entry-enter");
      copy.classList.add(ghostClass);
      copy.removeAttribute("id");
      copy.removeAttribute("role");
      copy.removeAttribute("tabindex");
      copy.setAttribute("aria-hidden", "true");
      copy.inert = true;
      copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      copy.querySelectorAll(".post-list").forEach(list => {
        list.classList.replace("post-list", "ghost-post-list");
        list.removeAttribute("data-category");
      });
      copy.querySelectorAll("a, button, input, textarea, select, [tabindex]").forEach(element => {
        element.setAttribute("tabindex", "-1");
        element.removeAttribute("href");
        element.removeAttribute("autofocus");
      });
      return copy;
    }

    createEntrySnapshot = () => {
      const detail = document.querySelector("#post-detail");
      const source = detail && !detail.hidden ? detail : visiblePanel();
      const ghost = snapshot(source, "entry-transition-ghost");
      if (ghost) {
        ghost.classList.add("panel-ghost");
        content.append(ghost);
      }
      return ghost;
    };
    startEntryFade = () => {
      clearEntryFade();
      visiblePanel()?.querySelectorAll(".post-item, .empty-state").forEach(item => item.classList.add("motion-entered"));
      content.classList.add("entry-enter");
      let timer;
      const cleanup = () => {
        window.clearTimeout(timer);
        content.removeEventListener("animationend", finish);
        content.removeEventListener("animationcancel", finish);
        content.classList.remove("entry-enter");
        if (clearEntryFade === cleanup) clearEntryFade = () => {};
      };
      const finish = event => {
        if (event.target === content) cleanup();
      };
      clearEntryFade = cleanup;
      content.addEventListener("animationend", finish);
      content.addEventListener("animationcancel", finish);
      timer = window.setTimeout(cleanup, 350);
    };

    function fadePanels(ghost, panel) {
      clearPanelFade();
      panel.querySelectorAll(".post-item, .empty-state").forEach(item => item.classList.add("motion-entered"));
      content.append(ghost);
      panel.classList.add("panel-enter");
      let timer;
      const cleanup = () => {
        window.clearTimeout(timer);
        panel.removeEventListener("animationend", finish);
        panel.removeEventListener("animationcancel", finish);
        panel.classList.remove("panel-enter");
        ghost.remove();
        if (clearPanelFade === cleanup) clearPanelFade = () => {};
      };
      const finish = event => {
        if (event.target === panel) cleanup();
      };
      clearPanelFade = cleanup;
      panel.addEventListener("animationend", finish);
      panel.addEventListener("animationcancel", finish);
      timer = window.setTimeout(cleanup, 350);
    }

    let previousPanel = visiblePanel();
    let previousSnapshot = snapshot(previousPanel);
    let previousOwnerHidden = ownerControls?.hidden;
    let previousSelectedTab = tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.id;
    syncIndicator();

    const observer = new MutationObserver(records => {
      const ownerChanged = records.some(record => record.target === ownerControls && record.attributeName === "hidden")
        && ownerControls.hidden !== previousOwnerHidden;
      previousOwnerHidden = ownerControls?.hidden;
      if (ownerChanged) {
        stopPageMotion();
        previousSnapshot = null;
      }
      if (records.some(record => record.attributeName === "aria-selected")) {
        const selectedTab = tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.id;
        if (selectedTab !== previousSelectedTab) {
          cancelSettlement();
          cancelTransition();
        }
        previousSelectedTab = selectedTab;
      }
      queueIndicator();
      const panel = visiblePanel();
      if (panel !== previousPanel) {
        clearPanelFade();
        if (!ownerChanged && panel && previousPanel && previousSnapshot && !reducedMotion.matches && !document.hidden) {
          fadePanels(previousSnapshot, panel);
        }
        previousPanel = panel;
      }
      previousSnapshot = ownerChanged ? null : snapshot(panel);
    });
    observer.observe(navigation, { attributes: true, subtree: true, attributeFilter: ["aria-selected", "aria-orientation"] });
    observer.observe(content, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden"] });
    if (ownerControls) observer.observe(ownerControls, { attributes: true, attributeFilter: ["hidden"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
