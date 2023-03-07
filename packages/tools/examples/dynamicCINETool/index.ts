// import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
// import {
//   RenderingEngine,
//   Types,
//   Enums,
//   volumeLoader,
//   utilities as csUtils,
// } from '@cornerstonejs/core';
// import {
//   initDemo,
//   createImageIdsAndCacheMetaData,
//   setPetTransferFunctionForVolumeActor,
//   setTitleAndDescription,
//   addButtonToToolbar,
//   addSliderToToolbar,
// } from '../../../../utils/demo/helpers';
// import * as cornerstoneTools from '@cornerstonejs/tools';

// // This is for debugging purposes
// console.warn(
//   'Click on index.ts to open source code for this example --------->'
// );

// const {
//   WindowLevelTool,
//   PanTool,
//   ZoomTool,
//   ToolGroupManager,
//   Enums: csToolsEnums,
//   utilities: csToolsUtilities,
// } = cornerstoneTools;

// const { ViewportType } = Enums;
// const { MouseBindings } = csToolsEnums;

// // ======== Set up page ======== //
// setTitleAndDescription('CINE Tool', 'Show the usage of the CINE Tool.');

// const content = document.getElementById('content');
// const element = document.createElement('div');

// // Disable right click context menu so we can have right click tools
// element.oncontextmenu = (e) => e.preventDefault();

// element.id = 'cornerstone-element';
// element.style.width = '500px';
// element.style.height = '500px';

// content.appendChild(element);

// const instructions = document.createElement('p');
// instructions.innerText = `
//   - Click on Play Clip to start the CINE tool
//   - Click on Stop Clip to stop the CINE tool
//   - Drag the frame slider to change the frames per second rate
//   - Note: as the slices are loading one by one, the first couple of loops will be slower than the rest
// `;

// content.append(instructions);
// // ============================= //

// const toolGroupId = 'STACK_TOOL_GROUP_ID';
// let framesPerSecond = 1; // 24;

// addButtonToToolbar({
//   title: 'Play Clip',
//   onClick: () => {
//     csToolsUtilities.cine.playClip(element, { framesPerSecond });
//   },
// });

// addButtonToToolbar({
//   title: 'Stop Clip',
//   onClick: () => {
//     csToolsUtilities.cine.stopClip(element);
//   },
// });

// addSliderToToolbar({
//   title: `Frame per second`,
//   range: [1, 100],
//   defaultValue: framesPerSecond,
//   onSelectedValueChange: (value) => {
//     csToolsUtilities.cine.stopClip(element);
//     framesPerSecond = Number(value);
//     csToolsUtilities.cine.playClip(element, { framesPerSecond });
//   },
//   updateLabelOnChange: (value, label) => {
//     label.innerText = `Frames per second: ${value}`;
//   },
// });
// /**
//  * Runs the demo
//  */
// async function run() {
//   const { metaDataManager } = cornerstoneWADOImageLoader.wadors;

//   // Init Cornerstone and related libraries
//   await initDemo();

//   // Add tools to Cornerstone3D
//   cornerstoneTools.addTool(WindowLevelTool);
//   cornerstoneTools.addTool(PanTool);
//   cornerstoneTools.addTool(ZoomTool);

//   // Define a tool group, which defines how mouse events map to tool commands for
//   // Any viewport using the group
//   const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

//   // Add the tools to the tool group
//   toolGroup.addTool(WindowLevelTool.toolName);
//   toolGroup.addTool(PanTool.toolName);
//   toolGroup.addTool(ZoomTool.toolName);

//   // Set the initial state of the tools, here we set one tool active on left click.
//   // This means left click will draw that tool.
//   toolGroup.setToolActive(WindowLevelTool.toolName, {
//     bindings: [
//       {
//         mouseButton: MouseBindings.Primary, // Left Click
//       },
//     ],
//   });

//   toolGroup.setToolActive(PanTool.toolName, {
//     bindings: [
//       {
//         mouseButton: MouseBindings.Auxiliary,
//       },
//     ],
//   });

//   toolGroup.setToolActive(ZoomTool.toolName, {
//     bindings: [
//       {
//         mouseButton: MouseBindings.Secondary,
//       },
//     ],
//   });

// // ====================================================[ 3D VOLUME ]====================================================

// //   // Get Cornerstone imageIds and fetch metadata into RAM
// //   const imageIds = await createImageIdsAndCacheMetaData({
// //     StudyInstanceUID:
// //       '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
// //     SeriesInstanceUID:
// //       '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
// //     wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
// //   });

// //   // Instantiate a rendering engine
// //   const renderingEngineId = 'myRenderingEngine';
// //   const renderingEngine = new RenderingEngine(renderingEngineId);

