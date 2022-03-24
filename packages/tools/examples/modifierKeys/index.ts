import { RenderingEngine, Types, Enums } from '@cornerstonejs/core'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@cornerstonejs/tools'

const {
  WindowLevelTool,
  LengthTool,
  RectangleRoiTool,
  BidirectionalTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools

const { ViewportType } = Enums
const { MouseBindings, KeyboardBindings } = csToolsEnums

// ======== Set up page ======== //
setTitleAndDescription(
  'Tools on Modifier Keys',
  'Here we demonstrate how we add modifier keys to tools'
)

const content = document.getElementById('content')
const element = document.createElement('div')

element.tabIndex = -1

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault()

element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

const instructions = document.createElement('p')
instructions.innerText = 'Left Click to use selected tool TODO'

content.append(instructions)
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_UID'

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool)
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(RectangleRoiTool)
  cornerstoneTools.addTool(BidirectionalTool)

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId)

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName)
  toolGroup.addTool(LengthTool.toolName)
  toolGroup.addTool(RectangleRoiTool.toolName)
  toolGroup.addTool(BidirectionalTool.toolName)

  // TODO Why doesn't this work?

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  })
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift + Left Click
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  })
  toolGroup.setToolActive(RectangleRoiTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Ctrl + Left Click
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  })
  toolGroup.setToolActive(BidirectionalTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Alt/Meta + Left Click
        modifierKey: KeyboardBindings.Alt,
      },
    ],
  })

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'STACK',
  })

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineId)

  // Create a stack viewport
  const viewportId = 'CT_STACK'
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId)

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId)

  // Define a stack containing a single image
  const stack = [imageIds[0]]

  // Set the stack on the viewport
  viewport.setStack(stack)

  // Render the image
  renderingEngine.render()
}

run()
