# Remote Markdown from the Mac

This fork runs the native viewer in **Herdr Desktop on the Mac**. Herdr's existing machine connection reads the file from `devbox`; no viewer, npm install, file mirror, or public socket is needed on devbox.

## Open next to Pi

Run on the Mac, supplying the devbox pane from `herdr-app ls`:

```sh
mdh open /home/dev/workspace/project/README.md --on devbox --pane devbox/PANE_ID
```

`--pane` targets the existing pane explicitly; omit it to split the focused pane. `--down` changes the split direction. Remote paths must be absolute POSIX paths (no `~` expansion on the Mac).

The equivalent supported app command is:

```sh
herdr-app do pane.split '{"pane":"devbox/PANE_ID","direction":"right","mod":"herdr-md","props":{"file":"/home/dev/workspace/project/README.md","on":"devbox"}}'
```

The CLI and app socket are Mac-local. A devbox Pi session does **not** automatically run this command on the Mac. For now, ask the Mac agent over the existing mesh to invoke it. A durable automatic bridge and terminal Cmd-click interception are separate work; this fork installs neither and exposes no TCP socket.

## Refresh and navigation

The `REMOTE · devbox` header identifies the source machine. After each completed load, a copy-scoped timer waits two seconds before reading again. Slow reads do not overlap; unchanged text skips parsing. Navigation invalidates stale results and serializes the next read. Closing the viewer invalidates results; Herdr cancels the copy's tasks and timers.

Relative `.md`, `.markdown`, and `.mdx` links remain on the same remote machine, including `..` and heading fragments. File URLs and non-Markdown remote destinations produce a readable message rather than opening Mac files. Explicit HTTP(S)/mailto clicks still open their normal external application.

Remote media (including inline images), diagrams, video, picker, recents and agent annotations/pins are deliberately disabled. The status bar explains the reduced scope; image/diagram blocks show placeholders/source. This avoids accidental Mac reads or local cache collisions for remote resource paths. Copying selected Markdown still works. Generic viewer preferences may use the Mac's existing Herdr cache.

Reads follow the upstream document cap (about 512k characters); the oversized-file fallback runs `head` and `wc` on the **remote machine**, not on the Mac. Inaccessible paths/connections display errors and retry on the same bounded polling cadence. This is not an offline mirror.

## Local files and diagram packages

`mdh open /absolute/mac/file.md` retains local watching, media and annotation behavior. Diagram packages are no longer automatically downloaded on first use. Install renderer dependencies explicitly if desired, or deliberately open a local viewer with `installDiagramDeps: true` to enable upstream's npm-install path. Basic local and remote Markdown need neither npm dependencies nor a browser.

## Source and installation

- Fork: <https://github.com/itissid/herdr-md>
- Upstream: <https://github.com/ryanthedev/herdr-md>
- Working branch: `local/remote-devbox`
- Canonical Mac checkout: `~/workspace/herdr-md`
- Installed copy: `~/.config/herdr-app/mods/herdr-md`
- CLI link: `~/.local/bin/mdh` → installed `mods/herdr-md/mdh`

Herdr does not follow symlinked mod directories. After edits, use the repo's documented sync:

```sh
cd ~/workspace/herdr-md
HERDR_APP_HOME="$HOME/.config/herdr-app" bash scripts/dev-sync.sh
```

This copies the mod (excluding node_modules/cache) and runs `herdr-app check`. Review remote/upstream changes before syncing. To uninstall, close viewer panes, remove only the installed `herdr-md` directory and its `mdh` link, and keep the canonical checkout/history.

## Verification

```sh
node --test test/*.test.mjs
python3 test/cli_test.py
herdr-app check "$HOME/.config/herdr-app/mods/herdr-md"
```

A live run on Herdr Desktop 0.1.16 with devbox core 0.1.21 rendered a disposable **devbox-only** fixture immediately right of the original Pi pane: headings, emphasis, lists, table, code and task items. An independent devbox writer changed `REMOTE_REFRESH_MARKER: INITIAL` to `UPDATED`; the existing pane showed `UPDATED` and the change gutter **without reopening**. Local Markdown rendered successfully in a separate test tab. `herdr-app status` reported `errors: []`. No renderer node_modules/browser installation was performed.

The remote tests exercise actual viewer load/follow/close methods with host APIs replaced, including serialized navigation, stale results, machine routing, remote-resource guards, errors and local regression. Live mouse-click navigation was not automated: macOS denied Apple events to System Events (`-1743`); no permissions were changed. A direct remote second-document read and unit-tested navigation do not establish that an actual UI click was tested.

Reader-only screenshots are in `evidence/`; full-window captures containing unrelated terminal sessions were kept out of the repository. The live negative test requested `/tmp/herdr-md-local-test.md` on devbox while that file existed on the Mac: the viewer showed `File not found on devbox`, not Mac content (`evidence/remote-no-local-fallback.png`).

### Independent review and follow-up verification

Two clean-context read-only reviewers examined the committed change against upstream `fc5fcad909ad57a82210c20be7cedc72f83faeca`:

- `/markdown-standards-review`, session `01a1e674-02c6-72ce-b7c3-7e3082ac6052`: correctness/lifecycle/standards.
- `/markdown-spec-review`, session `01a1e674-2182-72ce-b7c3-7e32f2607c96`: spec compliance and remote resource boundaries.

Both found a real pipeline-ordering bug: inline math conversion could recreate image syntax after filtering. A regression test first reproduced unsafe renderer input; filtering now runs after all inline transformations, directly before the native renderer. The standards review also identified an inherited check-time `mkdir` side effect; `watchNotes` now skips checks, with regression coverage. No actual native file read from the unsafe input was demonstrated.

After those fixes, the full Node runner passes **23/23** tests and Python CLI routing passes **4/4**. The installed copy was resynced and `herdr-app check` passed without its earlier executed-child-process warning. Final follow-up review receipts are recorded in `REVIEW.md`.
