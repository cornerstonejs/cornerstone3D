import { RenderingEngine, Types, VIEWPORT_TYPE } from '@precisionmetrics/cornerstone-render'
import { initDemo, createImageIdsAndCacheMetaData, setTitleAndDescription } from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@precisionmetrics/cornerstone-tools'

const { WindowLevelTool, LengthTool, RectangleRoiTool, BidirectionalTool, ToolGroupManager, ToolBindings } =
  cornerstoneTools

// ======== Set up page ======== //
setTitleAndDescription('Tools on Modifier Keys', 'Here we demonstrate how we add modifier keys to tools')

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

const toolGroupUID = 'STACK_TOOL_GROUP_UID'

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool, {})
  cornerstoneTools.addTool(LengthTool, {})
  cornerstoneTools.addTool(RectangleRoiTool, {})
  cornerstoneTools.addTool(BidirectionalTool, {})

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupUID)

  // Add the tools to the tool group
  toolGroup.addTool('WindowLevel', {})
  toolGroup.addTool('Length', {})
  toolGroup.addTool('RectangleRoi', {})
  toolGroup.addTool('Bidirectional', {})

  // TODO Why doesn't this work?

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive('WindowLevel', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Left Click
      },
    ],
  })
  toolGroup.setToolActive('Length', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Shift + Left Click
        modifierKey: ToolBindings.Keyboard.Shift,
      },
    ],
  })
  toolGroup.setToolActive('RectangleRoi', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Ctrl + Left Click
        modifierKey: ToolBindings.Keyboard.Ctrl,
      },
    ],
  })
  toolGroup.setToolActive('Bidirectional', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Alt/Meta + Left Click
        modifierKey: ToolBindings.Keyboard.Alt,
      },
    ],
  })

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID: '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'STACK',
  })

  // Instantiate a rendering engine
  const renderingEngineUID = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create a stack viewport
  const viewportUID = 'CT_STACK'
  const viewportInput = {
    viewportUID,
    type: VIEWPORT_TYPE.STACK,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Set the tool goup on the viewport
  toolGroup.addViewports(renderingEngineUID, viewportUID)

  // Get the stack viewport that was created
  const viewport = <Types.StackViewport>renderingEngine.getViewport(viewportUID)

  // Define a stack containing a single image
  const stack = [imageIds[0]]

  // Set the stack on the viewport
  viewport.setStack(stack)

  // Render the image
  renderingEngine.render()
}

run()
