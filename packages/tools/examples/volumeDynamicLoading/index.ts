// For the low resolution image loader, what is required to do this is to create a new volume with a metadata loader that has a reduced set of images.
// The reduced set should be specified as "skip" distances in i,j,k pixels.
// The skip distance for k will REMOVE frames from the dataset.
// The i distance will remove columns, while the j distance will remove rows.
// Naturally, that affects the sizing/image positioning.

// There should also be an image loader that re-uses an existing loader but decimates OR fetches the data using the jls reduced resolution endpoint.
// The ordering should be:1. See if the reduced resolution version is available in cache -> use it immediately2.
// See if the full resolution version is available in cache -> decimate it and put the reduced resolution version in cache3.
// Fetch the reduced resolution version if configured against the back end4. Fetch the full resolution version and decimate it

// The data that is affected is:

// Frames - either the SOP instances or the frames in a multiframe need to be reduce in count.
// This should occur as an integer fraction such that the spacing is consistent - examples: 1,3,5,7 - distance of two, so start with first image and go up by 2 1,4,7,10 - distance of three - start with first image and go up by 3 OR 2,5,8,11... - starting at 2
// The starting/end are a bit arbitrary, but centering it to minimize the missed distance at both ends is probably worthwhile - that is, starting at 2 for a skip of 3 is better than starting at 1, since that skips 2 images at the end normally. Start with just using 1 always, and then see if we have time to improve that.

// The DICOM values which need to be reduced are:
// Pixel Spacing and related tags, including ultrasound enhanced regions (which you can throw an error on initially) slice thickness image position patient for multiframe only (because it is specified overall for the multiframe, and then can be calculated per-frame) number of frames image orientation patient - if these values include distances between pixels (they might be unitized to length 1)

// The way this should work is to fetch the full resolution data, and then to have a metadata loader for partial resolution data.
// OHIF will need a way to link TWO different volumes into a display set, and to choose between them.
// The CS3D example will just have a pulldown with various options on a 2+3 layout including a 3d volume, a stack, and 3 mprs below it.
// The path to the sub-resolution images can be probably left alone and the existing JLS ones re-used.

// Decimate imageIds in the volume.  Maybe need to change pixel sampling
// new volumeid every time.  update all 4 viewports on reloading.
//  When off metadata provided that provides data for the decimated images
//  The metadata provided will return different number of rows and columns
// Some codecs can decode to partial resolution.
//

import type { Types, VolumeViewport3D } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  cache,
  utilities,
  ProgressiveRetrieveImages,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  getLocalUrl,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { interleavedRetrieveStages } = ProgressiveRetrieveImages;
