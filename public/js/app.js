import { api, setSession, clearSession, getToken } from "./api.js";
const LABELS = { "por-ver": "Por ver", viendo: "Viendo", vista: "Vista", pelicula: "Pelicula", serie: "Serie" };
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const filtersEl = document.querySelector("#filters");
const listEl = document.querySelector("#list");
const form = document.querySelector("#title-form");
const formError = document.querySelector("#form-error");
let mode = "login";
let status = "";
let query = "";
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function renderFilters(counts) {
  filtersEl.innerHTML = "";
  [["", "Todas"], ["por-ver", "Por ver"], ["viendo", "Viendo"], ["vista", "Vistas"]].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${status === value ? " active" : ""}`;
    button.textContent = value ? `${label} ${counts[value] || 0}` : label;
    button.addEventListener("click", async () => { status = value; await refresh(); });
    filtersEl.append(button);
  });
}
async function refresh() {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  const data = await api(`/api/titles?${params}`);
  renderFilters(data.counts);
  listEl.innerHTML = "";
  if (!data.titles.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay titulos.";
    listEl.append(empty);
    return;
  }
  data.titles.forEach((item) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("span");
    text.textContent = `${item.title} \u00b7 ${LABELS[item.kind]} \u00b7 ${item.rating}/5`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "ghost";
    next.textContent = LABELS[item.status];
    next.addEventListener("click", async () => {
      const order = ["por-ver", "viendo", "vista"];
      const statusNext = order[(order.indexOf(item.status) + 1) % order.length];
      await api(`/api/titles/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: statusNext }) });
      await refresh();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/titles/${item.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, next, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll("#auth-view .tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/titles", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), kind: document.querySelector("#kind").value, status: document.querySelector("#status").value, rating: document.querySelector("#rating").value }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
