import {
  RenderingEngine,
  VIEWPORT_TYPE,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import * as cs from '@precisionmetrics/cornerstone-render'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import { registerWebImageLoader } from '@precisionmetrics/cornerstone-image-loader-streaming-volume'

const content = document.getElementById('content')

const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

console.warn('hello!! - ERIK')
async function setup() {
  await csRenderInit()

  csTools3d.init()

  registerWebImageLoader(cs)

  const renderingEngineUID = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  const viewportInput = [
    {
      viewportUID: 'CT_STACK',
      type: VIEWPORT_TYPE.STACK,
      element,
      defaultOptions: {
        background: [0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)
}

setup()
