import { Settings } from '@ohif/cornerstone-render'

/*
 * Initialization
 */

Settings.getDefaultSettings().set('segmentation', {
  renderOutline: true,
  outlineWidth: 3,
  renderFill: true,
  shouldRenderInactiveLabelmaps: true,
  // radius: 10,
  // minRadius: 1,
  // maxRadius: 50,
  // fillAlpha: 0.2,
  // fillAlphaInactive: 0.1,
  // outlineAlpha: 0.7,
  // outlineAlphaInactive: 0.35,
  // storeHistory: true,
  // segmentsPerLabelmap: 65535, // Max is 65535 due to using 16-bit Unsigned ints.
})

export default function setSegmentationConfig(
  config: Record<string, unknown>
): boolean {
  return Settings.getDefaultSettings().set('segmentation', config)
}