const { imageRetrieveMetadataProvider } = utilities;
const {
  ToolGroupManager,
  Enums: csToolsEnums,
  TrackballRotateTool,
  ZoomTool,
  PanTool,
  OrientationMarkerTool,
  StackScrollTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupIdVRT = 'MY_TOOLGROUP_VRT_ID';

const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_CORONAL';
const viewportId3 = 'CT_SAGITTAL';
const viewportId4 = 'CT_3D_VOLUME'; // New 3D volume viewport
const viewportIds = [viewportId1, viewportId2, viewportId3, viewportId4];

// Add dropdown to toolbar to select number of orthographic viewports (reloads page with URL param)
addDropdownToToolbar({
  labelText: 'Sample distance in i,j pixels (rows,columns) :',
  options: {
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    defaultValue: getNumViewportsFromUrl(),
  },
  onSelectedValueChange: (selectedValue) => {
    // const url = new URL(window.location.href);
    // url.searchParams.set('numViewports', selectedValue);
    // window.location.href = url.toString();
  },
});
addDropdownToToolbar({
  labelText: 'Sample distance k pixels (slices/frames) to skip:',
  options: {
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    defaultValue: getNumViewportsFromUrl(),
  },
  onSelectedValueChange: (selectedValue) => {
    // const url = new URL(window.location.href);
    // url.searchParams.set('numViewports', selectedValue);
    // window.location.href = url.toString();
  },
});

const renderingEngineId = 'myRenderingEngine';

/////////////////////////////////////////
// ======== Set up page ======== //

setTitleAndDescription(
  'Decimated Dynamic Loading for Volume Viewport',
  'Here we demonstrate decimated dynamic loading of volumes.'
);

const size = '400px';

const viewportGrid = document.createElement('div');

const content = document.getElementById('content');

const loaders = document.createElement('div');
content.appendChild(loaders);

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '800px';

// Create elements for the viewports
const element1 = document.createElement('div'); // Axial
const element2 = document.createElement('div'); // Sagittal
const element3 = document.createElement('div'); // Coronal
const element4 = document.createElement('div'); // 3D Volume

// Create a container for the right side viewports
const rightViewportsContainer = document.createElement('div');
rightViewportsContainer.style.display = 'flex';
rightViewportsContainer.style.flexDirection = 'column';
rightViewportsContainer.style.width = '20%';
rightViewportsContainer.style.height = '100%';

// Set styles for the 2D viewports (stacked vertically on the right)
element1.style.width = '100%';
element1.style.height = '33.33%';
element1.style.minHeight = '200px';

element2.style.width = '100%';
element2.style.height = '33.33%';
element2.style.minHeight = '200px';

element3.style.width = '100%';
element3.style.height = '33.33%';
element3.style.minHeight = '200px';

// Set styles for the 3D viewport (on the left)
element4.style.width = '75%';
element4.style.height = '100%';
element4.style.minHeight = '600px';
element4.style.position = 'relative';

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

// Add elements to the viewport grid
// First add the 3D viewport on the left
viewportGrid.appendChild(element4);

// Add the 2D viewports stacked vertically on the right
rightViewportsContainer.appendChild(element1);
rightViewportsContainer.appendChild(element2);
rightViewportsContainer.appendChild(element3);
viewportGrid.appendChild(rightViewportsContainer);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Select numbers of pixels to skip from the drop down and see the timing results.
  `;

content.append(instructions);

/**
 * Get the number of orthographic viewports from the URL (?numViewports=1|2|3)
 */
function getNumViewportsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('numViewports');
  const num = Number(value);
  if ([1, 2, 3].includes(num)) {
    return num;
  }
  return 3; // default
}

/**
 * Runs the demo with a configurable number of orthographic viewports
 */
async function run(numViewports = getNumViewportsFromUrl()) {
  await initDemo();

  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(OrientationMarkerTool);
  cornerstoneTools.addTool(StackScrollTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    //     StudyInstanceUID:
    //   '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    // SeriesInstanceUID:
    //   '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',

    //    wadoRsRoot:
    //  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    wadoRsRoot: getLocalUrl() || 'http://localhost:5000/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Only include the requested number of orthographic viewports
  const orthographicViewports = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ].slice(0, numViewports);

  // Show/hide orthographic viewport elements based on numViewports
  [element1, element2, element3].forEach((el, idx) => {
    if (idx < numViewports) {
      el.style.display = 'block';
      el.style.height = `${100 / numViewports}%`;
    } else {
      el.style.display = 'none';
    }
  });

  // Always set viewport4 (3D viewport) orientation to CORONAL
  const viewportInputArray = [
    ...orthographicViewports,
    {
      viewportId: viewportId4,
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0, 0],
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  async function loadVolume(volumeId, imageIds, config, text) {
    cache.purgeCache();
    imageRetrieveMetadataProvider.clear();
    if (config) {
      imageRetrieveMetadataProvider.add('volume', config);
    }
    // resetTimingInfo();
    // // Define a volume in memory
    // getOrCreateTiming('loadingStatus').innerText = 'Loading...';
    // const start = Date.now();
    const progressiveRenderingtrue = true;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
      progressiveRenderingtrue,
    });

    // Set the volume to load
    volume.load(() => {});

    setVolumesForViewports(
      renderingEngine,
      [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
      viewportIds
    );

    // Render the image
    renderingEngine.renderViewports(viewportIds);
  }

  //  volume.load();

  // Only set volumes for the active viewport IDs
  const activeViewportIds = [
    ...orthographicViewports.map((vp) => vp.viewportId),
    viewportId4,
  ];
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    activeViewportIds
  );

  // Tool group for orthographic viewports
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  orthographicViewports.forEach((vp) => {
    toolGroup.addViewport(vp.viewportId, renderingEngineId);
  });
  toolGroup.addTool(StackScrollTool.toolName, {
    viewportIndicators: true,
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // Tool group for 3D viewport
  const toolGroupVRT = ToolGroupManager.createToolGroup(toolGroupIdVRT);
  toolGroupVRT.addTool(ZoomTool.toolName);
  toolGroupVRT.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroupVRT.addTool(PanTool.toolName);
  toolGroupVRT.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });
  toolGroupVRT.addTool(OrientationMarkerTool.toolName, {
    overlayMarkerType:
      OrientationMarkerTool.OVERLAY_MARKER_TYPES.ANNOTATED_CUBE,
  });
  // toolGroupVRT.setToolActive(OrientationMarkerTool.toolName);

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;
  const viewport = renderingEngine.getViewport(viewportId4) as VolumeViewport3D;
  renderingEngine.renderViewports(activeViewportIds);
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId4]
  ).then(() => {
    viewport.setProperties({
      preset: 'CT-Bone',
    });
    toolGroupVRT.addViewport(viewportId4, renderingEngineId);
    toolGroupVRT.addTool(TrackballRotateTool.toolName, {});
    toolGroupVRT.setToolActive(TrackballRotateTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
    const createButton = (text, action) => {
      const button = document.createElement('button');
      button.innerText = text;
      button.id = text;
      button.onclick = action;
      loaders.appendChild(button);
      return button;
    };

    const loadButton = (text, volId, imageIds, config) =>
      createButton(text, loadVolume.bind(null, volId, imageIds, config, text));
    const configJLS = {
      ...interleavedRetrieveStages,
      retrieveOptions: {
        default: {
          framesPath: '/jls/',
        },
      },
    };
    loadButton('Load JLS', volumeId, imageIds, configJLS);
    viewport.render();
  });
}

run();
