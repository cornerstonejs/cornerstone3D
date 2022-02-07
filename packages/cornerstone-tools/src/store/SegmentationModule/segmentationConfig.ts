import { triggerLabelmapsUpdated } from './triggerLabelmapsUpdated'

export interface ISegmentationConfig {
  enabled: boolean
  renderOutline: boolean
  outlineWidth: number
  outlineWidthActive: number
  outlineWidthInactive: number
  renderFill: boolean
  renderInactiveLabelmaps: boolean
  segmentsPerLabelmap: number
  fillAlpha: number
  fillAlphaInactive: number
}

const defaultSegmentationConfig: ISegmentationConfig = {
  // render labelmaps or not
  enabled: true,
  renderInactiveLabelmaps: true,
  // Outline
  renderOutline: true,
  outlineWidth: 3,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  // Todo: not supported yet
  // outlineAlpha: 0.7,
  // outlineAlphaInactive: 0.35,
  // Fill inside the render maps
  renderFill: true,
  fillAlpha: 0.9,
  fillAlphaInactive: 0.85,
  // ColorLUT
  segmentsPerLabelmap: 65535, // Todo: max is bigger, but it seems cfun can go upto 255 anyway
  // Brush
  // radius: 10,
  // minRadius: 1,
  // maxRadius: 50,
  // storeHistory: true,
}

/**
 * Sets the global config for all labelmaps
 * @param config segmentation config
 * @param immediate re-render labelmaps immediately
 */
function setGlobalConfig(
  config: Partial<ISegmentationConfig>,
  immediate = true
): void {
  Object.assign(defaultSegmentationConfig, config)
  if (immediate) {
    // re-render all labelmaps so that the changed config gets applied
    triggerLabelmapsUpdated()
  }
}

// todo: setting configuration per labelmap (not globally)
function setLabelmapConfig(
  canvas: HTMLCanvasElement,
  labelmapUID: string,
  config: Partial<ISegmentationConfig>,
  immediate = true
): void {
  // Look into the state for all the viewports that have the same labelmap in their labelmaps and apply the config
}

// todo: setting configuration per element (canvas) for the active labelmap (not globally)
function setElementActiveLabelmapConfig(
  canvas: HTMLCanvasElement,
  config: Partial<ISegmentationConfig>,
  immediate = true
): void {}

export default defaultSegmentationConfig
export { setGlobalConfig }
