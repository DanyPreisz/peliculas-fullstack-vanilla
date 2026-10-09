import { URL } from "node:url";
import { connect, isReady, users, titles, toId, mapTitle } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const STATUSES = new Set(["por-ver", "viendo", "vista"]);
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function ratingOf(value) { const n = Number(value); if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(5, Math.round(n))); }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/titles") {
    const q = String(searchParams.get("q") || "").trim();
    const status = String(searchParams.get("status") || "");
    const query = { userId };
    if (STATUSES.has(status)) query.status = status;
    if (q) query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const rows = await titles().find(query).sort({ title: 1 }).limit(200).toArray();
    const all = await titles().find({ userId }).toArray();
    const counts = { "por-ver": 0, viendo: 0, vista: 0 };
    all.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
    return sendJson(res, 200, { titles: rows.map(mapTitle), counts });
  }
  if (method === "POST" && pathname === "/api/titles") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "El titulo es obligatorio" });
    const result = await titles().insertOne({ userId, title: title.slice(0, 80), kind: body.kind === "serie" ? "serie" : "pelicula", status: STATUSES.has(body.status) ? body.status : "por-ver", rating: ratingOf(body.rating), createdAt: new Date() });
    return sendJson(res, 201, { title: mapTitle(await titles().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/titles\/([a-fA-F0-9]{24})$/);
  if (match) {
    const id = toId(match[1]);
    const existing = await titles().findOne({ _id: id, userId });
    if (!existing) return sendJson(res, 404, { error: "Titulo no encontrado" });
    if (method === "PATCH") {
      const body = await readJson(req);
      await titles().updateOne({ _id: id, userId }, { $set: { status: STATUSES.has(body.status) ? body.status : existing.status, rating: body.rating !== undefined ? ratingOf(body.rating) : existing.rating } });
      return sendJson(res, 200, { title: mapTitle(await titles().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await titles().deleteOne({ _id: id, userId });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Peliculas en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
