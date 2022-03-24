import vtkConstants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'
import {
  RenderingEngine,
  volumeLoader,
  Enums,
  setVolumesForViewports,
  Types,
  utilities,
  CONSTANTS,
} from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@cornerstonejs/tools'
// Auto registers volume loader
import '@cornerstonejs/streaming-image-volume-loader' // Registers volume loader
const { BlendMode } = vtkConstants

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS

const {
  ToolGroupManager,
  VolumeRotateMouseWheelTool,
  MIPJumpToClickTool,
  Enums: csToolsEnums,
} = cornerstoneTools

const { MouseBindings } = csToolsEnums
// Define a unique id for each volume
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
const ctVolumeUID = `${volumeLoaderProtocolName}:${ctVolumeName}` // VolumeUID with loader id + volume id
const ptVolumeName = 'PT_VOLUME_UID'
const ptVolumeUID = `${volumeLoaderProtocolName}:${ptVolumeName}`

function setPetTransferFunction({ volumeActor }) {
  const rgbTransferFunction = volumeActor
    .getProperty()
    .getRGBTransferFunction(0)

  rgbTransferFunction.setRange(0, 5)

  utilities.invertRgbTransferFunction(rgbTransferFunction)
}

// ======== Set up page ======== //
setTitleAndDescription(
  'MIP Jump To Click',
  'Here we demonstrate the MIPJumpToClickTool.'
)

const size = '500px'
const content = document.getElementById('content')
const viewportGrid = document.createElement('div')

viewportGrid.style.display = 'flex'
viewportGrid.style.display = 'flex'
viewportGrid.style.flexDirection = 'row'

const element1 = document.createElement('div')
const element2 = document.createElement('div')
const element3 = document.createElement('div')
element1.style.width = size
element1.style.height = size
element2.style.width = size
element2.style.height = size
element3.style.width = size
element3.style.height = size

viewportGrid.appendChild(element1)
viewportGrid.appendChild(element2)
viewportGrid.appendChild(element3)

content.appendChild(viewportGrid)

const instructions = document.createElement('p')
instructions.innerText =
  'Left Click on the MIP to jump the other viewports.\n Use the mouse wheel to rotate the MIP.'

content.append(instructions)
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  const mipToolGroupUID = 'MIP_TOOL_GROUP_UID'

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(VolumeRotateMouseWheelTool)
  cornerstoneTools.addTool(MIPJumpToClickTool)

  const mipToolGroup = ToolGroupManager.createToolGroup(mipToolGroupUID)

  mipToolGroup.addTool('VolumeRotateMouseWheel')
  mipToolGroup.addTool('MIPJumpToClickTool')

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  mipToolGroup.setToolActive('MIPJumpToClickTool', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  })
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  mipToolGroup.setToolActive('VolumeRotateMouseWheel')

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
  const renderingEngineId = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineId)

  // Create the viewports
  const viewportUIDs = [
    'CT_AXIAL_STACK',
    'CT_SAGITTAL_STACK',
    'CT_OBLIQUE_STACK',
  ]

  const viewportInputArray = [
    {
      viewportId: viewportUIDs[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportUIDs[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportUIDs[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInputArray)

  // Set the tool group on the viewports
  mipToolGroup.addViewport(viewportUIDs[2], renderingEngineId)

  // Define volumes in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeUID, {
    imageIds: ptImageIds,
  })
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeUID, {
    imageIds: ctImageIds,
  })

  // Set the volume to load
  ctVolume.load()
  ptVolume.load()

  // Calculate size of fullBody pet mip
  const ptVolumeDimensions = ptVolume.dimensions

  // Only make the MIP as large as it needs to be.
  const slabThickness = Math.sqrt(
    ptVolumeDimensions[0] * ptVolumeDimensions[0] +
      ptVolumeDimensions[1] * ptVolumeDimensions[1] +
      ptVolumeDimensions[2] * ptVolumeDimensions[2]
  )

  setVolumesForViewports(
    renderingEngine,
    [{ volumeUID: ctVolumeUID }],
    [viewportUIDs[0]]
  )
  setVolumesForViewports(
    renderingEngine,
    [{ volumeUID: ptVolumeUID, callback: setPetTransferFunction }],
    [viewportUIDs[1]]
  )

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeUID: ptVolumeUID,
        callback: setPetTransferFunction,
        blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND,
        slabThickness,
      },
    ],
    [viewportUIDs[2]]
  )

  // Render the image
  renderingEngine.render()
}

run()
