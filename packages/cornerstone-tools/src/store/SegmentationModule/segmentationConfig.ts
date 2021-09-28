import { Settings } from '@ohif/cornerstone-render'

interface ISegmentationConfig {
  renderOutline: boolean
  outlineWidth: number
  renderFill: boolean
  renderInactiveLabelmaps: boolean
  segmentsPerLabelmap: number
}

const defaultSegmentationConfig: ISegmentationConfig = {
  renderOutline: true,
  outlineWidth: 2,
  renderFill: true,
  renderInactiveLabelmaps: false,
  segmentsPerLabelmap: 65535, // Todo: Out max is bigger, but it seems cfun can go upto 255 anyway
  // radius: 10,
  // minRadius: 1,
  // maxRadius: 50,
  // fillAlpha: 0.2,
  // fillAlphaInactive: 0.1,
  // outlineAlpha: 0.7,
  // outlineAlphaInactive: 0.35,
  // storeHistory: true,
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
