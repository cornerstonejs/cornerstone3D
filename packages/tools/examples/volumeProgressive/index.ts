import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
  eventTarget,
} from '@cornerstonejs/core';
import cornerstoneDicomImageLoader from '@cornerstonejs/dicom-image-loader';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  ToolGroupManager,
  StackScrollMouseWheelTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;

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
  'Progressive Load for Volume Viewport',
  'Here we demonstrate progressive loading of volumes.'
);

const size = '512px';
const content = document.getElementById('content');

const loaders = document.createElement('div');
content.appendChild(loaders);

const timingInfo = document.createElement('div');
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

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

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
<ul>
<li>Partial is reduced resolution for all images</li>
<li>Lossy means some sort of lossy encoding for all images</li>
<li>Byte range is 64kb of all images</li>
<li>JLS/HTJ2K is full resolution JLS/HTJ2K</li>
<li>Mixed is byte range (htj2k) or partial (jls) initially followed by remaining data</li>
</ul>
Stages are:
<ul>
<li>initialImages - final version of image 0, 50%, 100%</li>
<li>quarterThumb - lossy configuration for every 4th image, offset 1</li>
<li>halfThumb - lossy configuration for every 4th image, offset 3</li>
<li>Remaing *Full - final configuration for every 4th image, offset 0, 2, 1, 3</li>
<li>If lossy is configured as final, then some stages won't retrieve anything</li>
</ul>
<p>Left Click to change window/level</p>
Use the mouse wheel to scroll through the stack.
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
const configDefault = {
  minChunkSize: 65_536 * 2,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
  },
};

const configJLS = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      framesPath: '/jls/',
    },
    'default-final': {
      framesPath: '/jls/',
    },
  },
};

const configJLSMixed = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    'default-final': {
      framesPath: '/jls/',
    },
  },
};

const configJLSThumbnail = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      // isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    'default-final': {
      // isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
  },
};

const configHtj2k = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      // isLossy: true,
      framesPath: '/htj2k/',
    },
    'default-final': {
      // isLossy: true,
      framesPath: '/htj2k/',
    },
  },
};

const configHtj2kMixed = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      isLossy: true,
      streaming: true,
      framesPath: '/htj2k/',
      range: 0,
      decodeLevel: 0,
    },
    'default-final': {
      framesPath: '/htj2k/',
      range: 1,
      streaming: false,
    },
  },
};

const configThumbnail = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      // isLossy: true,
      framesPath: '/htj2kThumbnail/',
    },
    '3.2.840.10008.1.2.4.96-lossy': {
      // isLossy: true,
      framesPath: '/htj2kThumbnail/',
      streaming: false,
    },
    '3.2.840.10008.1.2.4.96-final': {
      framesPath: '/htj2kThumbnail/',
      streaming: false,
    },
  },
};

const configStreamingVolume = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      streaming: true,
    },
    'default-final': {
      streaming: true,
    },
    '3.2.840.10008.1.2.4.96-lossy': {
      streaming: false,
    },
    '3.2.840.10008.1.2.4.96-final': {
      streaming: false,
    },
  },
};

const configByteRange = {
  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      framesPath: '/htj2k',
      initialBytes: 65536,
    },
    'default-final': {
      framesPath: '/htj2k',
      initialBytes: 65536,
    },
    '3.2.840.10008.1.2.4.96-lossy': {
      // isLossy: true,
      streaming: false,
      initialBytes: 65536,
      //needsScale: true,
    },
    '3.2.840.10008.1.2.4.96-final': {
      streaming: false,
      initialBytes: 65536,
      // isLossy: false,
      //needsScale: true,
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
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName, { volumeId });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

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
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  const imageIdsCT = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    wadoRsRoot: 'http://localhost:5000/dicomweb/',
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

  async function loadVolume(name, imageIds, config) {
    cornerstoneDicomImageLoader.configure(config);
    cache.purgeCache();
    resetTimingInfo();
    // Define a volume in memory
    const start = Date.now();
    const volume = await volumeLoader.createAndCacheVolume(name, {
      imageIds,
    });
    getOrCreateTiming('loadingStatus').innerText = 'Loading...';

    // Set the volume to load
    volume.load((progressEvt) => {
      const now = Date.now();
      getOrCreateTiming('loadingStatus').innerText = `Took ${
        now - start
      } ms for ${name} with ${imageIds.length} items`;
    });

    setVolumesForViewports(renderingEngine, [{ volumeId: name }], viewportIds);

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

  eventTarget.addEventListener(Events.IMAGE_LOAD_STAGE, imageLoadStage);

  const createButton = (text, volId, imageIds, config) => {
    const button = document.createElement('button');
    button.innerText = text;
    button.onclick = loadVolume.bind(null, volId, imageIds, config);
    loaders.appendChild(button);
  };

  createButton('JLS', volumeId, imageIdsCT, configJLS);
  createButton('JLS Thumb', volumeId, imageIdsCT, configJLSThumbnail);
  createButton('JLS Mixed', volumeId, imageIdsCT, configJLSMixed);
  createButton('J2K', volumeId, imageIdsCT, configHtj2k);
  createButton('J2K Thumb', volumeId, imageIdsCT, configThumbnail);
  createButton('J2K Stream', volumeId, imageIdsCT, configStreamingVolume);
  createButton('J2K Range', volumeId, imageIdsCT, configByteRange);
  createButton('J2K Mixed', volumeId, imageIdsCT, configHtj2kMixed);
}

run();
