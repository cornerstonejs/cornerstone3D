import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
} from '@cornerstonejs/core';
import cornerstoneDicomImageLoader from '@cornerstonejs/dicom-image-loader';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
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
  synchronizers,
  SynchronizerManager,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

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
  return document.getElementById(id);
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

const instructions = document.createElement('p');
instructions.innerText = `
Left Click to change window/level
Use the mouse wheel to scroll through the stack.
`;

content.append(instructions);

// ============================= //

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
      // isLossy: true,
      framesPath: '/jls/',
    },
    'default-final': {
      // isLossy: true,
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
      isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
    'default-final': {
      // isLossy: true,
      framesPath: '/jlsThumbnail/',
    },
  },
};

const configThumbnail = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {
      // isLossy: true,
      framesPath: '/lossy/',
    },
    '3.2.840.10008.1.2.4.96-lossy': {
      // isLossy: true,
      framesPath: '/lossy/',
    },
    '3.2.840.10008.1.2.4.96-final': {
      framesPath: '/lossy/',
      streaming: false,
    },
    '1.2.840.10008.1.2.4.81-lossy': {
      // isLossy: true,
      framesPath: '/lossy/',
      streaming: false,
    },
    '1.2.840.10008.1.2.4.81-final': {
      // isLossy: true,
      framesPath: '/lossy/',
      streaming: false,
    },
  },
};

const configStreamingVolume = {
  minChunkSize: 65_536,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {},
    '3.2.840.10008.1.2.4.96-lossy': {
      streaming: true,
    },
    '3.2.840.10008.1.2.4.96-final': {
      streaming: true,
    },
  },
};

const configByteRange = {
  minChunkSize: 65_536,
  initialBytes: 65_536,
  totalRanges: 2,

  retrieveConfiguration: {
    '3.2.840.10008.1.2.4.96': {
      streaming: true,
    },
    'default-lossy': {},
    '3.2.840.10008.1.2.4.96-lossy': {
      // isLossy: true,
      streaming: false,
      byteRange: '0-65535',
      //needsScale: true,
    },
    '3.2.840.10008.1.2.4.96-final': {
      streaming: false,
      byteRange: '0-65535',
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
    const key = `Volume Load ${name}`;
    const start = Date.now();
    const volume = await volumeLoader.createAndCacheVolume(name, {
      imageIds,
    });
    getOrCreateTiming('loadingStatus').innerText = 'Loading...';

    // Set the volume to load
    volume.load((progress) => {
      const { stageId } = progress;
      const now = Date.now();
      if (stageId) {
        getOrCreateTiming(stageId).innerText = `Done ${stageId} in ${
          now - start
        } ms`;
      }
      if (progress.numFrames === progress.totalNumFrames) {
        getOrCreateTiming('loadingStatus').innerText = `Took ${
          now - start
        } ms for ${name}@${stageId} with ${imageIds.length} items`;
      }
    });

    setVolumesForViewports(renderingEngine, [{ volumeId: name }], viewportIds);

    // Render the image
    renderingEngine.renderViewports(viewportIds);
  }

  const createButton = (text, volId, imageIds, config) => {
    const button = document.createElement('button');
    button.innerText = text;
    button.onclick = loadVolume.bind(null, volId, imageIds, config);
    loaders.appendChild(button);
  };

  createButton('JLS', 'ct', imageIdsCT, configJLS);
  createButton('JLS Thumb', 'ct', imageIdsCT, configJLSThumbnail);
  createButton('J2K', 'ct', imageIdsCT, configDefault);
  createButton('J2K Thumb', 'ct', imageIdsCT, configThumbnail);
  createButton('J2K Stream', 'ct', imageIdsCT, configStreamingVolume);
  createButton('J2K Range', 'ct', imageIdsCT, configByteRange);
}

run();
