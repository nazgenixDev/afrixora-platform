import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("afrixora_access_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Lire l'impersonated tenant directement depuis localStorage
      const impersonated = localStorage.getItem("afrixora_impersonated_tenant_id");
      if (impersonated) {
        config.headers["x-tenant-id"] = impersonated;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && error.response && error.response.status === 401) {
      localStorage.removeItem("afrixora_access_token");
      localStorage.removeItem("afrixora_impersonated_tenant_id");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