// //   // Create a stack viewport
// //   const viewportId = 'CT_STACK';
// //   const viewportInput = {
// //     viewportId,
// //     type: ViewportType.ORTHOGRAPHIC, // ViewportType.STACK
// //     element,
// //     defaultOptions: {
// //       orientation: Enums.OrientationAxis.ACQUISITION,
// //       background: <Types.Point3>[0.2, 0, 0.2],
// //     },
// //   };

// //   renderingEngine.enableElement(viewportInput);

// //   // // Set the tool group on the viewport
// //   // toolGroup.addViewport(viewportId, renderingEngineId);

// //   // Get the volume viewport that was created
// //   const viewport = <Types.IVolumeViewport>(
// //     renderingEngine.getViewport(viewportId)
// //   );

// //   const volumeName = 'CT_VOLUME'; // Id of the volume less loader prefix
// //   const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
// //   const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// //   // Define a volume in memory
// //   const volume = await volumeLoader.createAndCacheVolume(volumeId, {
// //     imageIds,
// //   });

// //   // Set the volume to load
// //   volume.load();

// //   // Set the volume on the viewport
// //   viewport.setVolumes([
// //     { volumeId, /* callback: setPetTransferFunctionForVolumeActor */ },
// //   ]);

// //   window.viewport = viewport;
// //   window.volume = volume;

// //   // Set the stack on the viewport
// //   // viewport.setStack(imageIds);

// //   // Render the image
// //   viewport.render();
// // }

// // run();

// // ====================================================[ 4D VOLUME ]====================================================

//   let imageIds = await createImageIdsAndCacheMetaData({
//     StudyInstanceUID:
//       '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
//     SeriesInstanceUID:
//       '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
//     wadoRsRoot: 'https://d28o5kq0jsoob5.cloudfront.net/dicomweb',
//   });

//   imageIds = imageIds.filter((imageId) => {
//     const instanceMetaData = metaDataManager.get(imageId);
//     const instanceTag = instanceMetaData['00200013'];
//     const instanceNumber = parseInt(instanceTag.Value[0]);

//     return instanceNumber >= 5876; // 15 TPs
//     // return instanceNumber >= 7051; // 10 TPs
//     // return instanceNumber >= 8226; // 5 TPs
//     // return instanceNumber >= 8696; // 3 TPs
//   });

//   console.log(`A total of ${imageIds.length} images will be loaded`);

//   // Instantiate a rendering engine
//   const renderingEngineId = 'myRenderingEngine';
//   const renderingEngine = new RenderingEngine(renderingEngineId);

//   // Create a stack viewport
//   const viewportId = 'PT_4D_VOLUME';
//   const viewportInput = {
//     viewportId,
//     type: ViewportType.ORTHOGRAPHIC, // ViewportType.STACK
//     element,
//     defaultOptions: {
//       orientation: Enums.OrientationAxis.ACQUISITION,
//       background: <Types.Point3>[0.2, 0, 0.2],
//     },
//   };

//   renderingEngine.enableElement(viewportInput);

//   // // Set the tool group on the viewport
//   // toolGroup.addViewport(viewportId, renderingEngineId);

//   // Get the volume viewport that was created
//   const viewport = <Types.IVolumeViewport>(
//     renderingEngine.getViewport(viewportId)
//   );

//   const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
//   const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
//   const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

//   // Define a volume in memory
//   const volume = await volumeLoader.createAndCacheVolume(volumeId, {
//     imageIds,
//   });

//   // Set the volume to load
//   volume.load();

//   // Set the volume on the viewport
//   viewport.setVolumes([
//     { volumeId, callback: setPetTransferFunctionForVolumeActor },
//   ]);

//   window.viewport = viewport;
//   window.volume = volume;

//   // Render the image
//   viewport.render();
// }

// run();

