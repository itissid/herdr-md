import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { clipboardPath, captureSource, openClipboard, MAX_PATH_BYTES } from "../mods/markdown-menu/clipboard.js";

const target = { pane: "devbox/p1", terminal: "devbox/t22" };
const pane = { ...target, tab: "devbox/tb1", cwd: "/different/cwd", focused: false };
const space = { id: "devbox/sp1", machine: "devbox", tabs: [{ id: pane.tab }] };
const text = readFileSync(new URL("../mods/markdown-menu/main.js", import.meta.url), "utf8")
  .replace(/import\s[^;]+;/g, "").replace("export default class Menu", "globalThis.Menu = class Menu");

function host({ tab = "pane", clipboard = "/tmp/README.md", checking = false, targets = [pane], owners = [space] } = {}) {
  const env = { clipboard, reads: 0, actions: [], renderedText: [], paneList: structuredClone(targets), spaceList: structuredClone(owners) };
  const p = { tab, target: { ...target }, overlay: "test-popup" };
  function element() {
    const e = new Proxy({}, { get(_, key) {
      if (key === "when") return (condition, fn) => condition ? fn(e) : e;
      if (key === "child") return value => { if (typeof value === "string") env.renderedText.push(value); return e; };
      return () => e;
    } });
    return e;
  }
  const context = { View: class {}, div: element, svg: element, v_flex: element, h_flex: element,
    theme: () => ({ surface: "bg", dim: "dim", foreground: "fg", accent: "accent", border: "border" }), props: () => p, checking: () => checking,
    panes: () => env.paneList, spaces: () => env.spaceList, terminals: () => [{ address: target.terminal }],
    keys: () => [], captureSource, clipboardPath, openClipboard,
    closeOverlay: id => env.actions.push(["close", id]), run: (...a) => env.actions.push(["run", ...a]),
    openOverlay: a => env.actions.push(["overlay", a]), exec: () => { throw Error("unexpected program execution"); } };
  vm.runInNewContext(text, context);
  const cx = { notify() {}, focus_handle: () => ({ focus() {} }), read_from_clipboard() { env.reads++; return env.clipboard; },
    spawn(fn) { return fn(cx); } };
  const menu = new context.Menu(); menu.init(null, cx);
  return { menu, env, cx, p, index: () => menu.menuItems().findIndex(it => it[1] === "markdown.clipboard") };
}

// Plain helper tests are independent of any GUI/runtime host.
test("literal absolute Markdown paths, Unicode/spaces and safe metacharacters", () => {
  for (const p of ["/tmp/README.md", "/tmp/日本語 note.markdown", "/tmp/$(not-a-command).MD", "/tmp/../a.md"])
    assert.equal(clipboardPath(p), p);
});
test("reject invalid clipboard without parsing links, commands or expanding paths", () => {
  for (const p of [null, "", "README.md", "~/a.md", "$HOME/a.md", "file:///tmp/a.md", "https://x/a.md", "//host/a.md",
    "/tmp/a.md\n", "/tmp/a.md\r", "/tmp/a\u0085.md", "/tmp/a\u2028.md", "/tmp/a\u2029.md", "/tmp/a\u202e.md", "/tmp/a\t.md", "/tmp/a\0.md", '"/tmp/a.md"', "[a](/tmp/a.md)", "/tmp/a.pdf", "/tmp/a.mdx", "/tmp/a.md ", "/tmp/\ud800.md", "/" + "x".repeat(MAX_PATH_BYTES) + ".md", "/" + "日".repeat(1400) + ".md"])
    assert.throws(() => clipboardPath(p), { name: "Error" }, String(p));
});
test("captured remote target is not ambient focus, cwd or an alias guess", () => {
  const wrong = { pane: "wrong", terminal: "wrong-t", tab: "wrong-tab", focused: true };
  const source = captureSource(target, [wrong, pane], [{ id: "local", machine: null, tabs: [{ id: "wrong-tab" }] }, space]);
  const args = openClipboard({ source, path: "/absolute/README.md" }, [wrong, pane], [space]);
  assert.deepEqual(args, { pane: target.pane, direction: "right", mod: "herdr-md", props: { file: "/absolute/README.md", on: "devbox" } });
});
test("local source explicitly uses null machine", () => {
  const source = captureSource(target, [pane], [{ ...space, machine: null }]);
  assert.equal(openClipboard({ source, path: "/a.md" }, [pane], [{ ...space, machine: null }]).props.on, null);
});
test("missing, duplicate, outside-tab, mismatched and unknown-machine contexts fail closed", () => {
  for (const [p, s] of [[[], [space]], [[pane, pane], [space]], [[pane, { ...pane, pane: "another" }], [space]], [[{ ...pane, terminal: null }], [space]], [[{ ...pane, tab: null }], [space]],
    [[pane], []], [[pane], [space, space]], [[pane], [{ ...space, machine: undefined }]], [[pane], [{ ...space, machine: "" }]],
    [[pane], [{ ...space, tabs: [space.tabs[0], space.tabs[0]] }]]])
    assert.throws(() => captureSource(target, p, s));
});
test("action revalidates terminal, owning tab, space and machine", () => {
  const snapshot = { source: captureSource(target, [pane], [space]), path: "/a.md" };
  for (const [p, s] of [[[pane, { ...pane, pane: "duplicate-terminal" }], [space]], [[ { ...pane, terminal: "different" } ], [space]], [[{ ...pane, tab: "moved" }], [space]],
    [[pane], [{ ...space, id: "different" }]], [[pane], [{ ...space, machine: "different" }]]])
    assert.throws(() => openClipboard(snapshot, p, s));
});

