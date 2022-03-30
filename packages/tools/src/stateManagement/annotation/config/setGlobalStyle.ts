import { Settings } from '@cornerstonejs/core';

/**
 * Takes a `style` object and sets it as the
 * global style
 * @param style - The style object to set.
 * @returns A boolean value.
 */
export default function setGlobalStyle(
  style: Record<string, unknown>
): boolean {
  return Settings.getRuntimeSettings().set('tool.style', style);
}
