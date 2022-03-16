import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
  getRenderingEngine,
  EVENTS as RenderingEngineEvents,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers'
import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'
// Auto registers volume loader
import '@precisionmetrics/cornerstone-image-loader-streaming-volume' // Registers volume loader

const { BlendMode } = vtkConstants

const renderingEngineUID = 'myRenderingEngine'
const viewportUID = 'CT_SAGITTAL_STACK'

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const volumeUID = `${volumeLoaderProtocolName}:${volumeName}` // VolumeUID with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Events',
  'Shows events emitted by Cornerstone Volume Viewports.'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

const lastEvents = []
const lastEventsDiv = document.createElement('div')

content.appendChild(lastEventsDiv)

function updateLastEvents(number, eventName, detail) {
  if (lastEvents.length > 4) {
    lastEvents.pop()
  }

  lastEvents.unshift({ number, eventName, detail })

  // Display
  lastEventsDiv.innerHTML = ''

  lastEvents.forEach((le) => {
    const element = document.createElement('p')

    element.style.border = '1px solid black'
    element.innerText = le.number + ' ' + le.eventName + '\n\n' + le.detail

    lastEventsDiv.appendChild(element)
  })
}

let eventNumber = 1

const { IMAGE_RENDERED, CAMERA_MODIFIED, STACK_NEW_IMAGE } =
  RenderingEngineEvents

element.addEventListener(
  IMAGE_RENDERED,
  (evt: Types.EventTypes.ImageRenderedEvent) => {
    updateLastEvents(eventNumber, IMAGE_RENDERED, JSON.stringify(evt.detail))
    eventNumber++
  }
)

element.addEventListener(
  CAMERA_MODIFIED,
  (evt: Types.EventTypes.CameraModifiedEvent) => {
    updateLastEvents(eventNumber, CAMERA_MODIFIED, JSON.stringify(evt.detail))
    eventNumber++
  }
)

element.addEventListener(
  STACK_NEW_IMAGE,
  (evt: Types.EventTypes.StackNewImageEvent) => {
    // Remove the image since then we serialise a bunch of pixeldata to the screen.
    const { imageId, renderingEngineUID, viewportUID } = evt.detail
    const detail = {
      imageId,
      renderingEngineUID,
      viewportUID,
      image: 'cornerstoneImageObject',
    }

    updateLastEvents(eventNumber, STACK_NEW_IMAGE, JSON.stringify(detail))
    eventNumber++
  }
)
// ============================= //

// TODO -> Maybe some of these implementations should be pushed down to some API

// Buttons
addButtonToToolbar('Set VOI Range', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  // Get the stack viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Get the volume actor from the viewport
  const actor = viewport.getActor(volumeUID)

  // Set the mapping range of the actor to a range to highlight bones
  actor.volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setMappingRange(-1500, 2500)

  viewport.render()
})

addButtonToToolbar('Apply Random Zoom And Pan', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  // Get the stack viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Reset the camera so that we can set some pan and zoom relative to the
  // defaults for this demo. Note that changes could be relative instead.
  viewport.resetCamera()

  // Get the current camera properties
  const camera = viewport.getCamera()

  const { parallelScale, position, focalPoint } =
    cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50)

  viewport.setCamera({
    parallelScale,
    position: <Types.Point3>position,
    focalPoint: <Types.Point3>focalPoint,
  })
  viewport.render()
})

addButtonToToolbar('Reset Viewport', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Resets the viewport's camera
  viewport.resetCamera()
  // TODO reset the viewport properties, we don't have API for this.

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
    type: 'VOLUME',
  })

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create a stack viewport
  const viewportInput = {
    viewportUID,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Define a volume in memory
  const volume = await createAndCacheVolume(volumeUID, {
    imageIds,
  })

  // Set the volume to load
  volume.load()

  // Set the volume on the viewport
  viewport.setVolumes([{ volumeUID }])

  // Render the image
  renderingEngine.render()
}

run()
