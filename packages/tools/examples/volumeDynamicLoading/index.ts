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
// OHIF will need a way to link TWO different volumes into a display set, and to choose between them.The CS3D example will just have a pulldown with various options on a 2+3 layout including a 3d volume, a stack, and 3 mprs below it.
// The path to the sub-resolution images can be probably left alone and the existing JLS ones re-used.

import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
  eventTarget,
  utilities,
  ProgressiveRetrieveImages,
  imageLoadPoolManager,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { RequestType } = Enums;

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  ToolGroupManager,
  StackScrollTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { imageRetrieveMetadataProvider } = utilities;
const { ImageQualityStatus, ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;

const { interleavedRetrieveStages } = ProgressiveRetrieveImages;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

const renderingEngineId = 'myRenderingEngine';
const viewportIds = [
  'CT_SAGITTAL_STACK_1',
  'CT_SAGITTAL_STACK_2',
  'CT_SAGITTAL_STACK_3',
];

// ======== Set up page ======== //
setTitleAndDescription(
  'Dynamic Loading for Volume Viewport',
  'Here we demonstrate creating volumes with a reduced set of images and pixels.'
);

const size = '512px';
const content = document.getElementById('content');

const loaders = document.createElement('div');
content.appendChild(loaders);

const timingInfo = document.createElement('div');
timingInfo.style.width = '35em';
timingInfo.style.height = '10em';
timingInfo.style.float = 'left';
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
  p.style.lineHeight = 1;
  p.style.marginTop = 0;
  p.style.marginBottom = 0;
  return p;
};
function resetTimingInfo() {
  for (const id of timingIds) {
    getOrCreateTiming(id).innerText = `Waiting ${id}`;
  }
}
getOrCreateTiming('loadingStatus').innerText = 'Timing Information';

const buttonInfo = document.createElement('div');
buttonInfo.style.width = '20em';
buttonInfo.style.height = '10em';
buttonInfo.style.float = 'left';
buttonInfo.innerHTML = `
<ul style="margin:0">
<li>JLS Thumb - reduced resolution only</li>
<li>JLS Mixed - reduced resolution first, then full</li>
<li>J2K - streaming HTJ2K</li>
<li>J2K bytes - byte range request only</li>
<li>J2K Mixed - J2K byte range first, then full</li>
</ul>`;
content.appendChild(buttonInfo);

// const stageInfo = document.createElement('div');
// stageInfo.style.width = '30em';
// stageInfo.style.height = '10em';
// stageInfo.style.float = 'left';
// stageInfo.innerHTML = `
// <ul style="margin:0">
// <li>Stages are arbitrary names for retrieve configurations</li>
// <li>Stages are skipped if data already complete</li>
// <li>Decimations are every 1 out of 4 sequential images</li>
// <li>quarter/half thumb are lossy decimations retrieves</li>
// <li>quarter/half/threeQuarter/final are non-lossy decimation retrieves</li>
// <li>lossy is based on configuration, and when not available, defaults to lossless</li>
// </ul>`;
// content.appendChild(stageInfo);

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.clear = 'both';
const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
// Disable right click context menu so we can have right click tools
element2.oncontextmenu = (e) => e.preventDefault();
// Disable right click context menu so we can have right click tools
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

// const instructions = document.createElement('div');
// instructions.innerHTML = `
// <ul>
// <li>Partial is reduced resolution for all images</li>
// <li>Lossy means some sort of lossy encoding for all images</li>
// <li>Byte range is 64kb of all images</li>
// <li>JLS/HTJ2K is full resolution JLS/HTJ2K</li>
// <li>Mixed is byte range (htj2k) or partial (jls) initially followed by remaining data</li>
// </ul>
// Stages are:
// <ul>
// <li>initialImages - final version of image 0, 50%, 100%</li>
// <li>quarterThumb - lossy configuration for every 4th image, offset 1</li>
// <li>halfThumb - lossy configuration for every 4th image, offset 3</li>
// <li>Remaing *Full - final configuration for every 4th image, offset 0, 2, 1, 3</li>
// <li>If lossy is configured as final, then some stages won't retrieve anything</li>
// </ul>
// <p>Left Click to change window/level</p>
// Use the mouse wheel to scroll through the stack.
// `;

// content.append(instructions);

