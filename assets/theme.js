(() => {
  const root = document.documentElement;
  const button = document.querySelector("#theme-toggle");
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const modes = ["system", "light", "dark"];
  const colors = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  const scheme = document.querySelector('meta[name="color-scheme"]');
  let mode = modes.includes(root.dataset.theme) ? root.dataset.theme : "system";
  let timer;
  function apply(next, animate = false) {
    mode = modes.includes(next) ? next : "system";
    window.clearTimeout(timer);
    root.classList.remove("theme-changing");
    if (animate && !reduced.matches) {
      root.classList.add("theme-changing");
      void window.getComputedStyle(root).backgroundColor;
      timer = window.setTimeout(() => root.classList.remove("theme-changing"), 280);
    }
    if (mode === "system") delete root.dataset.theme;
    else root.dataset.theme = mode;
    colors.forEach((meta, index) => {
      if (mode === "system") {
        meta.content = index === 0 ? "#111111" : "#fafafa";
        meta.media = index === 0 ? "(prefers-color-scheme: dark)" : "(prefers-color-scheme: light)";
      } else {
        meta.content = mode === "dark" ? "#111111" : "#fafafa";
        meta.removeAttribute("media");
      }
    });
    if (scheme) scheme.content = mode === "system" ? "light dark" : mode;
    if (button) {
      const nextMode = modes[(modes.indexOf(mode) + 1) % modes.length];
      const label = `Theme: ${mode}. Switch to ${nextMode}`;
      button.dataset.mode = mode;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.hidden = false;
    }
  }
  button?.addEventListener("click", () => {
    const next = modes[(modes.indexOf(mode) + 1) % modes.length];
    try {
      if (next === "system") window.localStorage.removeItem("theme");
      else window.localStorage.setItem("theme", next);
    } catch { /* Theme selection still works for this page. */ }
    apply(next, true);
  });
  system.addEventListener("change", () => { if (mode === "system") apply("system", true); });
  window.addEventListener("storage", event => {
    if (event.key === "theme" || event.key === null) apply(event.newValue, true);
  });
  const top = document.querySelector("#page-top");
  document.querySelector(".back-to-top")?.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !top) return;
    event.preventDefault();
    top.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduced.matches ? "instant" : "smooth" });
  });
  apply(mode);
})();
