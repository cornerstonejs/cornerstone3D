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
const { ViewportType, Events } = Enums;
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
  'HTJ2K Volume Display',
  'Show basic display of HTJ2K in Volumes'
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
  // @ts-ignore
  p.style.lineHeight = 1;
  // @ts-ignore
  p.style.marginTop = 0;
  // @ts-ignore
  p.style.marginBottom = 0;
  return p;
};
function resetTimingInfo() {
  for (const id of timingIds) {
    getOrCreateTiming(id).innerText = `Waiting ${id}`;
  }
}
getOrCreateTiming('loadingStatus').innerText = 'Timing Information';

const stageInfo = document.createElement('div');
stageInfo.style.width = '30em';
stageInfo.style.height = '10em';
stageInfo.style.float = 'left';
stageInfo.innerHTML = `
<ul style="margin:0">
<li>Stages are arbitrary names for retrieve configurations</li>
<li>Stages are skipped if data already complete</li>
<li>Decimations are every 1 out of 4 sequential images</li>
<li>quarter/half thumb are lossy decimations retrieves</li>
<li>quarter/half/threeQuarter/final are non-lossy decimation retrieves</li>
<li>lossy is based on configuration, and when not available, defaults to lossless</li>
</ul>`;
content.appendChild(stageInfo);

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

const instructions = document.createElement('div');
instructions.innerHTML = `
Shows HTJ2K loading of a volume in non-progressive, then progressive interleave
and finally full progressive (byte range request first followed by read).
`;

content.append(instructions);

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
const configHtj2k = {
  ...interleavedRetrieveStages,
};

const configHtj2kByteRange = {
  ...interleavedRetrieveStages,
  retrieveOptions: {
    multipleFast: {
      rangeIndex: 1,
      chunkSize: 16384,
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
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
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

  loadButton('J2K Non Progressive', volumeId, imageIdsCT, null);
  loadButton('J2K Interleaved', volumeId, imageIdsCT, configHtj2k);
  loadButton('J2K Byte Ranges', volumeId, imageIdsCT, configHtj2kByteRange);
}

run();
