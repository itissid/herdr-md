// Pure helpers: no clipboard reads, I/O, ambient focus, path expansion or logs.
export const MAX_PATH_BYTES = 4096;

export function clipboardPath(text) {
  if (typeof text !== "string" || !text || /[\x00-\x1f\x7f\u0085\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(text))
    throw new Error("Copy one absolute Markdown path (no tabs/newlines).");
  let bytes = 0;
  for (const character of text) {
    const cp = character.codePointAt(0);
    if (cp >= 0xd800 && cp <= 0xdfff) throw new Error("Clipboard path contains invalid Unicode.");
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes > MAX_PATH_BYTES) throw new Error("Clipboard path is too long.");
  }
  if (!text.startsWith("/") || text.startsWith("//") || !/\.(md|markdown)$/i.test(text))
    throw new Error("Copy an absolute .md or .markdown path, not a URL or command.");
  return text; // Literal path: no trimming, URI decoding, cwd/tilde/shell expansion.
}

export function captureSource(target, paneList, spaceList) {
  if (!target || typeof target.pane !== "string" || !target.pane || typeof target.terminal !== "string" || !target.terminal)
    throw new Error("This menu has no source terminal pane.");
  const matching = paneList.filter(p => p.pane === target.pane);
  if (matching.length !== 1 || paneList.filter(p => p.terminal === target.terminal).length !== 1 || matching[0].terminal !== target.terminal || typeof matching[0].tab !== "string" || !matching[0].tab)
    throw new Error("Source pane is missing, ambiguous or no longer shows that terminal.");
  const pane = matching[0];
  const owners = spaceList.filter(space => Array.isArray(space.tabs) && space.tabs.some(tab => tab.id === pane.tab));
  if (owners.length !== 1 || owners[0].tabs.filter(tab => tab.id === pane.tab).length !== 1)
    throw new Error("Source pane has no unique owning workspace.");
  const owner = owners[0], on = owner.machine;
  if (typeof owner.id !== "string" || !owner.id || !(on === null || typeof on === "string" && !!on.trim() && !/[\x00-\x1f\x7f]/.test(on)))
    throw new Error("Source workspace machine is unavailable.");
  return Object.freeze({ pane: pane.pane, terminal: pane.terminal, tab: pane.tab, space: owner.id, on });
}

export function openClipboard(snapshot, paneList, spaceList) {
  const current = captureSource(snapshot.source, paneList, spaceList);
  for (const key of ["pane", "terminal", "tab", "space", "on"])
    if (current[key] !== snapshot.source[key]) throw new Error("Source context changed; reopen its menu.");
  return { pane: current.pane, direction: "right", mod: "herdr-md",
    props: { file: clipboardPath(snapshot.path), on: current.on } };
}
