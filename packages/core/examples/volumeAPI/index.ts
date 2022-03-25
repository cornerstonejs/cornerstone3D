import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
  utilities,
  CONSTANTS,
} from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers'
import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'

const { ViewportType } = Enums
const { BlendMode } = vtkConstants
const { ORIENTATION } = CONSTANTS

const renderingEngineId = 'myRenderingEngine'
const viewportId = 'CT_SAGITTAL_STACK'

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID' // Id of the volume less loader prefix
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderProtocolName}:${volumeName}` // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Viewport API',
  'Demonstrates how to interact with a Volume viewport.'
)

const content = document.getElementById('content')
const element = document.createElement('div')
element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)
// ============================= //

// TODO -> Maybe some of these implementations should be pushed down to some API

// Buttons
addButtonToToolbar('Set VOI Range', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Get the volume actor from the viewport
  const actor = viewport.getActor(volumeId)

  // Set the mapping range of the actor to a range to highlight bones
  actor.volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setMappingRange(-1500, 2500)

  viewport.render()
})
addButtonToToolbar('Flip H', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Flip the viewport horizontally
  const { flipHorizontal } = viewport.getProperties()

  viewport.flip({ flipHorizontal: !flipHorizontal })

  viewport.render()
})

addButtonToToolbar('Flip V', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Flip the viewport vertically
  const { flipVertical } = viewport.getProperties()

  viewport.flip({ flipVertical: !flipVertical })

  viewport.render()
})

addButtonToToolbar('Invert', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Get the volume actor from the viewport
  const actor = viewport.getActor(volumeId)

  const rgbTransferFunction = actor.volumeActor
    .getProperty()
    .getRGBTransferFunction(0)

  utilities.invertRgbTransferFunction(rgbTransferFunction)

  viewport.render()
})

addButtonToToolbar('Apply Random Zoom And Pan', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the stack viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
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
  const renderingEngine = getRenderingEngine(renderingEngineId)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  )

  // Resets the viewport's camera
  viewport.resetCamera()
  // TODO reset the viewport properties, we don't have API for this.

  viewport.render()
})

// TOOD -> Oblique
const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
  oblique: 'oblique',
}

addDropdownToToolbar(
  {
    options: ['axial', 'sagittal', 'coronal', 'oblique'],
    defaultOption: 'sagittal',
  },
  (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId)

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    )

    // TODO -> Maybe we should rename sliceNormal to viewPlaneNormal everywhere?
    let viewUp
    let viewPlaneNormal

    switch (selectedValue) {
      case orientationOptions.axial:
        viewUp = ORIENTATION.AXIAL.viewUp
        viewPlaneNormal = ORIENTATION.AXIAL.sliceNormal

        break
      case orientationOptions.sagittal:
        viewUp = ORIENTATION.SAGITTAL.viewUp
        viewPlaneNormal = ORIENTATION.SAGITTAL.sliceNormal

        break
      case orientationOptions.coronal:
        viewUp = ORIENTATION.CORONAL.viewUp
        viewPlaneNormal = ORIENTATION.CORONAL.sliceNormal

        break
      case orientationOptions.oblique:
        // Some random oblique value for this dataset
        viewUp = [-0.5962687530844388, 0.5453181550345819, -0.5891448751239446]
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ]

        break
      default:
        throw new Error('undefined orientation option')
    }

    // TODO -> Maybe we should have a helper for this on the viewport
    // Set the new orientation
    viewport.setCamera({ viewUp, viewPlaneNormal })
    // Reset the camera after the normal changes
    viewport.resetCamera()
    viewport.render()
  }
)

addSliderToToolbar(
  'Slab Thickness',
  { range: [0, 50], defaultValue: 0 },
  (value) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId)

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    )

    let blendMode = BlendMode.MAXIMUM_INTENSITY_BLEND

    if (value < 0.1) {
      // Cannot render zero thickness
      value = 0.1

      // Not a mip, just show slice
      blendMode = BlendMode.COMPOSITE_BLEND
    }

    // Get the volume actor from the viewport
    const actor = viewport.getActor(volumeId)

    viewport.setSlabThickness(value)

    // TODO -> We should have set blend mode for volume on the viewport?
    actor.volumeActor.getMapper().setBlendMode(blendMode)

    viewport.render()
  }
)

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
  const renderingEngine = new RenderingEngine(renderingEngineId)

  // Create a stack viewport
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
