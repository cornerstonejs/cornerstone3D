import {
  RenderingEngine,
  Types,
  Enums,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@precisionmetrics/cornerstone-tools'

const {
  LengthTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  ToolBindings,
} = cornerstoneTools

const { ViewportType } = Enums

// ======== Set up page ======== //
setTitleAndDescription(
  'Multiple Tool Groups',
  'Here we show the usage of multiple tool groups at the same time'
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
  'Left Click: Window/Level\nMiddle Click: Pan\nRight Click: Zoom\n Mouse Wheel: Stack Scroll'

content.append(instructions)
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  const toolGroupUID1 = 'STACK_TOOL_GROUP_UID_1'
  const toolGroupUID2 = 'STACK_TOOL_GROUP_UID_2'

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool)
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(StackScrollMouseWheelTool)

  // Define tool group 1, used by viewport 1
  const toolGroup1 = ToolGroupManager.createToolGroup(toolGroupUID1)

  // Add tools to the tool group
  toolGroup1.addTool(WindowLevelTool.toolName)
  toolGroup1.addTool(StackScrollMouseWheelTool.toolName)

  // Set the initial state of the tools
  toolGroup1.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Left Click
      },
    ],
  })
  toolGroup1.setToolActive(StackScrollMouseWheelTool.toolName)

  // Define tool group 2, used by viewport 2
  const toolGroup2 = ToolGroupManager.createToolGroup(toolGroupUID2)

  // Add tools to the tool group
  toolGroup2.addTool(LengthTool.toolName)
  toolGroup2.addTool(StackScrollMouseWheelTool.toolName)

  // Set the initial state of the tools
  toolGroup2.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Left Click
      },
    ],
  })
  toolGroup2.setToolActive(StackScrollMouseWheelTool.toolName)

  const wadoRsRoot = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs'
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463'

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
    type: 'STACK',
  })

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
    type: 'STACK',
  })

  // Instantiate a rendering engine
  const renderingEngineUID = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  const viewportUIDs = [
    'CT_AXIAL_STACK_1',
    'CT_AXIAL_STACK_2',
    'PT_AXIAL_STACK',
  ]

  // Create a stack viewport
  const viewportInputArray = [
    {
      viewportUID: viewportUIDs[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportUID: viewportUIDs[1],
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportUID: viewportUIDs[2],
      type: ViewportType.STACK,
      element: element3,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInputArray)

  // Get the stack viewport that was created
  const viewport1 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportUIDs[0])
  )
  const viewport2 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportUIDs[1])
  )
  const viewport3 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportUIDs[2])
  )

  // Define a stack containing a single image
  const ctStack = [ctImageIds[0], ctImageIds[1], ctImageIds[2]]
  const ptStack = [ptImageIds[0], ptImageIds[1], ptImageIds[2]]

  // Set the stack on the viewports
  viewport1.setStack(ctStack)
  viewport2.setStack(ctStack)
  viewport3.setStack(ptStack)

  // Set viewport 1 to toolgroup 1
  toolGroup1.addViewport(viewportUIDs[0], renderingEngineUID)
  // Set viewport 2 and 3 to toolgroup 2
  toolGroup2.addViewport(viewportUIDs[1], renderingEngineUID)
  toolGroup2.addViewport(viewportUIDs[2], renderingEngineUID)

  // Render the image
  renderingEngine.render()
}

run()
