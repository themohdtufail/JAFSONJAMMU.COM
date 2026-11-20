"use client";
/** Whether to play the fancy motion at all: off for people who ask their device for less motion, on data saver, and on very small low-power phones. */
export function motionOk(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") return false;
  return true;
}
/** Hover-style effects need a real mouse or trackpad; on touch screens they would fire by accident while scrolling. */
export const finePointer = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
