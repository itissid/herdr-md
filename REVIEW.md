# Remote reader review receipts

Recorded: 2026-11-16T22:30:21Z.

## Comparison

- Fixed upstream base: `fc5fcad909ad57a82210c20be7cedc72f83faeca`.
- Initial implementation: `005bc7b48b2f9e8cb039fc63065539d8347495f3`.
- Reviewed fixes: `5d06013a80e6ae1021ad95214b9c4acef57e8d4f`.
- Scope: Mac-side remote Markdown loading, serialized refresh/navigation, remote resource boundaries, local regression, CLI, installation and documentation. No core changes or automatic remote-opening bridge.

## Standards / lifecycle — PASS

Reviewer `/markdown-standards-review`, session `01a1e674-02c6-72ce-b7c3-7e3082ac6052`, independently reviewed against CLAUDE.md and relevant installed Herdr AGENTS/API guidance.

Initial verdict FAIL: remote filtering preceded transformations that could recreate image syntax; inherited notes initialization also ran mkdir during checks. Both were fixed in `5d06013`. Follow-up verdict: **PASS**, no outstanding blocking findings in the targeted changes.

Independently reran 23 Node runner tests, four Python CLI tests, and whitespace checks. Did not independently verify native UI or installed-copy synchronization.

## Spec / security — PASS

Reviewer `/markdown-spec-review`, session `01a1e674-2182-72ce-b7c3-7e32f2607c96`, independently checked the stated acceptance criteria and remote-resource boundary.

Initial verdict FAIL: math expansion could recreate an image destination after filtering. Actual viewer inline-method reproduction demonstrated unsafe renderer input, not a confirmed file read. Follow-up verdict on `5d06013`: **PASS**, no outstanding blocking findings. Both reported bypass inputs are covered through the real inline pipeline with the host renderer replaced.

Independently reran 23 Node runner tests and four Python tests, and inspected negative-test evidence. Did not independently repeat live UI/refresh, native cancellation, or oversized-file fallback.

## Integration observations by the implementing Mac agent

- Actual remote Markdown rendered immediately right of the original devbox Pi pane.
- Independent devbox writer changed INITIAL → UPDATED; the existing viewer refreshed without reopening.
- Local reader rendered formatting, table, code and tasks in a temporary test tab.
- A second devbox document rendered; remote request for a Mac-only path showed File not found on devbox instead of Mac content.
- Cropped evidence is in `evidence/`; unrelated terminal captures were not committed.
- After fixes: installed JavaScript, manifest and CLI byte-match canonical source; `herdr-app check` passes without the prior child-process warning; app status has `errors: []`.
- No renderer `node_modules` or browser was installed. Temporary test tabs/pane were closed; remote demo pane was retained.

## Explicit remaining verification limits

Actual native mouse-link clicks were not automated because macOS denied System Events Apple events; no permissions were changed. Viewer follow logic and retained machine context were tested through real viewer methods with host APIs replaced, and the second path was separately rendered live. Native close-time cancellation relies on Herdr's documented copy-scoped lifecycle plus mocked close regression tests. Oversized-file fallback routing was inspected, not exercised live. Review does not claim native filesystem reads were instrumented.

GitHub publishing is limited to the user's feature branch; no upstream PR or default-branch change is made.
