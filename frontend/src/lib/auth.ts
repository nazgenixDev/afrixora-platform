/**
 * Authentication utilities for AFRIXORA frontend
 */

const TOKEN_KEY = "afrixora_access_token";

/**
 * Get the authentication token from localStorage
 * @returns The token string or null if not found
 */
export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Set the authentication token in localStorage
 * @param token The JWT token to store
 */
export const setToken = (token: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
};

/**
 * Clear the authentication token from localStorage
 */
export const clearToken = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
};

/**
 * Check if the user is authenticated
 * @returns True if a token exists, false otherwise
 */
export const isAuthenticated = (): boolean => {
  return !!getToken();
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