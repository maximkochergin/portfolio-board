(() => {
  const root = document.documentElement;
  let mode = null;
  try { mode = window.localStorage.getItem("theme"); } catch { /* Use the system theme when storage is unavailable. */ }
  if (mode !== "light" && mode !== "dark") return;
  root.dataset.theme = mode;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.content = mode === "dark" ? "#111111" : "#fafafa";
    meta.removeAttribute("media");
  });
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.content = mode;
})();
