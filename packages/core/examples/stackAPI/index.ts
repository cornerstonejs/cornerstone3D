import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers'

const { ViewportType } = Enums

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine'
const viewportId = 'CT_STACK'

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewport API',
  'Demonstrates how to interact with a Stack viewport.'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

addButtonToToolbar('Set VOI Range', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Set a range to highlight bones
  viewport.setProperties({ voiRange: { upper: 2500, lower: -1500 } })

  viewport.render()
})

addButtonToToolbar('Next Image', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Get the current index of the image displayed
  const currentImageIdIndex = viewport.getCurrentImageIdIndex()

  // Increment the index, clamping to the last image if necessary
  const numImages = viewport.getImageIds().length
  let newImageIdIndex = currentImageIdIndex + 1

  newImageIdIndex = Math.min(newImageIdIndex, numImages - 1)

  // Set the new image index, the viewport itself does a re-render
  viewport.setImageIdIndex(newImageIdIndex)
})

addButtonToToolbar('Previous Image', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Get the current index of the image displayed
  const currentImageIdIndex = viewport.getCurrentImageIdIndex()

  // Increment the index, clamping to the first image if necessary
  let newImageIdIndex = currentImageIdIndex - 1

  newImageIdIndex = Math.max(newImageIdIndex, 0)

  // Set the new image index, the viewport itself does a re-render
  viewport.setImageIdIndex(newImageIdIndex)
})

addButtonToToolbar('Flip H', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  const { flipHorizontal } = viewport.getProperties()

  viewport.setProperties({ flipHorizontal: !flipHorizontal })

  viewport.render()
})

addButtonToToolbar('Flip V', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  const { flipVertical } = viewport.getProperties()

  viewport.setProperties({ flipVertical: !flipVertical })

  viewport.render()
})

addButtonToToolbar('Rotate', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  const rotation = Math.random() * 360

  viewport.setProperties({ rotation })

  viewport.render()
})

addButtonToToolbar('Invert', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  const { invert } = viewport.getProperties()

  viewport.setProperties({ invert: !invert })

  viewport.render()
})

addButtonToToolbar('Apply Random Zoom And Pan', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Reset the camera so that we can set some pan and zoom relative to the
  // defaults for this demo. Note that changes could be relative instead.
  viewport.resetCamera()

  // Get the current camera properties
  const camera = viewport.getCamera()

  const { parallelScale, position, focalPoint } =
    cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50)

  const newCamera = {
    parallelScale,
    position: <Types.Point3>position,
    focalPoint: <Types.Point3>focalPoint,
  }

  viewport.setCamera(newCamera)
  viewport.render()
})

addButtonToToolbar('Reset Viewport', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Resets the viewport's camera
  viewport.resetCamera()
  // Resets the viewport's properties
  viewport.resetProperties()
  viewport.render()
})

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'STACK',
  })

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId)

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Define a stack containing a few images
  const stack = [imageIds[0], imageIds[1], imageIds[2]]

  // Set the stack on the viewport
  viewport.setStack(stack)

  // Render the image
  renderingEngine.render()
}

run()
