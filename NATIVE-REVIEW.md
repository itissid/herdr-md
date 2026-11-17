# Native one-shot opener — review and integration receipts

## Scope and source

User authorized native core API + in-process mod implementation after a real learning test, with a hard stop rather than any standalone-service workaround. No named EP association was found; no ledger was invented.

- Baseline before native opener: `3c6ac83d5abe72ed4b636741721b8ce7ff0b8322`.
- First tested deployment: `fe32741fb0bceec79321e7e6a0e2d9a212682e29`.
- Validation/acknowledgement fixes: `573b05ea94252edddd3271d9c0f5fb75f6c86a84`.
- Final helper code: `2e0dd5e7f62a23fd502c72cee4b65d93aa127bdd`.
- Canonical Mac source: `~/workspace/herdr-md`, branch `local/remote-devbox`.
- Canonical devbox source: `/home/dev/workspace/herdr-md`, same user fork/branch.
- Installed devbox CLI: `~/.local/bin/herdr-open` symlink to canonical `scripts/herdr-open`.
- Existing installed Mac renderer: `~/.config/herdr-app/mods/herdr-md`; no native-opener renderer change was necessary. Old Mac-side `mdh` remains compatible, but is not used by native opening.

## Independent safety review — PASS

`/native-open-safety-review`, session `01a1e798-667d-72ce-b7c3-7e58f26db47c`.

Initial review found real invalid/incomplete UTF-8 acceptance, malformed recognized block-content acceptance, and hidden-ancestor handling defects. Fixes validate the whole file through EOF (bounded chunks, 16MiB cap), validate string discriminators, and inherit effective hidden state.

Targeted re-review of `573b05e` passed after pure/in-memory checks, including native floats and acknowledgement retention. Final targeted review includes `2e0dd5e`: **PASS, no remaining concrete blockers**. In-memory simulations confirmed lost ACK + removal/noncommit stops after one mutation attempt; lost ACK + retained pane confirms it without rewriting; confirmed CAS conflict preserves unrelated changes. Full suites were not rerun by this reviewer; no real core/UI was touched.

## Independent spec review — PASS

`/native-open-spec-review`, session `01a1e79d-870f-72ce-b7c3-7e5dcf47baca`.

Initial verdict FAIL reproduced acknowledgement loss across failed readback, incorrect floating-pane representation, hidden ancestors, and truncated UTF-8. `573b05e` corrected all findings: acknowledgement survives retries; native flat floats on each node participate in source/ID validation; effective hidden ancestry and full-file validation are enforced. Targeted re-review passed.

Final review includes `2e0dd5e`: **PASS, no remaining blockers in targeted scope**. The reviewer independently ran **28 helper tests, four legacy CLI tests, and all 23 Node-reported tests**. The final unknown-outcome guard permits only confirmation of a retained operation after an uncertain write; absence stops without recreation. Documentation limits that protection to the current process and requires inspection before explicit retries. No real core/UI was touched by the reviewer.

## Real native learning test

Devbox used its **own local core UNIX socket**, not Mac `mdh` or a new SSH command, to insert a uniquely named disposable native mod tab with a versioned CAS (103→104). It appeared on the already-connected Mac. The Mac observer only selected the existing pane; the native reader displayed formatted remote Markdown.

A separate devbox writer added `NATIVE_PROBE_MARKER: DEVBOX_CORE_OPEN_20261117_0334`; the same pane refreshed without reopening. Existing Herdr SSH PID4473 retained the same established TCP endpoints (`:49704→:2223`). Cleanup used fresh CAS104→105, removing **only** the exact temporary tab rather than restoring an old snapshot.

Receipt outside repositories: `/tmp/herdr-native-doc-probe-observation.md` on Mac and `/tmp/herdr-native-doc-probe/README.md` on devbox. Published reader-only crop: `evidence/native-core-probe.png`.

## Real installed-helper integration

The devbox agent cloned the user fork with origin=user/upstream=original, installed the canonical executable symlink, and ran the actual PATH command inside terminal `t22`:

```sh
herdr-open /tmp/herdr-md-remote-test.Jmdyz5/README.md --on devbox
```

Observed on candidate `fe32741`:

1. Default right split accepted CAS105→106, operation `48786f33b2ed47858a94efbccdcf8c37`, pane `devbox/p48786f33b2ed47858a94efbccdcf8c37` in the original Pi tab. Mac screenshot showed it immediately right of the calling Pi **without any Mac opening or focus command**; original Pi stayed focused. App errors were empty.
2. Repeating that operation returned `reused:true`, same pane and unchanged version106: no duplicate/write.
3. `--new-tab` opened `/tmp/herdr-md-remote-test.Jmdyz5/日本語 note.md` at version107. Selecting only the existing tab showed `NATIVE_HELPER_MARKER: UNICODE_SPACE_PATH_20261117`, native formatting and table. No Mac opening command was used.
4. A deliberately stale CAS (expected106 while current107) was rejected with code−32000 and `data.kind: conflict`, leaving the fresh document byte-equivalent. This validates the exact conflict discriminator; other failures share the numeric code.
5. Fresh CAS107→108 removed only the optional Unicode test tab, leaving the default split intact.
6. A separate devbox edit changed the retained default file to `NATIVE_HELPER_REFRESH: DEVBOX_EDIT_20261117_0351`. The same viewer updated, no reopen; Mac restored original Pi focus only. App errors remained empty and the original SSH PID/socket remained established.

After `573b05e`, devbox independently passed **27+4+23** tests and repeated the existing operation: `reused:true`, same pane, version108 unchanged. This did not create another pane or mutate layout.

Final helper `2e0dd5e` was fast-forward installed on devbox and confirmed at2026-11-17T03:59:00Z (reconfirmed04:00:13Z): **28 helper +4 CLI +23 Node tests passed**, whitespace checks clean, canonical checkout clean0ahead/behind, PATH symlink unchanged. The actual installed command repeated the SAME operation and returned `reused:true`, same pane and **version108 unchanged**, with no further mutation/SSH/service. Final review/evidence publication is a docs-only follow-up; no additional real layout/auth tests were performed.

Published crops contain only the viewer, not unrelated terminal sessions:

- `evidence/native-helper-right-split.png`
- `evidence/native-helper-unicode-tab.png`
- `evidence/native-helper-refreshed.png`

## Guarantees and limits

- No standalone service, daemon, queue, listener, new remote connection, Mac command relay, signing policy change or authentication bypass was introduced.
- Existing connectivity is a prerequisite for immediate delivery/reads; actual reconnection can still require Secretive approval. The separate earlier fresh-auth experiment prompted the user, who approved it; it did **not** establish unattended authentication.
- Success acknowledges core state/readback, not a client-specific rendering/focus acknowledgement. Shared layout is version-coupled, source-derived native JSON rather than a stable semantic pane-create RPC.
- Same-process unknown write results fail closed if the pane is absent. A new invocation cannot infer a past committed-and-removed operation without durable history; explicit retries require inspection. No hidden journal/queue is claimed.
- No PDF, mobile/web renderer portability, terminal Cmd-click, automatic client focus, or sandboxing of arbitrary requested Markdown paths is promised. Remote resources remain deliberately restricted by the existing reader.
- Reviewers did not independently repeat native UI or connection observations; those were separately performed by the coordinating devbox/Mac agents.
