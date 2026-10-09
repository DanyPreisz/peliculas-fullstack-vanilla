const KEY = "peliculas_token";
export const getToken = () => localStorage.getItem(KEY) || "";
export const setSession = (token) => localStorage.setItem(KEY, token);
export const clearSession = () => localStorage.removeItem(KEY);
export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de red");
  return data;
}
