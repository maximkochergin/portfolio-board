(() => {
  try {
    const root = document.documentElement;
    if (!root) return;
    const search = window.location.search;
    if (new URLSearchParams(search).get("manage") === "1") root.dataset.ownerAccess = "visible";
  } catch {
    // Runtime owner detection still works if early initialization is unavailable.
  }
})();
