import initProviders from './initProviders'
import initCornerstoneWADOImageLoader from './initCornerstoneWADOImageLoader'
import { init as csRenderInit } from '@precisionmetrics/cornerstone-render'
import { init as csToolsInit } from '@precisionmetrics/cornerstone-tools'

export default async function initDemo() {
  initProviders()
  initCornerstoneWADOImageLoader()
  await csRenderInit()
  await csToolsInit()
}
