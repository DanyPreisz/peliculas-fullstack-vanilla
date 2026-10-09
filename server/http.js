import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
export function sendJson(res, status, body) { const payload = body === undefined ? "" : JSON.stringify(body); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) }); res.end(payload); }
export function sendEmpty(res, status = 204) { res.writeHead(status); res.end(); }
export async function readJson(req, limit = 64_000) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) { const err = new Error("Cuerpo demasiado grande"); err.status = 413; throw err; } chunks.push(chunk); } if (!chunks.length) return {}; try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { const err = new Error("JSON invalido"); err.status = 400; throw err; } }
function safePublicPath(urlPath) { const resolved = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(urlPath.split("?")[0]))); return resolved.startsWith(PUBLIC_DIR) ? resolved : null; }
export function serveStatic(req, res) { let filePath = safePublicPath(req.url === "/" ? "/index.html" : req.url); if (!filePath) return sendJson(res, 403, { error: "Ruta invalida" }); if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, "index.html"); if (!existsSync(filePath)) return sendJson(res, 404, { error: "No encontrado" }); res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" }); createReadStream(filePath).pipe(res); }
export function createApp(handler) { return createServer(async (req, res) => { try { await handler(req, res); } catch (err) { sendJson(res, err.status || 500, { error: err.message || "Error interno" }); } }); }