// Execute real menu init/choose methods; replace only external host bindings.
test("actual action closes popup then calls native split for captured source", () => {
  const h = host(); h.menu.choose(h.index(), h.cx);
  assert.equal(h.env.reads, 1);
  assert.equal(h.env.actions[0][0], "close");
  assert.equal(h.env.actions[1][0], "run");
  assert.equal(h.env.actions[1][1], "pane.split");
  assert.deepEqual(JSON.parse(JSON.stringify(h.env.actions[1][2])), { pane: target.pane, direction: "right", mod: "herdr-md", props: { file: "/tmp/README.md", on: "devbox" } });
});
test("valid snapshot renders as plain literal text without unsupported widget factories", () => {
  const path = "/tmp/<b>literal</b> 日本語.md";
  const h = host({ clipboard: path }); h.menu.render(h.cx);
  assert.ok(h.env.renderedText.includes(path));
  assert.ok(h.env.renderedText.includes("Clipboard path · devbox"));
});
test("action uses previewed snapshot even if clipboard changes", () => {
  const h = host(); h.env.clipboard = "/new-clipboard.md"; h.menu.choose(h.index(), h.cx);
  assert.equal(h.env.reads, 1);
  assert.equal(h.env.actions[1][2].props.file, "/tmp/README.md");
});
test("no clipboard reads during checks, irrelevant menus or invalid source", () => {
  for (const options of [{ checking: true }, { tab: "global" }, { tab: "tab" }, { tab: "space" }, { targets: [] }, { targets: [pane, pane] }]) {
    const h = host(options); assert.equal(h.env.reads, 0); assert.equal(h.index(), -1);
  }
});
test("invalid clipboard shows disabled action; no close or split", () => {
  const h = host({ clipboard: "https://private.invalid/a.md" });
  assert.ok(h.index() >= 0); assert.equal(h.menu.clipboard, null); assert.match(h.menu.markdownError, /absolute/);
  h.menu.choose(h.index(), h.cx); assert.deepEqual(h.env.actions, []);
  assert.doesNotMatch(h.menu.markdownError, /private.invalid/);
});
test("stale source disables action without closing or targeting focus", () => {
  const h = host(); h.env.paneList[0].terminal = "new-terminal";
  h.menu.choose(h.index(), h.cx); assert.deepEqual(h.env.actions, []);
  assert.equal(h.menu.clipboard, null); assert.match(h.menu.markdownError, /Source changed/);
});
test("stock pane, tab, space and global actions stay intact", () => {
  const h = host();
  assert.deepEqual(Array.from(h.menu.menuItems().slice(0, -1), it => it[1]), ["pane.split", "pane.split", "pane.zoom", "terminal.right_click", "pane.close"]);
  h.menu.choose(0, h.cx); assert.equal(h.env.actions[1][1], "pane.split");
  for (const [tab, count] of [["tab", 3], ["space", 2], ["global", 6]]) {
    const other = host({ tab }); assert.equal(other.menu.menuItems().length, count);
  }
  const git = host({ tab: "space" }); git.menu.git = "linked";
  assert.ok(git.menu.menuItems().some(it => it[0] === "Remove worktree"));
});
