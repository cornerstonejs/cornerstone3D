import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
} from '@precisionmetrics/cornerstone-render'
// TODO -> A load of the utilities in cornerstone tools are just about the volumes and should be in core instead
import { Utilities } from '@precisionmetrics/cornerstone-tools'
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
  'Multi Volume CanvasToWorld',
  'Uses the canvasToWorld API to find the intensity value of each volume on mouse hover'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

const mousePosDiv = document.createElement('div')

const canvasPosElement = document.createElement('p')
const worldPosElement = document.createElement('p')
const ctValueElement = document.createElement('p')
const ptValueElement = document.createElement('p')

canvasPosElement.innerText = 'canvas:'
worldPosElement.innerText = 'world:'
ctValueElement.innerText = 'CT value:'
ptValueElement.innerText = 'PT value:'

content.appendChild(mousePosDiv)

mousePosDiv.appendChild(canvasPosElement)
mousePosDiv.appendChild(worldPosElement)
mousePosDiv.appendChild(ctValueElement)
mousePosDiv.appendChild(ptValueElement)
// ============================= //

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

  // Set the volume to load
  ctVolume.load()

  // Define a volume in memory
  const ptVolume = await createAndCacheVolume(ptVolumeUID, {
    imageIds: ptImageIds,
  })

  // Set the volume to load
  ptVolume.load()

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeUID: ctVolumeUID },
    { volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction },
  ])

  // Render the image
  renderingEngine.render()

  function getValue(volume, worldPos) {
    const { dimensions, scalarData, imageData } = volume

    const index = imageData.worldToIndex(worldPos)

    index[0] = Math.floor(index[0])
    index[1] = Math.floor(index[1])
    index[2] = Math.floor(index[2])

    if (!Utilities.vtkjs.indexWithinDimensions(index, dimensions)) {
      return
    }

    const yMultiple = dimensions[0]
    const zMultiple = dimensions[0] * dimensions[1]

    const value = scalarData[index[2] * zMultiple + index[1] * yMultiple + index[0]]

    return value
  }

  element.addEventListener('mousemove', (evt) => {
    var rect = element.getBoundingClientRect()

    const canvasPos = [Math.floor(evt.clientX - rect.left), Math.floor(evt.clientY - rect.top)]
    // Convert canvas coordiantes to world coordinates
    const worldPos = viewport.canvasToWorld(canvasPos)

    canvasPosElement.innerText = `canvas: (${canvasPos[0]}, ${canvasPos[1]})`
    worldPosElement.innerText = `world: (${worldPos[0].toFixed(2)}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(
      2
    )})`
    ctValueElement.innerText = `CT value: ${getValue(ctVolume, worldPos)}`
    ptValueElement.innerText = `PT value: ${getValue(ptVolume, worldPos)}`
  })
}

run()
