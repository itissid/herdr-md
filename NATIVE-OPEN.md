# Open devbox Markdown from its Pi session

`herdr-open` is a **one-shot local-core client**, not a service. Run it on devbox inside the source Herdr terminal:

```sh
herdr-open README.md --on devbox
```

It resolves the file on devbox, finds that terminal's pane in the local core's shared `herdr-app` document, and inserts the installed native Markdown viewer immediately to its right. The already-connected Mac desktop receives the layout update and renders the document. **No Mac `mdh` invocation, new SSH connection, queue, listener, document server, or authentication bypass is used.** The helper exits after core acceptance/readback; it does not stay running or acknowledge desktop rendering.

## Prerequisites and installation

- Python **3.9+**, standard library only.
- Run on the file's machine, inside a Herdr terminal (core protocol generation1; verified core0.1.21 / desktop0.1.16).
- The Mac must already have the `herdr-md` native mod installed. This repo's existing renderer is sufficient; `scripts/dev-sync.sh` remains its Mac install/sync workflow.
- Existing connected Herdr transport to devbox is required for immediate display/reads. If the desktop is disconnected, accepted layout state can remain for later delivery. **Actual reconnect authentication may still need Secretive approval.** This helper neither initiates remote SSH nor changes key policies.
- `--on devbox` is the source-machine **alias known to the desktop**, not a guessed hostname. Aliases can differ across clients. Core stores mod props exactly as supplied; it does not auto-qualify them.

From a reviewed checkout on devbox, add the executable to PATH (no packages needed):

```sh
# Choose a free path; do not overwrite an existing unrelated installation.
ln -s "$HOME/workspace/herdr-md/scripts/herdr-open" "$HOME/.local/bin/herdr-open"
herdr-open --help
```

The devbox install should point to its own canonical checkout of this user fork; do not point a devbox link at a Mac filesystem path.

## Usage and source targeting

```sh
herdr-open 'notes/日本語 file.md' --on devbox
herdr-open README.md --on devbox --new-tab
herdr-open README.md --on devbox --terminal t22 --socket /absolute/path/default.sock
```

`HC_TERMINAL_ID` and `HC_TERMINAL_SOCKET` supply the source by default. `--terminal` is a **local** terminal ID without a `machine/` prefix. The socket must be a local absolute UNIX-socket path. There is no TCP endpoint, shell command or SSH fallback.

The default split mirrors the pinned native layout model: inside a row, halve source weight and insert the new sibling; inside a column, wrap only the source in a row, preserving its exterior size. Pixel-sized source panes retain their size. Other tabs, siblings and unknown nonstructural fields are retained. Floating, effectively hidden (including ancestors) or stacked source splits are refused rather than guessed; `--new-tab` supports stacked sources. Native per-node flat floating entries participate in source/ID collision checks and remain unchanged. Block discriminator values are validated against the native string representation. Unknown/ambiguous layouts fail closed.

**Opening is not focus.** Layout is shared across connected screens, while focus is client-local. The helper does not promise to activate one particular Mac window. A new tab may require selecting it manually. Splitting beside the calling Pi terminal avoids stale hardcoded pane IDs.

Markdown only (`.md`, `.markdown`, `.mdx`); PDF/other suffixes, directories, missing files, NUL bytes and invalid/incomplete UTF-8 are rejected **before contacting core**. Validation streams bounded-size chunks through EOF, capped at **16MiB per file** (including concurrent growth); larger files are refused rather than incompletely checked. Rendering/read errors after subsequent file edits are still handled by the viewer. Remote mode keeps media, diagrams, picker and agent annotations disabled; see [REMOTE.md](REMOTE.md). Local rich diagram dependency installation remains opt-in.

## Native data path

```text
DEVBOX
  Pi/tool launches herdr-open (one-shot Python process)
    → existing local core UNIX socket: hello, doc.get, doc.set with version CAS
    → core-owned herdr-app layout gets content:{mod:"herdr-md", props:{file,on}}

EXISTING HERDR TRANSPORT (no new authentication performed by helper)
    → shared-layout change reaches already-connected desktop

MAC: Herdr Desktop
  installed in-process native JS mod mounts (not a webview / Node process)
    → Herdr readTextFile(path,{on}) reads through existing machine connection
    ← remote Markdown text
    → native rendering, then serial polling every2 seconds
```

## Concurrency, retries and uncertain outcomes

