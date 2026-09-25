const test = require("node:test");
const assert = require("node:assert/strict");
const { parseInline, parsePostText } = require("../assets/post-format.js");

test("post text supports a small block structure without changing plain paragraphs", () => {
  assert.deepEqual(parsePostText("first line\nsecond line\n\n## task\n- one\n- two\n\n1. result"), [
    { type: "paragraph", text: "first line\nsecond line" },
    { type: "heading", level: 2, text: "task" },
    { type: "list", kind: "unordered", items: ["one", "two"] },
    { type: "list", kind: "ordered", items: ["result"] }
  ]);
});

test("inline formatting is limited to text, emphasis, strong and code tokens", () => {
  assert.deepEqual(parseInline("**important** and `const x = 1` with *care*"), [
    { type: "strong", text: "important" },
    { type: "text", text: " and " },
    { type: "code", text: "const x = 1" },
    { type: "text", text: " with " },
    { type: "em", text: "care" }
  ]);
});

test("code fences and raw HTML stay inert text", () => {
  assert.deepEqual(parsePostText("```js\r\n<script>alert(1)</script>\r\n```"), [
    { type: "code", text: "<script>alert(1)</script>" }
  ]);
  assert.deepEqual(parseInline("<img src=x onerror=alert(1)>"), [
    { type: "text", text: "<img src=x onerror=alert(1)>" }
  ]);
});

test("escaped markers remain literal and an open code fence remains readable", () => {
  assert.deepEqual(parseInline("\\*literal\\*"), [{ type: "text", text: "*literal*" }]);
  assert.deepEqual(parseInline("*word \\* still italic*"), [
    { type: "em", text: "word * still italic" }
  ]);
  assert.deepEqual(parseInline("**word \\* still bold**"), [
    { type: "strong", text: "word * still bold" }
  ]);
  assert.deepEqual(parsePostText("```\nconst a = 1;"), [{ type: "code", text: "const a = 1;" }]);
});
