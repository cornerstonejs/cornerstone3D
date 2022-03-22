import initProviders from './initProviders'
import initCornerstoneWADOImageLoader from './initCornerstoneWADOImageLoader'
import { init as csRenderInit } from '@cornerstonejs/core'
import { init as csToolsInit } from '@cornerstonejs/tools'

export default async function initDemo() {
  initProviders()
  initCornerstoneWADOImageLoader()
  await csRenderInit()
  await csToolsInit()
}
