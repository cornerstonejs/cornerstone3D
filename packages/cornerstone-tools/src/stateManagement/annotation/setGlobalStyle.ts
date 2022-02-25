import { Settings } from '@precisionmetrics/cornerstone-render'

export default function setGlobalStyle(
  style: Record<string, unknown>
): boolean {
  return Settings.getRuntimeSettings().set('tool.style', style)
}