/**
 * Generate the various configurations by using the options on static DICOMweb:
 * Base lossy/full thumbnail configuration for HTJ2K:
 * ```
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name lossy d:\src\viewer-testdata\dcm\Juno
 * ```
 *
 * JLS and JLS thumbnails:
 * ```bash
 * mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jls /src/viewer-testdata/dcm/Juno
 * mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail /src/viewer-testdata/dcm/Juno
 * ```
 *
 * HTJ2K and HTJ2K thumbnail - lossless:
 * ```bash
 * mkdicomweb create -t jhc --recompress true --alternate jhcLossless --alternate-name htj2k  /src/viewer-testdata/dcm/Juno
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name htj2kThumbnail --alternate-thumbnail /src/viewer-testdata/dcm/Juno
 * ```
 */

const configReduced2 = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    default: {
      framesPath: '/jls/',
    },
  },
};

const configJLS = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    default: {
      framesPath: '/jls/',
    },
  },
};

const configJLSNonInterleaved = {
  retrieveOptions: {
    default: {
      framesPath: '/jls/',
    },
  },
};

const configJLSThumbnail = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    default: {
      framesPath: '/jlsThumbnail/',
    },
  },
};

const configJLSMixed = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    ...configJLS.retrieveOptions,
    multipleFast: {
      imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/jlsThumbnail/',
    },
  },
};

const configHtj2k = interleavedRetrieveStages;

const configHtj2kByteRange = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    multipleFast: {
      rangeIndex: 0,
      decodeLevel: 0,
    },
  },
};

const configHtj2kLossy = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    multipleFinal: {
      streaming: true,
    },
    multipleFast: {
      imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      framesPath: '/lossy/',
      rangeIndex: 0,
      decodeLevel: 2,
    },
  },
};

const configHtj2kMixed = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    multipleFast: {
      rangeIndex: 0,
      chunkSize: 32000,
      decodeLevel: 1,
    },
    multipleFinal: {
      rangeIndex: -1,
    },
  },
};

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName, { volumeId });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
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
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  const imageIdsCT = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    //   wadoRsRoot:
    // getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    wadoRsRoot: getLocalUrl() || 'http://localhost:5000/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );
  renderingEngine.renderViewports(viewportIds);

  const progressiveRendering = true;

  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Interaction, 6);
  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, 12);
  imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Thumbnail, 16);

  async function loadVolume(volumeId, imageIds, config, text) {
    cache.purgeCache();
    imageRetrieveMetadataProvider.clear();
    if (config) {
      imageRetrieveMetadataProvider.add('volume', config);
    }
    resetTimingInfo();
    // Define a volume in memory
    getOrCreateTiming('loadingStatus').innerText = 'Loading...';
    const start = Date.now();
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
      progressiveRendering,
    });

    // Set the volume to load
    volume.load(() => {
      const now = Date.now();
      getOrCreateTiming('loadingStatus').innerText = `Took ${
        now - start
      } ms for ${text} with ${imageIds.length} items`;
    });

    setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

    // Render the image
    renderingEngine.renderViewports(viewportIds);
  }

  const imageLoadStage = (evt) => {
    const { detail } = evt;
    const { stageId, numberOfImages, stageDurationInMS, startDurationInMS } =
      detail;
    getOrCreateTiming(stageId).innerText = stageDurationInMS
      ? `Stage ${stageId} took ${stageDurationInMS} ms, from start ${startDurationInMS} ms for ${numberOfImages} frames`
      : `Stage ${stageId} not run`;
  };

  eventTarget.addEventListener(Events.IMAGE_RETRIEVAL_STAGE, imageLoadStage);

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
  loadButton(' Skip 1 ', volumeId, imageIdsCT, configReduced2);
  loadButton(' Skip 2 ', volumeId, imageIdsCT, configReduced2);
  loadButton(' Skip 3 ', volumeId, imageIdsCT, configReduced2);

  // loadButton('JLS', volumeId, imageIdsCT, configJLS);
  // loadButton(
  //   'JLS Non Interleaved',
  //   volumeId,
  //   imageIdsCT,
  //   configJLSNonInterleaved
  // );
  // loadButton('JLS Thumb', volumeId, imageIdsCT, configJLSThumbnail);
  // loadButton('JLS Mixed', volumeId, imageIdsCT, configJLSMixed);
  // loadButton('J2K', volumeId, imageIdsCT, configHtj2k);
  // loadButton('J2K Non Progressive', volumeId, imageIdsCT, null);
  // loadButton('J2K Bytes', volumeId, imageIdsCT, configHtj2kByteRange);
  // loadButton('J2K Lossy', volumeId, imageIdsCT, configHtj2kLossy);
  // loadButton('J2K Mixed', volumeId, imageIdsCT, configHtj2kMixed);
}

run();
