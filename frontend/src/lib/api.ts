import axios, { type InternalAxiosRequestConfig } from "axios";
import { redirectToLogin, removeLegacyAccessToken } from "./auth";
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
const logoutPath = "/api/v1/auth/logout";
let pendingRefresh: Promise<void> | undefined;

interface RetryConfig extends InternalAxiosRequestConfig {
  retriedAfterRefresh?: boolean;
}

// La file d’attente couvre les requêtes API, les sockets et les onglets de la même origine.
async function withSessionLock(action: () => Promise<unknown>) {
  if (navigator.locks) await navigator.locks.request("afrixora-session", action);
  else await action();
}

export function refreshSession(): Promise<void> {
  pendingRefresh ??= withSessionLock(() => api.post(refreshPath)).finally(() => {
    pendingRefresh = undefined;
  });
  return pendingRefresh;
}

export async function logoutSession(): Promise<void> {
  await pendingRefresh?.catch(() => undefined);
  await withSessionLock(() => api.post(logoutPath));
}

if (typeof window !== "undefined") removeLegacyAccessToken();

api.interceptors.request.use((config): InternalAxiosRequestConfig => {
  if (typeof window !== "undefined") {
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
  if (!config || path?.endsWith(loginPath) || path?.endsWith(refreshPath) || path?.endsWith(logoutPath)) {
    throw error;
  }

  if (config.retriedAfterRefresh) {
    redirectToLogin();
    throw error;
  }

  config.retriedAfterRefresh = true;
  try {
    await refreshSession();
  } catch {
    redirectToLogin();
    throw error;
  }
  return api(config);
});

export default api;
