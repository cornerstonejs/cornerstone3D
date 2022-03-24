import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
// Auto registers volume loader
import '@cornerstonejs/streaming-image-volume-loader' // Registers volume loader

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic Volume',
  'Displays a DICOM series in a Volume viewport.'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)
// ============================= //

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
  const renderingEngineId = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineId)

  // Create a stack viewport
  const viewportId = 'CT_SAGITTAL_STACK'
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_ID' // Id of the volume less loader prefix
  const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderProtocolName}:${volumeName}` // VolumeId with loader id + volume id

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  })

  // Set the volume to load
  volume.load()

  // Set the volume on the viewport
  viewport.setVolumes([{ volumeId }])

  // Render the image
  renderingEngine.render()
}

run()
