import { z } from 'zod';

const siteZones = new Map([
  ['lubumbashi', 'Africa/Lubumbashi'],
  ['kolwezi', 'Africa/Lubumbashi'],
  ['likasi', 'Africa/Lubumbashi'],
  ['kinshasa', 'Africa/Kinshasa'],
  ['matadi', 'Africa/Kinshasa'],
  ['goma', 'Africa/Lubumbashi'],
  ['bukavu', 'Africa/Lubumbashi'],
  ['kisangani', 'Africa/Lubumbashi'],
]);

export function validTimeZone(value: string): boolean {
  if (value !== 'UTC' && !/^[a-z_]+(?:\/[a-z0-9_+-]+)+$/i.test(value)) return false;
  try {
    new Intl.DateTimeFormat('fr', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().trim().max(100).refine(validTimeZone, 'Fuseau IANA invalide.');

export function buildingTimeZone(building: { city: string; timeZone: string | null }): string | null {
  if (building.timeZone && validTimeZone(building.timeZone)) return building.timeZone;
  return siteZones.get(building.city.trim().toLowerCase()) ?? null;
}
