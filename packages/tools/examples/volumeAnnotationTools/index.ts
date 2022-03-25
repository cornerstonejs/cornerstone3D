import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@cornerstonejs/tools'

const {
  LengthTool,
  ToolGroupManager,
  StackScrollMouseWheelTool,
  Enums: csToolsEnums,
} = cornerstoneTools

const { ViewportType } = Enums
const { ORIENTATION } = CONSTANTS
const { MouseBindings } = csToolsEnums

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID' // Id of the volume less loader prefix
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderProtocolName}:${volumeName}` // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools On Volumes',
  'Here we demonstrate how annotation tools can be drawn/rendered on any plane.'
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
  'Left Click to draw length measurements on any viewport.\n Use the mouse wheel to scroll through the stack.'

content.append(instructions)
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  const toolGroupId = 'STACK_TOOL_GROUP_ID'

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(StackScrollMouseWheelTool)

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId)

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(LengthTool.toolName, { configuration: { volumeId } })
  toolGroup.addTool(StackScrollMouseWheelTool.toolName)

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  })
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName)

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

  // Create the viewports
  const viewportIds = [
    'CT_AXIAL_STACK',
    'CT_SAGITTAL_STACK',
    'CT_OBLIQUE_STACK',
  ]

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: {
          // Random oblique orientation
          viewUp: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
          sliceNormal: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
        },
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInputArray)

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  )

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  })

  // Set the volume to load
  volume.load()

  setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds)

  // // Set the volume on the viewport
  // viewport.setVolumes([{ volumeId }])

  // Render the image
  renderingEngine.render()
}

run()
