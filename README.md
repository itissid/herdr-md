# herdr-md

Native Markdown previews beside a Herdr terminal, opened through an in-process context-menu mod. Human-tested with files on both the Mac and connected devbox.

## Open a document

1. Copy one **absolute** `.md` or `.markdown` path.
2. **Shift-right-click the terminal on that file's machine.**
3. Check the displayed clipboard path and machine, then choose **Open clipboard Markdown**.

The preview opens immediately right of that terminal. The menu uses the path shown when it opened—not a clicked token, ambient focus, or a later clipboard value. Shift-drag can select text when a terminal application captures the mouse.

Remote documents use Herdr's existing connection and refresh two seconds after each completed read. Relative Markdown links stay on the same machine. Missing files display reader errors. Immediate remote reading requires an existing connection; reconnecting can require normal authentication.

## Install or update

Read your local `~/.config/herdr-app/AGENTS.md` first. From this checkout:

```sh
./scripts/dev-sync.sh
```

This copies and checks both `mods/herdr-md` and `mods/markdown-menu`; Herdr needs copied mod directories, not directory symlinks.

Clone your current layout to an unused personal name rather than editing shipped layouts. Add this property at the personal layout's root:

```json
"terminal_menu": "markdown-menu"
```

The menu preserves stock pane, tab, workspace and Git/worktree actions. Switching back to a layout without that setting restores the stock menu. To keep other personal chrome while disabling this action, change only that root property to `"menu"`.

## Reader and limits

- Native headings, lists, tables, code, search, outline, folding, source lines and change markers.
- Local files retain the upstream reader's media and annotation-file support. Optional local math/Mermaid renderer dependencies require explicit installation or `installDiagramDeps: true`; basic reading does not download them.
- Remote mode deliberately disables media, diagrams, picker and annotation/pin integration rather than reading resources from the Mac accidentally.
- Clipboard input is literal, at most 4096 UTF-8 bytes. Relative paths, URLs, multiline/control/bidi text, invalid Unicode and other suffixes are rejected. No tilde, cwd, shell or URI expansion.
- Captured pane/terminal/workspace/machine context is revalidated on action; missing, duplicate or changed sources fail closed. Clipboard contents are neither logged nor persisted.
- This is a clipboard context-menu action, not terminal Cmd-click interception or a PDF viewer. Rendering stays in the desktop; other clients need their own compatible renderer.

## Development

```sh
node --test test/*.test.mjs
./scripts/dev-sync.sh
```

Source: `mods/markdown-menu/` owns menu targeting and clipboard validation; `mods/herdr-md/` owns rendering and remote reads. Stock `main`/`menu` sources are not modified. Generated Herdr typings remain installation-local.

Forked from [ryanthedev/herdr-md](https://github.com/ryanthedev/herdr-md). See [LICENSE](LICENSE) and the bundled Marked license.
