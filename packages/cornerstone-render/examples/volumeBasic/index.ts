import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
} from '@precisionmetrics/cornerstone-render'
import { initDemo, createImageIdsAndCacheMetaData, setTitleAndDescription } from '../../../../utils/demo/helpers'
// Auto registers volume loader
import '@precisionmetrics/cornerstone-image-loader-streaming-volume' // Registers volume loader

// ======== Set up page ======== //
setTitleAndDescription('Basic Volume', 'Displays a DICOM series in a Volume viewport.')

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
    StudyInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'VOLUME',
  })

  // Instantiate a rendering engine
  const renderingEngineUID = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create a stack viewport
  const viewportUID = 'CT_SAGITTAL_STACK'
  const viewportInput = {
    viewportUID,
    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: [0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Get the stack viewport that was created
  const viewport = <Types.VolumeViewport>renderingEngine.getViewport(viewportUID)

  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
  const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
  const volumeUID = `${volumeLoaderProtocolName}:${volumeName}` // VolumeUID with loader id + volume id

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
