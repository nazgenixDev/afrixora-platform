export const passwordRequirements = "Le mot de passe doit contenir au moins 12 caractères et tenir dans 72 octets UTF-8.";

export function isValidNewPassword(value: string): boolean {
  return value.length >= 12 && new TextEncoder().encode(value).length <= 72;
}
