import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4000",  // ← URL fixe du backend
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});


api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      // Token JWT depuis localStorage (fallback dev cross-port)
      const token = localStorage.getItem("afrixora_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Header x-tenant-id pour impersonation SUPER_ADMIN
      const impersonated = localStorage.getItem("afrixora_impersonated_tenant_id");
      if (impersonated) {
        config.headers["x-tenant-id"] = impersonated;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur de réponse : refresh token automatique (protégé contre les boucles)
// En production (même domaine via reverse proxy), le cookie httpOnly est envoyé automatiquement.
// En développement cross-port, le fallback localStorage + header Authorization est utilisé.
let isRefreshing = false;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      typeof window !== "undefined" &&
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login") &&
      !isRefreshing
    ) {
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        await api.post("/api/v1/auth/refresh");
        isRefreshing = false;
        return api(originalRequest);
      } catch {
        isRefreshing = false;
        localStorage.removeItem("afrixora_token");
        localStorage.removeItem("afrixora_impersonated_tenant_id");
        window.location.href = "/login";
      }
    }
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("afrixora_token");
      localStorage.removeItem("afrixora_impersonated_tenant_id");
      if (!originalRequest._retry && !originalRequest.url?.includes("/auth/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
