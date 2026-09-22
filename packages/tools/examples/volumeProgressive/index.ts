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
  addDropdownToToolbar,
  addGpuCapabilityProfileDropdown,
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
  TrackballRotateTool,
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
const viewportId3D = 'CT_VOLUME_3D';
const viewportIds = [
  'CT_SAGITTAL_STACK_1',
  'CT_SAGITTAL_STACK_2',
  'CT_SAGITTAL_STACK_3',
  viewportId3D,
];

/**
 * The series that this example can load.
 *
 * The DTI series holds 3720 images of 128 x 128, which is a volume that no
 * profile with a small edge can hold in one texture, so the reduction is
 * visible. The CT series is the one that this example loaded before, and the
 * alternate paths of the progressive configurations exist on that server only.
 */
const seriesOptions = {
  'CT (progressive configurations)': {
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113545.4',
    // The alternate frame paths that the JLS and the lossy configurations need
    // exist on a local static DICOMweb server only. The public host serves the
    // plain frames path, so those buttons fall back to it.
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
  // A real 3D volume of 2464 images, each of 512 x 512, with one image at each
  // position. The k axis exceeds the limit of 2048 of every known device, so a
  // reduction of that one axis applies, and nothing is interleaved: a streak in
  // this series comes from the code and not from the acquisition.
  'CT body 2464 images of 512 x 512 (local)': {
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.24993177073256607564948872275593',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.13277129293167305892649949655853',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
  // 3720 images at 40 positions: 93 acquisitions of each slice. A reduction of
  // the k axis mixes acquisitions, so a sagittal or a coronal view of it bands
  // whatever the code does.
  'DTI 3720 images of 128 x 128 (4D, 40 positions)': {
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.191696062987463500085282581898315738844',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.286489448812938804331972885532764010716',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
  'PERFUSION 900 images': {
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.191696062987463500085282581898315738844',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.9480659329591605716620606691103764508',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
};

// ======== Set up page ======== //
setTitleAndDescription(
  'Progressive Load for Volume Viewport',
  'Here we demonstrate progressive loading of volumes.'
);

const size = '512px';
const content = document.getElementById('content');

// The drop downs choose what to load. They apply at the next load.
const loaders = document.createElement('div');
content.appendChild(loaders);

// The load buttons take a line of their own, so it is obvious what to press.
const loadButtons = document.createElement('div');
loadButtons.style.clear = 'both';
loadButtons.style.padding = '0.5em 0';
loadButtons.innerHTML = '<div><b>Load with:</b></div>';
content.appendChild(loadButtons);

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
viewportGrid.style.flexWrap = 'wrap';
const elements = [0, 1, 2, 3].map(() => {
  const element = document.createElement('div');

  element.style.width = size;
  element.style.height = size;
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);

  return element;
});
const [element1, element2, element3, element4] = elements;

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
 * mkdicomweb create -t jhc --recompress true --alternate jhc --alternate-name lossy /src/viewer-testdata/dcm/Juno
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
  // The reduction that the GPU class forces is visible on a legacy viewport and
  // on a generic viewport, because the choice of a strategy lives in the actor
  // helpers that both of them use. Add `?type=next` to the address to draw
  // through the generic viewports and their render paths.
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(TrackballRotateTool);
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

  // The image ids of the series that the drop down selects. A load reads this,
  // so a change of the series applies at the next load.
  // The CT series is the default, because it renders with the window that
  // this example sets. Select another series to change what the load buttons
  // fetch; the change applies at the next load.
  let imageIdsCT = await createImageIdsAndCacheMetaData(
    seriesOptions['CT (progressive configurations)']
  );

  addDropdownToToolbar({
    id: 'series',
    labelText: 'Series',
    container: loaders,
    options: {
      map: new Map(Object.entries(seriesOptions)),
      defaultValue: 'CT (progressive configurations)',
    },
    onSelectedValueChange: async (_key, value) => {
      imageIdsCT = await createImageIdsAndCacheMetaData(value);
      getOrCreateTiming('loadingStatus').innerText =
        `Selected ${imageIdsCT.length} images. Press a load button.`;
    },
  });

  // An application states the GPU class, and nothing probes the device. The
  // strategies of a viewport are built when that viewport adds its actor, so a
  // change applies at the next load, which rebuilds every viewport.
  addGpuCapabilityProfileDropdown({
    container: loaders,
    onSelectedValueChange: (profile) => {
      getOrCreateTiming('loadingStatus').innerText =
        `GPU class ${profile.id}. Press a load button to apply it.`;
    },
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
    {
      viewportId: viewportId3D,
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the MPR viewports. The 3D viewport scrolls no
  // slices, so it takes the trackball of its own group.
  viewportIds
    .filter((viewportId) => viewportId !== viewportId3D)
    .forEach((viewportId) =>
      toolGroup.addViewport(viewportId, renderingEngineId)
    );

  const toolGroup3D = ToolGroupManager.createToolGroup(`${toolGroupId}_3d`);

  toolGroup3D.addTool(TrackballRotateTool.toolName);
  toolGroup3D.addTool(ZoomTool.toolName);
  toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup3D.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup3D.addViewport(viewportId3D, renderingEngineId);
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

    await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

    // The 3D viewport shows nothing without a transfer function.
    const viewport3D = renderingEngine.getViewport(viewportId3D);

    viewport3D?.setProperties?.({ preset: 'CT-Bone' });

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
    loadButtons.appendChild(button);
    return button;
  };

  // The button reads the image ids WHEN IT IS PRESSED. A bound argument would
  // hold the series that was selected when the button was created, so a change
  // of the series would never reach the load.
  const loadButton = (text, volId, getImageIds, config) =>
    createButton(text, () => loadVolume(volId, getImageIds(), config, text));

  // The plain DICOMweb path, with no retrieve configuration. Every server
  // serves it, so this is the load that always works.
  loadButton('DICOMweb', volumeId, () => imageIdsCT, null);
  loadButton('JLS', volumeId, () => imageIdsCT, configJLS);
  loadButton(
    'JLS Non Interleaved',
    volumeId,
    imageIdsCT,
    configJLSNonInterleaved
  );
  loadButton('JLS Thumb', volumeId, () => imageIdsCT, configJLSThumbnail);
  loadButton('JLS Mixed', volumeId, () => imageIdsCT, configJLSMixed);
  loadButton('J2K', volumeId, () => imageIdsCT, configHtj2k);
  loadButton('J2K Bytes', volumeId, () => imageIdsCT, configHtj2kByteRange);
  loadButton('J2K Lossy', volumeId, () => imageIdsCT, configHtj2kLossy);
  loadButton('J2K Mixed', volumeId, () => imageIdsCT, configHtj2kMixed);
}

run();
