export function removeLegacyAccessToken(): void {
  try {
    window.localStorage.removeItem('afrixora_token');
  } catch {
    // Le navigateur peut désactiver le stockage local.
  }
}

export function redirectToLogin(): void {
  if (typeof window !== 'undefined') window.location.href = '/login';
}
