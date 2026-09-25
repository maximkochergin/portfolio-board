(function (root) {
  "use strict";

  function parseInline(value) {
    const source = String(value || "");
    const tokens = [];
    let plain = "";
    function flush() {
      if (plain) tokens.push({ type: "text", text: plain });
      plain = "";
    }
    for (let index = 0; index < source.length;) {
      const character = source[index];
      if (character === "\\" && /[\\*`]/.test(source[index + 1] || "")) {
        plain += source[index + 1];
        index += 2;
        continue;
      }
      const marker = source.startsWith("**", index) ? "**" : character === "*" || character === "`" ? character : null;
      if (marker) {
        const close = source.indexOf(marker, index + marker.length);
        if (close > index + marker.length) {
          flush();
          tokens.push({ type: marker === "**" ? "strong" : marker === "*" ? "em" : "code", text: source.slice(index + marker.length, close) });
          index = close + marker.length;
          continue;
        }
      }
      plain += character;
      index += 1;
    }
    flush();
    return tokens;
  }

  function parsePostText(value) {
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let list = null;
    let code = null;
    function flushParagraph() {
      if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
    function flushList() {
      if (list) blocks.push(list);
      list = null;
    }
    for (const line of lines) {
      if (code) {
        if (/^```\s*$/.test(line)) {
          blocks.push({ type: "code", text: code.join("\n") });
          code = null;
        } else {
          code.push(line);
        }
        continue;
      }
      if (/^```[\w+#.-]*\s*$/.test(line)) {
        flushParagraph();
        flushList();
        code = [];
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }
      const heading = /^(#{2,3})[ \t]+(.+)$/.exec(line);
      if (heading) {
        flushParagraph();
        flushList();
        blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
        continue;
      }
      const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        flushParagraph();
        const kind = ordered ? "ordered" : "unordered";
        if (list && list.kind !== kind) flushList();
        if (!list) list = { type: "list", kind, items: [] };
        list.items.push((ordered || unordered)[1]);
        continue;
      }
      flushList();
      paragraph.push(line.trimEnd());
    }
    flushParagraph();
    flushList();
    if (code) blocks.push({ type: "code", text: code.join("\n") });
    return blocks;
  }

  const api = { parseInline, parsePostText };
  root.postFormat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
