/**
 * Authentication utilities for AFRIXORA frontend
 * Token is stored in httpOnly cookie (no localStorage).
 */

/**
 * Get the authentication token — deprecated, token is now in httpOnly cookie.
 * @returns null (token inaccessible from JS)
 */
export const getToken = (): string | null => {
  return null;
};

/**
 * Set the authentication token — deprecated, token is set via httpOnly cookie by backend.
 */
export const setToken = (_token: string): void => {
  // No-op: token is in httpOnly cookie, not localStorage
};

/**
 * Clear the authentication token — deprecated, use logout API instead.
 */
export const clearToken = (): void => {
  // No-op: token is in httpOnly cookie, cleared by logout API
};

/**
 * Check if the user is authenticated
 * @returns true by default (relies on API returning 401)
 */
export const isAuthenticated = (): boolean => {
  // We rely on the /auth/me endpoint to determine auth status
  return true; // will be caught by 401 interceptor
};

/**
 * Redirect to login page
 */
export const redirectToLogin = (): void => {
  if (typeof window === "undefined") return;
  window.location.href = "/login";
};

/**
 * Redirect to dashboard
 */
export const redirectToDashboard = (): void => {
  if (typeof window === "undefined") return;
  window.location.href = "/";
};

/**
 * Call logout API and redirect
 */
export const logout = async (api: any): Promise<void> => {
  try {
    await api.post("/api/v1/auth/logout");
  } catch {
    // ignore errors
  }
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};