There is no stable semantic `pane.create` RPC in the inspected core. `doc.get` / versioned `doc.set` are native APIs, but the **layout JSON is source-derived and version-coupled**, not a stable public pane-creation contract. Installed app docs recommend structural commands; this helper is a deliberately validated low-level adapter where the core CLI does not expose them. Source references:

- [Installed-version layout serialization and native split behavior](https://github.com/herdrdev/herdr-app/blob/321c9a84bc928f1c31be59e73dad966d86a3e252/src/layout.rs)
- [Core mirror/model ownership](https://github.com/herdrdev/herdr-app/blob/321c9a84bc928f1c31be59e73dad966d86a3e252/src/mirror.rs)
- [Core layout synchronization](https://github.com/herdrdev/herdr-app/blob/321c9a84bc928f1c31be59e73dad966d86a3e252/src/mirror_sync.rs)

Every retry rereads the latest document and reapplies just this operation; the helper does not restore an old snapshot over concurrent edits. Exact core `error.data.kind == "conflict"` triggers bounded CAS retry (same numeric error code also means other failures). Other rejected states fail without retrying the mutation. Defaults: three retries, three seconds per local-core request; both bounded by CLI validation. Response/document byte limits are enforced.

One UUID identifies the pane and is kept across local-socket retries. If a write reply is lost, the next read may confirm the SAME pane and return success. **If that pane is absent after an uncertain write, the helper stops without another mutation**: it cannot distinguish non-commit from commit followed by removal. Only confirmed version conflicts allow reapplication. After inspecting the outcome, an operator can explicitly repeat with the printed ID:

```sh
herdr-open README.md --on devbox --operation-id 0123456789abcdef0123456789abcdef
```

Do not blindly rerun after an uncertain result, even with the same ID: a new process has no record of a previous operation that was later removed. Inspect the core state first; a fresh explicit invocation can create an absent pane. Reusing an ID with different file/source/options is rejected. Readback confirms core state, **not desktop delivery or client focus**. An acknowledged operation absent after failed readback/retry also stops without recreation. The no-recreation guard applies within this process; this is not a durable exactly-once log. Intentional removal and arbitrary concurrent client rewrites cannot be resolved with a hidden queue. Herdr's document is latest-state/no-merge shared state.

## Verification

```sh
python3 test/herdr_open_test.py
python3 test/cli_test.py
node --test test/*.test.mjs
```

The new suite uses only ephemeral fake UNIX sockets, never the real Herdr socket. Coverage includes native row/column splitting and size preservation, new tabs, missing/duplicate/unknown sources, Unicode/space paths, invalid files, exact conflict-kind discrimination, preserving unrelated concurrent changes, accepted-write/lost-response deduplication, rejected writes, malformed/oversized responses, notifications, timeouts and operation-ID reuse.

Before implementation, a real **devbox-local** CAS insertion created a disposable tab on the connected Mac. The native renderer displayed the remote fixture; a separate devbox edit appeared in the same pane as `NATIVE_PROBE_MARKER: DEVBOX_CORE_OPEN_20261117_0334`. Existing SSH PID4473 retained the same established socket; no Mac `mdh`/open command or new authentication was used. This settles the native delivery hypothesis, not future reconnect policy. Mac observer receipt: `/tmp/herdr-native-doc-probe-observation.md`; devbox owns exact-tab cleanup using a fresh CAS.

Exact candidate `fe32741fb0bceec79321e7e6a0e2d9a212682e29` was installed on devbox via a symlink to its canonical checkout. Live default splitting from `t22` created the native viewer immediately right of the calling Pi, without a Mac opening/focus command. Repeating the same operation returned `reused:true` with **unchanged core version106**. A Unicode+space filename opened in a new tab, rendered its exact marker, and required only manual selection of that existing tab. A deliberately stale native CAS was rejected as `error.data.kind: conflict` without mutation. Existing SSH PID4473/socket stayed established throughout; no new SSH/auth step was initiated.

Reader-only evidence is in `evidence/native-{core-probe,helper-right-split,helper-unicode-tab,helper-refreshed}.png`; full-window captures were not published. Independent review identified additional race/validation edges despite the live happy-path success; targeted regression fixes are included. Both final reviews **PASS** on helper code `2e0dd5e`, and devbox independently verified its installed PATH command returns `reused:true` with unchanged version108. All **28 helper +4 legacy CLI +23 Node** tests pass. Detailed scope, review sessions, cleanup, exact deployment and limitations are recorded in [NATIVE-REVIEW.md](NATIVE-REVIEW.md). Unsupported mobile/web clients and PDF remain outside scope; sharing core state alone does not install or port a renderer.
