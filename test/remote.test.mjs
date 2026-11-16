// Exercise the real viewer load/navigation methods, replacing only host APIs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as remote from "../mods/herdr-md/remote.js";
import { marked, splitChunks, capSource, refDefs, lexChunk, blocks, LEX_MAX } from "../mods/herdr-md/lex.js";
import { hash as bhash } from "../mods/herdr-md/doc.js";
import { diffBlocks } from "../mods/herdr-md/doc.js";

const source = readFileSync(new URL("../mods/herdr-md/main.js", import.meta.url), "utf8")
  .replace(/import\s[\s\S]*?from\s+["'][^"']+["'];/g, "")
  .replace("export default class Md", "globalThis.Md = class Md");

function harness(read, isRemote = true) {
  const calls = [], timers = [], tasks = [], execs = [];
  const host = { ...remote, marked, splitChunks, capSource, refDefs, lexChunk, blocks, LEX_MAX, bhash, diffBlocks, View: class {}, home: () => "/MacHome",
    props: () => ({}), readTextFile: async (file, options) => { calls.push({ file, options }); return read(file); },
    exec: async (...args) => { execs.push(args); return { code: 0, stdout: "" }; },
    console, codeBlock: () => null };
  vm.runInNewContext(source, host);
  const viewer = Object.assign(Object.create(host.Md.prototype), {
    file: "/docs/README.md", on: isRemote ? "devbox" : null, remote: isRemote, sourceError: null,
    remoteBusy: false, remoteAgain: false, remoteTick: 0, remoteText: null, closed: false,
    loadGen: 0, watchGen: 0, shown: null, blocks: [], codes: [], seq: 0, cur: 0,
    history: [], future: [], refs: [], error: null, notes: { highlights: [] }, folded: new Set(), pendingAnchor: null,
    scroll: { scrollToTop() {} }, setBlocks(blocks) { this.blocks = blocks; this.adoptions = (this.adoptions ?? 0) + 1; },
    resolve() {}, applyFocus() {}, prepare() {}, reaim() {}, figTheme() {}, loadImages() { throw Error("remote asset access"); },
  });
  const cx = { notify() {}, spawn(fn) { const task = fn(cx); tasks.push(task); return task; },
    timer: { after(ms, fn) { timers.push({ ms, fn }); } } };
  const settle = async () => { for (let i = 0; i < tasks.length; i++) await tasks[i]; };
  return { viewer, cx, calls, timers, tasks, execs, settle };
}

test("remote source and links reject local schemes and invalid paths", () => {
  assert.equal(remote.remoteSourceError("/docs/a.md", "devbox"), null);
  for (const [file, on] of [["relative.md", "devbox"], ["/a.md", ""], ["/a.md", {}], ["/a\0.md", "devbox"]])
    assert.ok(remote.remoteSourceError(file, on));
  assert.deepEqual(remote.remoteLink("/docs/sub/a.md", "../second%20doc.md#hello"), { file: "/docs/second doc.md", fragment: "hello" });
  for (const url of ["file:///MacHome/a.md", "//host/a.md", "image.png", "%00.md", "x.md#%zz"])
    assert.throws(() => remote.remoteLink("/docs/a.md", url));
});

test("inline images never reach the host renderer, including nested prose and HTML", () => {
  for (const md of ["before ![alt](/Users/sid/private.png) after", "**![alt](x.png)**", "- ![alt](x.png)", '<img src="/private.png">']) {
    const safe = remote.remoteInline(md);
    assert.match(safe, /remote media disabled/);
    assert.doesNotMatch(safe, /!\[|<img/i);
    assert.doesNotMatch(safe, /private.png|x.png/);
  }
});

test("remote load uses machine routing, skips unchanged content, then refreshes", async () => {
  let text = "# Original\n\nBody";
  const h = harness(() => text);
  h.viewer.load(h.cx); await h.settle();
  assert.ok(h.calls.every(c => c.options?.on === "devbox"));
  assert.equal(h.viewer.error, null);
  assert.equal(h.viewer.adoptions, 1);
  assert.equal(h.execs.length, 0, "no local notes, media or program execution");
  assert.equal(h.timers[0].ms, remote.REMOTE_POLL_MS);
  h.timers.shift().fn(h.cx); await h.settle();
  assert.equal(h.viewer.adoptions, 1, "unchanged documents are not re-lexed");
  text = "# UPDATED\n\nBody";
  h.timers.shift().fn(h.cx); await h.settle();
  assert.equal(h.viewer.src, text);
  assert.equal(h.viewer.adoptions, 2);
});

test("navigation serializes slow reads, discards stale content and keeps on", async () => {
  let release, active = 0, max = 0;
  const h = harness(file => new Promise(resolve => { active++; max = Math.max(max, active); release = value => { active--; resolve(value); }; }));
  h.viewer.load(h.cx);
  h.viewer.follow("sub/second.md", h.cx);
  assert.equal(h.calls.length, 1);
  assert.equal(h.viewer.flash, undefined);
  release("# Stale"); await h.settle();
  assert.equal(h.viewer.shown, null);
  assert.equal(h.timers[0].ms, 1);
  h.timers.shift().fn(h.cx);
  assert.equal(h.calls[1].file, "/docs/sub/second.md");
  assert.equal(h.calls[1].options.on, "devbox");
  release("# Second"); await h.settle();
  assert.equal(h.viewer.src, "# Second"); assert.equal(max, 1);
  assert.equal(h.execs.length, 0);
});

test("close invalidates in-flight reads and scheduled polls", async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  h.viewer.load(h.cx); h.viewer.close(); release("# Too late"); await h.settle();
  assert.equal(h.viewer.shown, null); assert.equal(h.timers.length, 0);
  const j = harness(() => "# First");
  j.viewer.load(j.cx); await j.settle(); j.viewer.close();
  j.timers.shift().fn(j.cx); assert.equal(j.calls.length, 1);
});

test("remote errors are readable and never fall back to local", async () => {
  const h = harness(() => { throw Error("machine disconnected"); });
  h.viewer.load(h.cx); await h.settle();
  assert.match(h.viewer.error, /devbox.*disconnected/);
  assert.equal(h.calls.length, 1); assert.equal(h.execs.length, 0);
  assert.equal(h.timers.length, 1, "retries are bounded");
});

test("remote notes, recents, picker and selection writes are disabled", async () => {
  const h = harness(() => { throw Error("unexpected read"); });
  h.viewer.watch(h.cx); h.viewer.watchNotes(h.cx); await h.viewer.readNotes(h.cx);
  await h.viewer.remember("/docs/a.md"); h.viewer.openPicker(h.cx); h.viewer.share();
  assert.equal(h.calls.length, 0); assert.equal(h.execs.length, 0); assert.equal(h.tasks.length, 0);
});

test("local load still reads locally and retains asset processing", async () => {
  const h = harness(() => "# Local", false);
  let images = false;
  h.viewer.markChanges = async () => {};
  h.viewer.loadImages = async () => { images = true; };
  h.viewer.loadVideos = async () => {};
  h.viewer.renderFigures = async () => {};
  h.viewer.load(h.cx); await h.settle();
  assert.equal(h.viewer.error, null);
  assert.equal(h.calls[0].options, undefined);
  assert.equal(images, true); assert.equal(h.viewer.src, "# Local");
  assert.equal(h.timers.length, 0, "local still uses watchFolder, not polling");
});
