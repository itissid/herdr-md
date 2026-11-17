# Native Markdown preview and clipboard menu

Install the complete `mods/herdr-md` reader and `mods/markdown-menu` context-menu mod as copied directories under the local Herdr app home. Read its `AGENTS.md`, inspect the mod files, and disclose file/program/network access before installation. `scripts/dev-sync.sh` copies both mods and runs Herdr checks.

Clone the user's current layout to an unused personal name and set root `terminal_menu` to `markdown-menu`. Preserve other layout work and stock menu actions. Keep shipped layouts and the shipped `menu` unchanged.

## Interaction

The person copies one absolute `.md`/`.markdown` path and Shift-right-clicks the source terminal. Show the clipboard snapshot and actual source machine. **Open clipboard Markdown** closes the popup, then calls native `pane.split` beside that captured pane with the existing reader and `{file,on}` props.

Read the clipboard only for a valid pane popup, once per opening. Never log/persist it. Reject invalid or ambiguous source context and literal path input; revalidate source ownership at action time. Use the owning workspace's actual machine, not ambient focus, a guessed alias or the agent's cwd. Clearly label clipboard behavior rather than claiming clicked-path interception.

## Reader behavior

Keep the upstream native reader's Markdown, folding, search, change markers and local-file features. Remote text uses the established Herdr machine connection, serialized two-second polling, and source-preserving relative Markdown links. Disable unsupported remote media/diagrams/picker/annotations with readable explanations; never fall back to Mac resources for a remote document. Local diagram dependency installation is explicit opt-in.

## Verify

Run `node --test test/*.test.mjs`, check both installed mods, then test the actual copy → Shift-right-click → action gesture with local and remote files. Validate source-versus-focus targeting and legibility. Host probes/unit tests alone do not establish real mouse-gesture behavior. Respect existing OS permissions and authentication policy.
