// Remote document paths are POSIX paths, never Mac file URLs or Finder targets.
import { marked } from "./marked.js";
export const REMOTE_POLL_MS = 2000;
export const REMOTE_LIMITS = "Remote mode: polls every 2s · media, diagrams, picker and agent annotations disabled";

// The host's inline Markdown renderer must never see image destinations for a
// remote document (mixed prose, table cells and lists also use this path).
export function remoteInline(md) {
  const images = [];
  marked.walkTokens(marked.lexer(md), token => { if (token.type === "image") images.push(token.raw); });
  for (const raw of images) md = md.split(raw).join("[remote media disabled]");
  return md.replace(/<img\b[^>]*>/gi, "[remote media disabled]");
}

export function remoteSourceError(file, on) {
  if (typeof on !== "string" || !on.trim()) return "Remote source needs a non-empty machine name (on).";
  if (typeof file !== "string" || !file.startsWith("/") || /[\0\r\n]/.test(file)) return "Remote source needs an absolute POSIX file path.";
  return null;
}

export function remoteLink(file, url) {
  if (typeof url !== "string" || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) throw new Error("Remote links must be Markdown paths, not file URLs or other schemes.");
  const hash = url.indexOf("#"), fragment = hash < 0 ? null : url.slice(hash + 1);
  const raw = hash < 0 ? url : url.slice(0, hash);
  const path = decodeURIComponent(raw.split("?")[0]);
  if (/[\0\r\n]/.test(path) || path.startsWith("//")) throw new Error("Invalid remote path.");
  const absolute = path.startsWith("/") ? path : file.slice(0, file.lastIndexOf("/") + 1) + path;
  const parts = [];
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  const resolved = "/" + parts.join("/");
  if (!/\.(md|markdown|mdx)$/i.test(resolved)) throw new Error("Remote non-Markdown links/media are disabled; no Mac file will be opened.");
  // Validate now so malformed fragments cannot throw from an event callback.
  if (fragment !== null) decodeURIComponent(fragment);
  return { file: resolved, fragment };
}
