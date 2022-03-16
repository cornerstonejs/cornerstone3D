import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  getRenderingEngine,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@precisionmetrics/cornerstone-tools'

const {
  LengthTool,
  BidirectionalTool,
  ToolGroupManager,
  ToolBindings,
  annotationLocking,
  annotationSelection,
  getDefaultAnnotationManager,
} = cornerstoneTools

const defaultFrameOfReferenceSpecificAnnotationManager =
  getDefaultAnnotationManager()

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Selection And Locking',
  'Here we demonstrate selection and locking of annotations'
)

const content = document.getElementById('content')
const element = document.createElement('div')

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault()

element.id = 'cornerstone-element'
element.style.width = '500px'
element.style.height = '500px'

content.appendChild(element)

const instructions = document.createElement('p')
instructions.innerText = `
The annotations are set in passive mode, meaning they can be edited when they are not locked.
Use the buttons to lock/select the annotations.
`

content.append(instructions)
// ============================= //

const renderingEngineUID = 'myRenderingEngine'
const toolGroupUID = 'STACK_TOOL_GROUP_UID'

// Some annotations to demonstrate the demo
const annotationsJSON =
  '{"1.3.6.1.4.1.14519.5.2.1.7009.2403.490913010608778852675014095313":{"Length":[{"invalidated":false,"annotationUID":"0f5b6cda-251f-4be1-8026-a281a42808fc","metadata":{"viewPlaneNormal":[0,0,-1],"viewUp":[0,-1,0],"FrameOfReferenceUID":"1.3.6.1.4.1.14519.5.2.1.7009.2403.490913010608778852675014095313","referencedImageId":"https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463/series/1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561/instances/1.3.6.1.4.1.14519.5.2.1.7009.2403.198373903732820400102871457633/frames/1","label":"","toolName":"Length"},"data":{"handles":{"points":[[103.19786834716797,40.757591247558594,45.29999923706055],[159.18826293945312,-74.51676177978516,45.29999923706055]],"activeHandleIndex":null,"textBox":{"hasMoved":false,"worldPosition":[159.18826293945312,-16.87958526611328,45.29999923706055],"worldBoundingBox":{"topLeft":[186.63453674316406,10.566689491271973,45.29999923706055],"topRight":[291.5822448730469,10.566689491271973,45.29999923706055],"bottomLeft":[186.63453674316406,55.57857894897461,45.29999923706055],"bottomRight":[291.5822448730469,55.57857894897461,45.29999923706055]}}},"cachedStats":{"stackTarget:CT_STACK":{"length":128.15264629523836}},"active":false}}],"Bidirectional":[{"annotationUID":"5a4a2e27-6570-487e-a602-7b83dd709475","metadata":{"viewPlaneNormal":[0,0,-1],"viewUp":[0,-1,0],"FrameOfReferenceUID":"1.3.6.1.4.1.14519.5.2.1.7009.2403.490913010608778852675014095313","toolName":"Bidirectional","label":"","referencedImageId":"https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463/series/1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561/instances/1.3.6.1.4.1.14519.5.2.1.7009.2403.198373903732820400102871457633/frames/1"},"data":{"invalidated":false,"handles":{"points":[[-178.94984436035156,47.344696044921875,45.29999923706055],[-114.1766357421875,-92.08238220214844,45.29999923706055],[-100.0875473022461,-0.7777735590934753,45.29999923706055],[-193.03892517089844,-43.95991134643555,45.29999923706055]],"textBox":{"hasMoved":false,"worldPosition":[-114.1766357421875,-22.36884307861328,45.29999923706055],"worldBoundingBox":{"topLeft":[-86.73036193847656,5.077432155609131,45.29999923706055],"topRight":[40.7232780456543,5.077432155609131,45.29999923706055],"bottomLeft":[-86.73036193847656,68.5332260131836,45.29999923706055],"bottomRight":[40.7232780456543,68.5332260131836,45.29999923706055]}},"activeHandleIndex":null},"cachedStats":{"stackTarget:CT_STACK":{"length":153.7383449345246,"width":102.49222249305548}},"active":false}}]}}'
const lengthAnnotationUID = 'lengthAnnotationUID.1.2.3.4.5'
const bidirectionalAnnotationUID = 'bidirectionalAnnotationUID.1.2.3.4.5'

addToggleButtonToToolbar(
  'Toggle lock bidirectional annotation',
  (evt, toggle) => {
    const annotation =
      defaultFrameOfReferenceSpecificAnnotationManager.getAnnotation(
        bidirectionalAnnotationUID
      )

    annotationLocking.setAnnotationLocked(annotation, toggle)
  }
)

addButtonToToolbar('Select Length Annotation', () => {
  const annotation =
    defaultFrameOfReferenceSpecificAnnotationManager.getAnnotation(
      lengthAnnotationUID
    )

  annotationSelection.setAnnotationSelected(annotation, true)

  // Render the image to see it was selected
  const renderingEngine = getRenderingEngine(renderingEngineUID)

  renderingEngine.render()
})

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo()

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(BidirectionalTool)

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupUID)

  // Add the tools to the tool group
  toolGroup.addTool('Length', {})
  toolGroup.addTool('Bidirectional', {})

  // Set both tools passive to we can edit annotations
  toolGroup.setToolActive('Length', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Left Click
      },
    ],
  })
  toolGroup.setToolPassive('Bidirectional')

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
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create a stack viewport
  const viewportUID = 'CT_STACK'
  const viewportInput = {
    viewportUID,
    type: VIEWPORT_TYPE.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  }

  renderingEngine.enableElement(viewportInput)

  // Set the tool group on the viewport
  toolGroup.addViewports(renderingEngineUID, viewportUID)

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportUID)
  )

  // Define a stack containing a single image
  const stack = [imageIds[0]]

  // Set the stack on the viewport
  viewport.setStack(stack)

  // Add some mock annotations

  const annotationsToLoad = JSON.parse(annotationsJSON)

  const FrameOfReferenceUID = Object.keys(annotationsToLoad)[0]

  annotationsToLoad[FrameOfReferenceUID].Length[0].annotationUID =
    lengthAnnotationUID
  annotationsToLoad[FrameOfReferenceUID].Bidirectional[0].annotationUID =
    bidirectionalAnnotationUID

  defaultFrameOfReferenceSpecificAnnotationManager.restoreAnnotations(
    annotationsToLoad
  )

  // Render the image
  renderingEngine.render()
}

run()
