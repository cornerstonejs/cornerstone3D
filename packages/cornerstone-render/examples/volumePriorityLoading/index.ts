import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
  imageLoadPoolManager,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetColorMapTransferFunction,
} from '../../../../utils/demo/helpers'
// Auto registers volume loader
import '@precisionmetrics/cornerstone-image-loader-streaming-volume' // Registers volume loader

// Define unique ids for the volumes
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
const ctVolumeUID = `${volumeLoaderProtocolName}:${ctVolumeName}` // VolumeUID with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_UID'
const ptVolumeUID = `${volumeLoaderProtocolName}:${ptVolumeName}`

// ======== Set up page ======== //
setTitleAndDescription(
  'Custom Priority Loading Order',
  'Here we demonstrate loading frames in a custom order rather loading volumes sequentially as happens by default'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)
// ============================= //

function generateRequests(customOrderedRequests, ctRequests, ptRequests) {
  const requests = []
  const requestType = 'prefetch'
  const priority = 0

  for (let i = 0; i < customOrderedRequests.length; i++) {
    const { imageId } = customOrderedRequests[i]
    const additionalDetails = { volumeUID: '' }

    const ctRequest = ctRequests.filter((req) => req.imageId === imageId)

    // if ct request
    if (ctRequest.length) {
      additionalDetails.volumeUID = ctVolumeUID
      const { callLoadImage, imageId, imageIdIndex, options } = ctRequest[0]
      requests.push({
        callLoadImage: callLoadImage.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority,
      })
    }

    const ptRequest = ptRequests.filter((req) => req.imageId === imageId)

    // if pet request
    if (ptRequest.length) {
      additionalDetails.volumeUID = ptVolumeUID
      const { callLoadImage, imageId, imageIdIndex, options } = ptRequest[0]
      requests.push({
        callLoadImage: callLoadImage.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority,
      })
    }
  }

  return requests
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  const wadoRsRoot = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs'
  const StudyInstanceUID = '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463'

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
    type: 'VOLUME',
  })

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
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

  // Define a volume in memory
  const ctVolume = await createAndCacheVolume(ctVolumeUID, {
    imageIds: ctImageIds,
  })

  // Define a volume in memory
  const ptVolume = await createAndCacheVolume(ptVolumeUID, {
    imageIds: ptImageIds,
  })

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeUID: ctVolumeUID },
    { volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction },
  ])

  const ctRequests = ctVolume.getImageLoadRequests()
  const ptRequests = ptVolume.getImageLoadRequests()

  // Alternate requests between volumes. This is a basic example, you could:
  // - Take more care to load equal regions of space between fused volumes, where dimensions are different.
  // - Load from the middle outwards instead of loading superior to inferior.
  // - Load slices that you know are of clinical interest first (e.g. those that have been annotated/segmented previously)
  const customOrderedRequests = []

  const maxFrames = Math.max(ctRequests.length, ptRequests.length)

  for (let i = 0; i < maxFrames; i++) {
    if (ctRequests[i]) customOrderedRequests.push(ctRequests[i])
    if (ptRequests[i]) customOrderedRequests.push(ptRequests[i])
  }

  const requests = generateRequests(customOrderedRequests, ctRequests, ptRequests)

  // adding requests to the imageLoadPoolManager
  requests.forEach((request) => {
    const { callLoadImage, requestType, additionalDetails, priority } = request
    imageLoadPoolManager.addRequest(callLoadImage, requestType, additionalDetails, priority)
  })

  // Render the image
  renderingEngine.render()
}

run()
