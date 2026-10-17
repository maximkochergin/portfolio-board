(() => {
  try {
    const root = document.documentElement;
    const time = window.portfolioTime;
    if (!root) return;
    const search = window.location.search;
    if (new URLSearchParams(search).get("manage") === "1") root.dataset.ownerAccess = "visible";
    if (time) root.dataset.bunnyScene = time.getSnapshot(new Date(), time.parseOverride(search)).scene;
  } catch {
    // Keep the static daytime scene if early initialization is unavailable.
  }
})();
