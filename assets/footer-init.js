(() => {
  try {
    const root = document.documentElement;
    if (!root) return;
    const search = window.location.search;
    if (new URLSearchParams(search).get("manage") === "1") root.dataset.ownerAccess = "visible";
    const time = window.portfolioTime;
    if (time?.getSnapshot && time.parseOverride) root.dataset.mascotScene = time.getSnapshot(new Date(), time.parseOverride(search)).scene;
  } catch {
    // Runtime owner detection still works if early initialization is unavailable.
  }
})();
