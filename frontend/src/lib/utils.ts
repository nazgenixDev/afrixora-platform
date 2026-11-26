import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Device } from "@/types";

/**
 * Combines multiple class names using clsx and tailwind-merge
 * @param inputs Class names to combine
 * @returns Combined class name string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getReportedDeviceState(device: Pick<Device, "states">): "on" | "off" | null {
  const value = device.states?.[0]?.state;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.source !== "device_reported") return null;
  return state.state === "on" || state.state === "off" ? state.state : null;
}
