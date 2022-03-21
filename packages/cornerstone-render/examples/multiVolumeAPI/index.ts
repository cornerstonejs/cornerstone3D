import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  setPetColorMapTransferFunction,
} from '../../../../utils/demo/helpers'
// Auto registers volume loader
import '@precisionmetrics/cornerstone-image-loader-streaming-volume' // Registers volume loader

const { ViewportType, ORIENTATION } = Enums
const renderingEngineUID = 'myRenderingEngine'
const viewportUID = 'CT_SAGITTAL_STACK'

// Define unique ids for the volumes
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
const ctVolumeUID = `${volumeLoaderProtocolName}:${ctVolumeName}` // VolumeUID with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_UID'
const ptVolumeUID = `${volumeLoaderProtocolName}:${ptVolumeName}`

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Viewport API With Multiple Volumes',
  'Demonstrates how to interact with a Volume viewport when using fusion.'
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
addButtonToToolbar('Set CT VOI Range', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  // Get the stack viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Get the volume actor from the viewport
  const actor = viewport.getActor(ctVolumeUID)

  // Set the mapping range of the actor to a range to highlight bones
  actor.volumeActor
    .getProperty()
    .getRGBTransferFunction(0)
    .setMappingRange(-1500, 2500)

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

let fused = false

addButtonToToolbar('toggle PET', () => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUID)
  )
  if (fused) {
    // Removes the PT actor from the scene
    viewport.removeVolumeActors([ptVolumeUID], true)

    fused = false
  } else {
    // Add the PET volume to the viewport. It is in the same DICOM Frame Of Reference/worldspace
    // If it was in a different frame of reference, you would need to register it first.
    viewport.addVolumes(
      [{ volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction }],
      true
    )

    fused = true
  }
})

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
    const renderingEngine = getRenderingEngine(renderingEngineUID)

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportUID)
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

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  const wadoRsRoot = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs'
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463'

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
    type: 'VOLUME',
  })

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
    type: 'VOLUME',
  })

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create a stack viewport
  const viewportInput = {
    viewportUID,
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
    renderingEngine.getViewport(viewportUID)
  )

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeUID, {
    imageIds: ctImageIds,
  })

  // Set the volume to load
  ctVolume.load()

  // Set the volume on the viewport
  viewport.setVolumes([{ volumeUID: ctVolumeUID }])

  // Render the image
  renderingEngine.render()

  // Load the PT in the background as we know we'll need it

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeUID, {
    imageIds: ptImageIds,
  })

  // Set the volume to load
  ptVolume.load()
}

run()
