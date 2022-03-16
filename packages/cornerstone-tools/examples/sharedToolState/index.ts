import {
  RenderingEngine,
  Types,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
} from '@precisionmetrics/cornerstone-render'
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers'
import * as cornerstoneTools from '@precisionmetrics/cornerstone-tools'
// Auto registers volume loader
import '@precisionmetrics/cornerstone-image-loader-streaming-volume' // Registers volume loader

const {
  LengthTool,
  ToolGroupManager,
  StackScrollMouseWheelTool,
  ToolBindings,
} = cornerstoneTools
// Define a unique id for the volume
const volumeName = 'CT_VOLUME_UID' // Id of the volume less loader prefix
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume' // Loader id which defines which volume loader to use
const volumeUID = `${volumeLoaderProtocolName}:${volumeName}` // VolumeUID with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Shared Annotations Between Stack and Volume Viewports',
  'Here we demonstrate that annotations are stored on frame of reference, this annotations drawn on volume viewports can be displayed on stack viewports displaying the same data and vice versa.'
)

const size = '500px'
const content = document.getElementById('content')
const viewportGrid = document.createElement('div')

viewportGrid.style.display = 'flex'
viewportGrid.style.display = 'flex'
viewportGrid.style.flexDirection = 'row'

const element1 = document.createElement('div')
const element2 = document.createElement('div')
element1.style.width = size
element1.style.height = size
element2.style.width = size
element2.style.height = size

viewportGrid.appendChild(element1)
viewportGrid.appendChild(element2)

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

  const toolGroupUID = 'STACK_TOOL_GROUP_UID'

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool)
  cornerstoneTools.addTool(StackScrollMouseWheelTool)

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupUID)

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool('Length', { configuration: { volumeUID } })
  toolGroup.addTool('StackScrollMouseWheel')

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive('Length', {
    bindings: [
      {
        mouseButton: ToolBindings.Mouse.Primary, // Left Click
      },
    ],
  })
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive('StackScrollMouseWheel')

  // Get Cornerstone imageIds and fetch metadata into RAM
  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'VOLUME',
  })

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
    type: 'STACK',
  })

  const smallVolumeImageIds = [volumeImageIds[42], volumeImageIds[43]] // Small bit of the body
  const smallStackImageIds = [stackImageIds[42], stackImageIds[43]] // Small bit of the body

  // Instantiate a rendering engine
  const renderingEngineUID = 'myRenderingEngine'
  const renderingEngine = new RenderingEngine(renderingEngineUID)

  // Create the viewports
  const viewportUIDs = ['CT_AXIAL_VOLUME', 'CT_AXIAL_STACK']

  const viewportInputArray = [
    {
      viewportUID: viewportUIDs[0],
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportUID: viewportUIDs[1],
      type: VIEWPORT_TYPE.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ]

  renderingEngine.setViewports(viewportInputArray)

  // Set the tool goup on the viewports
  viewportUIDs.forEach((viewportUID) =>
    toolGroup.addViewports(renderingEngineUID, viewportUID)
  )

  // Define a volume in memory
  const volume = await createAndCacheVolume(volumeUID, {
    imageIds: smallVolumeImageIds,
  })

  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportUIDs[0])
  )
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportUIDs[1])
  )

  // Set the stack on the stackViewport
  stackViewport.setStack(smallStackImageIds)

  // Set the volume to load
  volume.load()

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeUID }])

  // Render the image
  renderingEngine.render()

  // element2.addEventListener(RenderingEngineEvents.STACK_NEW_IMAGE, (evt) => {
  //   const imageId = evt.detail.imageId

  //   const imageIdIndex = stackImageIds.findIndex((imgId) => imgId === imageId)

  //   console.log(imageIdIndex)
  // })
}

run()
