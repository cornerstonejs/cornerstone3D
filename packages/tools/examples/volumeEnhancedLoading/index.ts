// For the low resolution image loader, what is required to do this is to create a new volume with a metadata loader that has a reduced set of images.
// The reduced set should be specified as "skip" distances in i,j,k pixels.
// The skip distance for k will REMOVE frames from the dataset.
// The i distance will remove columns, while the j distance will remove rows.
// Naturally, that affects the sizing/image positioning.

// There should also be an image loader that re-uses an existing loader but decimates OR fetches the data using the jls reduced resolution endpoint.
// The ordering should be:
// 1. See if the reduced resolution version is available in cache -> use it immediately
// 2. See if the full resolution version is available in cache -> decimate it and put the reduced resolution version in cache
// 3. Fetch the reduced resolution version if configured against the back end
// 4. Fetch the full resolution version and decimate it

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
  eventTarget,
  imageLoadPoolManager,
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

const { imageRetrieveMetadataProvider } = utilities;
const {
  ToolGroupManager,
  Enums: csToolsEnums,
  VolumeCroppingTool,
  TrackballRotateTool,
  ZoomTool,
  PanTool,
  OrientationMarkerTool,
  StackScrollTool,
  LengthTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, InterpolationType, Events, RequestType } = Enums;

// Define volume loader scheme
const volumeLoaderScheme = 'enhancedVolumeLoader'; // Loader id which defines which volume loader to use

// Function to generate a unique volume ID each time
function generateVolumeId(): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const volumeName = `CT_VOLUME_${timestamp}_${randomId}`;
  return `${volumeLoaderScheme}:${volumeName}`;
}

const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupIdVRT = 'MY_TOOLGROUP_VRT_ID';

const viewportId1 = 'CT_VOLUME_AXIAL';
const viewportId2 = 'CT_STACK_AXIAL';
const viewportId3 = 'CT_VOLUME_SAGITTAL';
const viewportId4 = 'CT_3D_VOLUME'; // New 3D volume viewport
const viewportIds = [viewportId1, viewportId2, viewportId3, viewportId4];

let ijkDecimation: [number, number, number] = [4, 4, 4]; // [i, j, k] decimation factors

// Add dropdown to toolbar to select number of orthographic viewports (reloads page with URL param)
addDropdownToToolbar({
  labelText: 'Sample distance in i,j pixels (rows,columns) :',
  options: {
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    defaultValue: ijkDecimation[0],
  },
  onSelectedValueChange: async (selectedValue) => {
    ijkDecimation = [Number(selectedValue), ijkDecimation[1], ijkDecimation[2]];
  },
});

addDropdownToToolbar({
  labelText: 'Sample distance k pixels (slices/frames) to skip:',
  options: {
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    defaultValue: ijkDecimation[2],
  },
  onSelectedValueChange: async (selectedValue) => {
    ijkDecimation = [ijkDecimation[0], ijkDecimation[1], Number(selectedValue)];
  },
});

addDropdownToToolbar({
  labelText: 'Progressive Loading:',
  options: {
    values: ['basic', 'jls', 'jls-mixed', 'j2k', 'j2k-bytes', 'j2k-mixed'],
    defaultValue: 'basic',
    labels: ['Basic', 'JLS', 'JLS Mixed', 'J2K', 'J2K Bytes', 'J2K Mixed'],
  },
  onSelectedValueChange: async (selectedValue) => {
    console.log('🔄 Progressive loading option changed to:', selectedValue);
    // You can add progressive loading logic here if needed
  },
});

const renderingEngineId = 'myRenderingEngine';

/////////////////////////////////////////
// ======== Set up page ======== //

setTitleAndDescription(
  'Enhanced Volume Loading',
  'Here we demonstrate enhanced volume loading with configurable in-plane (i,j) and axial (k) decimation.'
);

const size = '400px';

const viewportGrid = document.createElement('div');

const content = document.getElementById('content');

// Add timing information display
const timingInfo = document.createElement('div');
timingInfo.style.width = '35em';
timingInfo.style.height = '6em'; // Reduced height
timingInfo.style.float = 'left';
timingInfo.style.marginBottom = '10px'; // Add small margin
content.appendChild(timingInfo);
const timingIds = [];
const getOrCreateTiming = (id) => {
  const element = document.getElementById(id);
  if (element) {
    return element;
  }
  timingIds.push(id);
  timingInfo.innerHTML += `<p id="${id}">${id}</p>`;
  const p = document.getElementById(id);
  p.style.lineHeight = '1';
  p.style.marginTop = '0';
  p.style.marginBottom = '0';
  return p;
};
function resetTimingInfo() {
  for (const id of timingIds) {
    getOrCreateTiming(id).innerText = `Waiting ${id}`;
  }
}
getOrCreateTiming('loadingStatus').innerText = 'Timing Information';

