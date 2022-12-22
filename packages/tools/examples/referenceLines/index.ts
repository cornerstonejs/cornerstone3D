import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ReferenceLinesTool,
  ToolGroupManager,
  StackScrollMouseWheelTool,
  ZoomTool,
  PanTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Reference Lines',
  'Here we demonstrate the usage of reference lines tool. \
   Below, you will see 5 viewports, representing a prostate MRI scan. \
   The viewports contain Stack Viewports in purple backGround, and a volume \
   viewport in red background. By default the first viewport (sagittal) is \
    selected. You can use the dropdown to select the other viewports. \
    '
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid1 = document.createElement('div');
const viewportGrid2 = document.createElement('div');

viewportGrid1.style.display = 'flex';
viewportGrid1.style.flexDirection = 'row';

viewportGrid2.style.flexDirection = 'row';
viewportGrid2.style.display = 'flex';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');
const element5 = document.createElement('div');

const elements = [element1, element2, element3, element4, element5];

element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;
element3.oncontextmenu = () => false;
element4.oncontextmenu = () => false;
element5.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element1.style.border = '5px solid transparent';

element2.style.width = size;
element2.style.height = size;
element2.style.border = '5px solid transparent';

element3.style.width = size;
element3.style.height = size;
element3.style.border = '5px solid transparent';

element4.style.width = size;
element4.style.height = size;
element4.style.border = '5px solid transparent';

element5.style.width = size;
element5.style.height = size;
element5.style.border = '5px solid transparent';

viewportGrid1.appendChild(element1);
viewportGrid1.appendChild(element2);
viewportGrid1.appendChild(element3);
viewportGrid2.appendChild(element4);
viewportGrid2.appendChild(element5);

content.appendChild(viewportGrid1);
content.appendChild(viewportGrid2);

const instructions = document.createElement('p');
instructions.innerText =
  'Left Click to draw length measurements on any viewport.\n Use the mouse wheel to scroll through the stack.';

content.append(instructions);
// ============================= //

// Create the viewports
const viewportIds = [
  'T2 - Sagittal',
  'T2 - Acquisition Plane',
  'T2 - Coronal',
  'ADC - Acquisition Plane',
  'T2 - Oblique',
];
let selectedViewportId = viewportIds[0];
element1.style.border = '5px solid yellow';

let toolGroup;

addDropdownToToolbar({
  options: { values: viewportIds, defaultValue: selectedViewportId },
  onSelectedValueChange: (newSelectedId) => {
    selectedViewportId = newSelectedId as string;

    const index = viewportIds.indexOf(selectedViewportId);
    // make the element border a different color

    // change config of the reference lines tool
    element1.style.border = '5px solid transparent';
    element2.style.border = '5px solid transparent';
    element3.style.border = '5px solid transparent';
    element4.style.border = '5px solid transparent';
    element5.style.border = '5px solid transparent';

    const element = elements[index];
    element.style.border = '5px solid yellow';

    toolGroup.setToolConfiguration(
      ReferenceLinesTool.toolName,
      {
        sourceViewportId: selectedViewportId,
      },
      true // overwrite
    );

    toolGroup.setToolEnabled(ReferenceLinesTool.toolName);
  },
});
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(ReferenceLinesTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(PanTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(ReferenceLinesTool.toolName, {
    sourceViewportId: selectedViewportId,
  });
  toolGroup.addTool(ZoomTool.toolName, { volumeId });
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(PanTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolEnabled(ReferenceLinesTool.toolName);

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });

  // Add the tool group to the viewport

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  // Get Cornerstone imageIds and fetch metadata into RAM
  const t2_tse_sag = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.250911858840767891342974687368',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const t2_tse_tra = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.160028252338004527274326500702',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const t2_tse_cor = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.604184452348902957788528403471',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const adc = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.339319789559896104041345048780',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const t2_tse_tra_vol = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.160028252338004527274326500702',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.STACK,
      element: element3,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[3],
      type: ViewportType.STACK,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[4],
      type: ViewportType.ORTHOGRAPHIC,
      element: element5,
      defaultOptions: {
        background: <Types.Point3>[0.5, 0, 0.2],
        orientation: {
          // Random oblique orientation
          viewUp: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
          viewPlaneNormal: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
        },
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: t2_tse_tra_vol,
  });

  // Set the volume to load
  volume.load();

  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportIds[4]]);

  const stackViewport = renderingEngine.getViewport(
    viewportIds[0]
  ) as Types.IStackViewport;

  stackViewport.setStack(t2_tse_sag, Math.floor(t2_tse_sag.length / 2));

  const stackViewport2 = renderingEngine.getViewport(
    viewportIds[1]
  ) as Types.IStackViewport;

  stackViewport2.setStack(t2_tse_tra, Math.floor(t2_tse_tra.length / 2));

  const stackViewport3 = renderingEngine.getViewport(
    viewportIds[2]
  ) as Types.IStackViewport;

  stackViewport3.setStack(t2_tse_cor, Math.floor(t2_tse_cor.length / 2));

  const stackViewport4 = renderingEngine.getViewport(
    viewportIds[3]
  ) as Types.IStackViewport;

  stackViewport4.setStack(adc, Math.floor(adc.length / 2));

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
