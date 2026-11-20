import axios, { type InternalAxiosRequestConfig } from "axios";
import { redirectToLogin } from "./auth";
import { API_URL } from "./config";
import useStore from "@/store";

export const tenantDeletedEvent = "afrixora:tenant-deleted";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

const loginPath = "/api/v1/auth/login";
const refreshPath = "/api/v1/auth/refresh";
const useLocalToken = process.env.NODE_ENV === "development";
let pendingRefresh: Promise<void> | undefined;

interface RetryConfig extends InternalAxiosRequestConfig {
  retriedAfterRefresh?: boolean;
}

async function refreshSession(): Promise<void> {
  try {
    const { data } = await api.post<{ accessToken?: string }>(refreshPath);
    if (useLocalToken && data.accessToken) {
      localStorage.setItem("afrixora_token", data.accessToken);
    }
  } finally {
    pendingRefresh = undefined;
  }
}

api.interceptors.request.use((config): InternalAxiosRequestConfig => {
  if (typeof window !== "undefined") {
    if (useLocalToken) {
      const token = localStorage.getItem("afrixora_token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }

    const path = config.url?.split(/[?#]/, 1)[0].replace(/\/+$/, "") ?? "";
    const isGlobalTenantRoute = path === "/api/v1/tenants"
      || (path.startsWith("/api/v1/tenants/") && !path.startsWith("/api/v1/tenants/current/"));
    const { user, impersonatedTenantId } = useStore.getState();
    if (path.startsWith("/api/v1/") && !path.startsWith("/api/v1/auth/") && !isGlobalTenantRoute
      && impersonatedTenantId && (!user || user.role === "SUPER_ADMIN")) {
      config.headers.set("x-tenant-id", impersonatedTenantId);
    } else {
      config.headers.delete("x-tenant-id");
    }
  }
  return config;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (typeof window === "undefined" || !axios.isAxiosError<{ code?: string }>(error)) {
    throw error;
  }

  if (error.response?.status === 404 && error.response.data.code === "IMPERSONATED_TENANT_NOT_FOUND") {
    const { impersonatedTenantId, setImpersonatedTenantId } = useStore.getState();
    if (impersonatedTenantId && error.config?.headers.get("x-tenant-id") === impersonatedTenantId) {
      setImpersonatedTenantId(null);
    }
  }
  if (error.response?.status !== 401) throw error;

  const config: RetryConfig | undefined = error.config;
  const path = config?.url?.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  if (!config || path?.endsWith(loginPath) || path?.endsWith(refreshPath)) {
    throw error;
  }

  if (config.retriedAfterRefresh) {
    redirectToLogin();
    throw error;
  }

  config.retriedAfterRefresh = true;
  try {
    pendingRefresh ??= refreshSession();
    await pendingRefresh;
  } catch {
    redirectToLogin();
    throw error;
  }
  return api(config);
});

export default api;