// Use the shared demo toolbar for controls so elements appear on one line

// Add a clear div to ensure proper layout
const clearDiv = document.createElement('div');
clearDiv.style.clear = 'both';
clearDiv.style.marginTop = '10px';
content.appendChild(clearDiv);

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '800px';
viewportGrid.style.marginTop = '5px'; // Reduce top margin

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
element1.style.minHeight = '100px';

element2.style.width = '100%';
element2.style.height = '33.33%';
element2.style.minHeight = '100px';

element3.style.width = '100%';
element3.style.height = '33.33%';
element3.style.minHeight = '100px';

// Set styles for the 3D viewport (on the left)
element4.style.width = '75%';
element4.style.height = '100%';
element4.style.minHeight = '300px';
element4.style.position = 'relative';

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

// Add elements to the viewport gri
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

async function run() {
  // Force consistent GPU rendering across different hardware
  await initDemo({
    rendering: {
      preferSizeOverAccuracy: false, // Use full precision for consistency
      strictZSpacingForVolumeViewport: true, // Strict Z spacing calculation
    },
  });

  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(OrientationMarkerTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(LengthTool);

  let exampleStudyInstanceUID = '';
  let exampleSeriesInstanceUID = '';

  // OHIF Juno
  exampleStudyInstanceUID =
    '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1';
  exampleSeriesInstanceUID =
    '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4';

  // 3000 slice CT - horse knee example
  // exampleStudyInstanceUID ='1.2.276.1.74.1.2.11712397.41276.13296733802084081563787857002084';
  // exampleSeriesInstanceUID ='1.2.392.200036.9116.2.6.1.44063.1804609875.1652234897.14297';

  // Other
  // exampleStudyInstanceUID = '1.2.276.1.74.1.2.11712397.41276.13296733802084081563787857002084';
  //  exampleSeriesInstanceUID='1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: exampleStudyInstanceUID,
    SeriesInstanceUID: exampleSeriesInstanceUID,
    //    wadoRsRoot:'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    wadoRsRoot: getLocalUrl() || 'http://BusinessLaptop1:5000/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

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
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
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
  ];
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

  // Configure image load pool manager for progressive loading
  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Interaction, 6);
  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, 12);
  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Thumbnail, 16);

  async function loadVolume(config) {
    // Generate a new unique volume ID for each load
    const currentVolumeId = generateVolumeId();

    console.log('🚀 Creating new volume with ID:', currentVolumeId);
    console.log('🔧 Decimation settings:', ijkDecimation);

    // Clear cache only when changing decimation factors to avoid leaking memory
    cache.purgeCache();
    imageRetrieveMetadataProvider.clear();
    if (config) {
      imageRetrieveMetadataProvider.add('volume', config);
    }

    console.log('📊 Volume creation parameters:', {
      volumeId: currentVolumeId,
      imageIdsCount: imageIds.length,
      ijkDecimation,
      progressiveRendering: true,
    });

    const volume = await volumeLoader.createAndCacheVolume(currentVolumeId, {
      imageIds,
      progressiveRendering: true,
      ijkDecimation,
    });

    console.log('✅ Volume created successfully:', {
      volumeId: currentVolumeId,
      volumeExists: !!volume,
      volumeDimensions: volume?.dimensions,
      volumeSpacing: volume?.spacing,
      volumeImageIds: volume?.imageIds?.length,
      hasImagePostProcess:
        typeof (volume as any)?.setImagePostProcess === 'function',
    });

    // Reset timing information and start timing
    resetTimingInfo();
    getOrCreateTiming('loadingStatus').innerText = 'Loading...';
    const start = Date.now();

    // Load the volume with progressive refresh
    console.log('🔄 Loading volume data...');

    // Set up periodic refresh during loading for progressive updates
    const refreshInterval = setInterval(() => {
      renderingEngine.renderViewports(viewportIds);
    }, 100); // Refresh every 100ms during loading

    volume.load(() => {
      const now = Date.now();
      getOrCreateTiming('loadingStatus').innerText = `Took ${
        now - start
      } ms with ${imageIds.length} items (decimation: ${ijkDecimation.join(',')})`;

      // Clear the refresh interval when loading is complete
      clearInterval(refreshInterval);

      // Reset camera for 3D viewport now that volume data is loaded
      try {
        const vrtViewport = renderingEngine.getViewport(
          viewportId4
        ) as VolumeViewport3D;
        if (
          vrtViewport &&
          volume.voxelManager &&
          volume.voxelManager.scalarData
        ) {
          console.log(
            '🔄 Resetting 3D viewport camera after volume load completion'
          );
          vrtViewport.resetCamera();
        }
      } catch (error) {
        console.warn('⚠️ Failed to reset 3D viewport camera:', error);
      }

      // Final render after loading is complete
      renderingEngine.renderViewports(viewportIds);
      console.log('✅ Volume data loading completed');
    });
    console.log('✅ Volume data loading initiated with progressive refresh');

    // Check if the volume has the expected properties after loading
    console.log('🔍 Volume properties after loading:', {
      volumeId: currentVolumeId,
      volumeDimensions: volume?.dimensions,
      volumeSpacing: volume?.spacing,
      imageDataDimensions: volume?.imageData?.getDimensions?.(),
      imageDataSpacing: volume?.imageData?.getSpacing?.(),
      imageDataOrigin: volume?.imageData?.getOrigin?.(),
      imageIdsCount: volume?.imageIds?.length,
    });

    // Set volumes for orthographic and 3D viewports (excluding stack viewport)
    const volumeViewportIds = viewportIds.filter((id) => id !== viewportId2);
    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: currentVolumeId,
          callback: setCtTransferFunctionForVolumeActor,
        },
      ],
      volumeViewportIds
    );

    // Set up the stack viewport separately with axial images
    const stackViewport = renderingEngine.getViewport(
      viewportId2
    ) as Types.IStackViewport;
    const centerSliceIndex = Math.floor(imageIds.length / 2);
    await stackViewport.setStack(imageIds, centerSliceIndex); // Start at center slice

    const vrtViewport = renderingEngine.getViewport(
      viewportId4
    ) as VolumeViewport3D;
    vrtViewport.setProperties({
      preset: 'CT-Bone',
      interpolationType: Enums.InterpolationType.NEAREST,
      // Not seeing a difference between LINEAR and NEAREST.
      //Enums.InterpolationType.LINEAR,
    });

    renderingEngine.renderViewports(viewportIds);
  }

  // Add event listeners for progressive loading events
  const volumeLoadingProgress = (evt) => {
    const { detail } = evt;
    console.log('Volume loading progress:', detail);
    // Refresh viewports on any volume loading progress
    renderingEngine.renderViewports(viewportIds);
  };

  const imageLoaded = (evt) => {
    const { detail } = evt;
    console.log('Image loaded:', detail);
    // Refresh viewports when individual images are loaded
    renderingEngine.renderViewports(viewportIds);
  };

  const volumeCacheImageAdded = (evt) => {
    const { detail } = evt;
    console.log('Volume cache image added:', detail);
    // Refresh viewports when new images are added to volume cache
    renderingEngine.renderViewports(viewportIds);
  };

  const stackNewImage = (evt) => {
    const { detail } = evt;
    console.log('Stack new image:', detail);
    // Refresh viewports when new images are available in stack
    renderingEngine.renderViewports(viewportIds);
  };

  // Add event listener for image retrieval stages timing
  const imageLoadStage = (evt) => {
    const { detail } = evt;
    const { stageId, numberOfImages, stageDurationInMS, startDurationInMS } =
      detail;
    getOrCreateTiming(stageId).innerText = stageDurationInMS
      ? `Stage ${stageId} took ${stageDurationInMS} ms, from start ${startDurationInMS} ms for ${numberOfImages} frames`
      : `Stage ${stageId} not run`;

    // Trigger viewport refresh after each stage
    renderingEngine.renderViewports(viewportIds);
  };

  eventTarget.addEventListener(Events.IMAGE_RETRIEVAL_STAGE, imageLoadStage);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    volumeLoadingProgress
  );
  eventTarget.addEventListener(Events.IMAGE_LOADED, imageLoaded);
  eventTarget.addEventListener(Events.VOLUME_LOADED, volumeLoadingProgress);
  eventTarget.addEventListener(
    Events.IMAGE_CACHE_IMAGE_ADDED,
    volumeCacheImageAdded
  );
  eventTarget.addEventListener(Events.STACK_NEW_IMAGE, stackNewImage);

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

  // Add LengthTool to the orthographic viewports
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left click to draw length measurements
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

  // Add 3D viewport tools & cropping tool before any volume loads
  toolGroupVRT.addViewport(viewportId4, renderingEngineId);
  toolGroupVRT.addTool(TrackballRotateTool.toolName, {});
  toolGroupVRT.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  // Button to trigger (re)loading with current decimation values

  const configJLS = {
    retrieveOptions: {
      default: {
        framesPath: '/jls/',
      },
    },
  };
  const config = {};
  addButtonToToolbar({
    title: 'Load Enhanced Volume (New ID)',
    onClick: () => {
      console.log(
        '🔄 Load button clicked - creating new volume with current decimation settings'
      );
      loadVolume(config);
    },
  });
  await loadVolume(config);
}

run();
