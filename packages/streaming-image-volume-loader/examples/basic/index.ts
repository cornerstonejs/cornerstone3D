import {
  RenderingEngine,
  Enums,
  init as csRenderInit,
  Types,
} from '@cornerstonejs/core'
import * as cs from '@cornerstonejs/core'
import * as csTools3d from '@cornerstonejs/tools'

// import { registerWebImageLoader } from '@cornerstonejs/streaming-image-volume-loader'

const content = document.getElementById('content')

const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

async function setup() {
  await csRenderInit()

  csTools3d.init()

  // registerWebImageLoader(cs)

  const renderingEngineId = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineId)

  const viewportInput = [
    {
      viewportId: 'CT_STACK',
      type: Enums.ViewportType.STACK,
      element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInput)
}

setup()
