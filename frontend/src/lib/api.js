import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

// ----- Global in-flight request tracking (for GlobalSpinner) -----
let activeRequests = 0;
const listeners = new Set();
const notify = () => { listeners.forEach((fn) => { try { fn(activeRequests); } catch {} }); };

/** Subscribe to changes in in-flight request count. Returns unsubscribe fn. */
export const subscribeToRequests = (fn) => {
  listeners.add(fn);
  try { fn(activeRequests); } catch {}
  return () => listeners.delete(fn);
};
// Expose for debugging
if (typeof window !== "undefined") window.__erpApiActive = () => activeRequests;
// ------------------------------------------------------------------

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("erp_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  // Allow individual requests to opt out of the global spinner by setting cfg.silent = true
  if (!cfg.silent) {
    activeRequests++;
    notify();
  }
  return cfg;
});

const decr = (cfg) => {
  if (cfg && !cfg.silent) {
    activeRequests = Math.max(0, activeRequests - 1);
    notify();
  }
};

api.interceptors.response.use(
  (r) => { decr(r?.config); return r; },
  (err) => {
    decr(err?.config);
    if (err?.response?.status === 401) {
      localStorage.removeItem("erp_token");
      localStorage.removeItem("erp_user");
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/portal") && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
