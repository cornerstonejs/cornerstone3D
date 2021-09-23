import { Settings } from '@ohif/cornerstone-render'

interface ISegmentationConfig {
  renderOutline: boolean
  outlineWidth: number
  renderFill: boolean
  renderInactiveLabelmaps: boolean
}

const defaultSegmentationConfig: ISegmentationConfig = {
  renderOutline: true,
  outlineWidth: 3,
  renderFill: true,
  renderInactiveLabelmaps: false,
  // radius: 10,
  // minRadius: 1,
  // maxRadius: 50,
  // fillAlpha: 0.2,
  // fillAlphaInactive: 0.1,
  // outlineAlpha: 0.7,
  // outlineAlphaInactive: 0.35,
  // storeHistory: true,
  // segmentsPerLabelmap: 65535, // Max is 65535 due to using 16-bit Unsigned ints.
}

// Initialize the segmentation config
Settings.getDefaultSettings().set('segmentation', defaultSegmentationConfig)

function setSegmentationConfig(config: Record<string, unknown>): boolean {
  return Settings.getDefaultSettings().set('segmentation', config)
}

function getSegmentationConfig(): ISegmentationConfig {
  const config = Settings.getDefaultSettings(
    'segmentation'
  ) as ISegmentationConfig
  return config
}

export { setSegmentationConfig, getSegmentationConfig }