import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import {
  RenderingEngine,
  Types,
  Enums,
  utilities as csUtils,
  volumeLoader,
  setVolumesForViewports,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addSliderToToolbar,
  setPetTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  utilities: csToolsUtilities,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// ======== Set up page ======== //
setTitleAndDescription(
  'CINE Tool - 4D Volumes',
  'Show the usage of the CINE Tool and 4D volumes.'
);

const size = '500px';
const inactiveBorder = 'solid 5px rgba(0, 0, 0, 0)';
const activeBorder = 'solid 5px rgba(255, 0, 0, 1)';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
const numViewports = 4;
const elements = [];
const defaultFramesPerSecond = 24;
let framesPerSecond = defaultFramesPerSecond;
let activeElement = null;

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

for (let i = 0; i < numViewports; i++) {
  const element = document.createElement('div');

  element.id = 'cornerstone-element';
  element.style.width = size;
  element.style.height = size;
  element.style.padding = '1px';
  element.style.marginTop = '5px';
  element.style.border = inactiveBorder;

  elements.push(element);
  viewportGrid.appendChild(element);

  element.addEventListener('click', function () {
    setActiveElement(this);
  });

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  - Click on Play Clip to start the CINE tool
  - Click on Stop Clip to stop the CINE tool
  - Drag the frame slider to change the frames per second rate
  - Note: as the slices are loading one by one, the first couple of loops will be slower than the rest
`;

content.append(instructions);
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

addButtonToToolbar({
  title: 'Play Clip',
  onClick: () => {
    csToolsUtilities.cine.playClip(activeElement, { framesPerSecond });
  },
});

addButtonToToolbar({
  title: 'Stop Clip',
  onClick: () => {
    csToolsUtilities.cine.stopClip(activeElement);
  },
});

addSliderToToolbar({
  id: 'fpsSlider',
  title: ` Frames per second: ${framesPerSecond}`,
  range: [1, 100],
  defaultValue: framesPerSecond,
  onSelectedValueChange: (value) => {
    csToolsUtilities.cine.stopClip(activeElement);
    framesPerSecond = Number(value);
    csToolsUtilities.cine.playClip(activeElement, { framesPerSecond });
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = ` Frames per second: ${value}`;
  },
});

/**
 * Updated active element's style and stores it
 * @param element - Cornerstone element
 */
function setActiveElement(element) {
  if (activeElement) {
    activeElement.style.border = inactiveBorder;
  }

  activeElement = element;
  activeElement.style.border = activeBorder;

  const { framesPerSecond: fps = defaultFramesPerSecond } =
    csToolsUtilities.cine.getToolState(activeElement) ?? {};

  (<HTMLInputElement>document.querySelector('#fpsSlider')).value = fps;

  (<HTMLElement>(
    document.querySelector('#fpsSlider-label')
  )).innerText = ` Frames per second: ${fps}`;
}

/**
 * Runs the demo
 */
async function run() {
  const { metaDataManager } = cornerstoneWADOImageLoader.wadors;

  // Init Cornerstone and related libraries
  await initDemo();

  // Increases cache size to 4GB to be able to store all PET/CT images
  cache.setMaxCacheSize(4 * 1024 * 1024 * 1024);

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
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

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // // Get Cornerstone imageIds and fetch metadata into RAM
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
  //   wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  // });

  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
    SeriesInstanceUID:
      '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
    wadoRsRoot: 'https://d28o5kq0jsoob5.cloudfront.net/dicomweb',
  });

  imageIds = imageIds.filter((imageId) => {
    const instanceMetaData = metaDataManager.get(imageId);
    const instanceTag = instanceMetaData['00200013'];
    const instanceNumber = parseInt(instanceTag.Value[0]);

    // return instanceNumber >= 5876; // 15 TPs
    // return instanceNumber >= 7051; // 10 TPs
    // return instanceNumber >= 8226; // 5 TPs
    // return instanceNumber >= 8696; // 3 TPs
    return instanceNumber >= 8931; // 2 TPs
    // return instanceNumber >= 9166; // 1 TPs
  });

  console.log(`A total of ${imageIds.length} images will be loaded`);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportIds = [
    'PT_AXIAL_VOLUME',
    'PT_CORONAL_VOLUME',
    'PT_SAGITTAL_VOLUME',
    'PT_OBLIQUE_VOLUME',
  ];

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[0],
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[2],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[3],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[3],
      defaultOptions: {
        orientation: {
          // Random oblique orientation
          viewUp: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
          viewPlaneNormal: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
        },
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // =============================[ Single Volume ]=============================

  // // Define a unique id for the volume
  // const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
  // const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
  // const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // // Define a volume in memory
  // const volume = await volumeLoader.createAndCacheVolume(volumeId, {
  //   imageIds,
  // });

  // // Load PT volume
  // volume.load();

  // // Set volumes on the viewports
  // setVolumesForViewports(
  //   renderingEngine,
  //   [{ volumeId, callback: setPetTransferFunctionForVolumeActor }],
  //   viewportIds
  // );

  // ============================[ Multiple Volumes ]===========================

  for (let i = 0, len = viewportInputArray.length; i < len; i++) {
    const viewportInput = viewportInputArray[i];
    const { viewportId } = viewportInput;

    // Define a unique id for the volume
    const volumeName = `PT_VOLUME_ID_${i}`; // Id of the volume less loader prefix
    const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
    const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
    console.log('>>>>> volumeId :: ', volumeId);

    // Define a volume in memory
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Load PT volume
    volume.load();

    setVolumesForViewports(
      renderingEngine,
      [{ volumeId, callback: setPetTransferFunctionForVolumeActor }],
      [viewportId]
    );
  }

  // Render the image
  renderingEngine.renderViewports(viewportIds);

  // Set the first viewport as active
  setActiveElement(elements[0]);
}

run();
