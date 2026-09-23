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
  imageLoader,
  metaData,
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
import * as cornerstoneAdapters from '@cornerstonejs/adapters';
import { wadouri } from '@cornerstonejs/dicom-image-loader';

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
const { Cornerstone3D } = cornerstoneAdapters.adaptersSEG;
const { segmentation: csToolsSegmentation } = cornerstoneTools;

const segmentationId = 'SEGMENTATION_ID';

/** The largest edge in pixels that a viewport takes, however large the data. */
const maximumViewportEdge = 1500;

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
  // this series comes from the code and not from the acquisition. This series
  // is the test data of commit 9, which gives a derived representation that
  // follows the load.
  'CT body 2464 images of 512 x 512': {
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.24993177073256607564948872275593',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.13277129293167305892649949655853',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  },
  // The same CT of 2464 images, with the segmentation that one reader made of
  // it. The CT loads in stages, and the segmentation loads as one complete
  // DICOM instance: a labelmap has no use for a coarse version of itself,
  // because a segment index is a name and not a measurement, and an average of
  // two segment indices names a third segment.
  'CT body 2464 images with a SEG': {
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.24993177073256607564948872275593',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.13277129293167305892649949655853',
    segSeriesInstanceUID:
      '1.2.826.0.1.3680043.10.511.3.87031968437079874720771706917838569',
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
viewportGrid.style.clear = 'both';

const elements = [0, 1, 2, 3].map(() => {
  const element = document.createElement('div');

  element.style.width = size;
  element.style.height = size;
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  return element;
});
const [element1, element2, element3, element4] = elements;

/**
 * The viewports sit in two rows, and each row holds the two viewports of the
 * same height.
 *
 * `sizeViewportsToVolume` gives a viewport one pixel for each voxel, so the
 * axial view and the 3D view are as tall as one image, and the sagittal view
 * and the coronal view are as tall as the number of slices. A single row of
 * all four would leave a large empty space beside the two short ones.
 */
const viewportRow = (...rowElements) => {
  const row = document.createElement('div');

  row.style.display = 'flex';
  row.style.flexDirection = 'row';
  row.style.alignItems = 'flex-start';

  rowElements.forEach((element) => row.appendChild(element));
  viewportGrid.appendChild(row);
};

viewportRow(element3, element4);
viewportRow(element1, element2);

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

/**
 * The frames that one retrieved frame replicates to, for a decimation of
 * `decimate`.
 *
 * The default configuration fills every frame because its list matches its
 * decimation. It decimates by 4 and it replicates to the offsets -1, +1 and
 * +2, which with the retrieved frame itself covers 4 frames in a row. A larger
 * decimation with that same list of three offsets leaves the frames between
 * two retrieved frames empty.
 *
 * This builds the list that covers a whole decimation window, so one retrieved
 * frame in `decimate` fills the whole volume.
 *
 * The quality follows the distance. A frame beside the retrieved frame holds
 * data of the neighbour of its own slice, and a frame 16 slices away holds
 * data of a different part of the body. The two are not equally good, and the
 * record must not state that they are.
 */
function nearbyFramesOfDecimation(decimate) {
  const frames = [];
  const first = -Math.floor((decimate - 1) / 2);

  for (let offset = first; offset < first + decimate; offset++) {
    if (offset !== 0) {
      frames.push({
        offset,
        imageQualityStatus:
          Math.abs(offset) <= 1
            ? ImageQualityStatus.ADJACENT_REPLICATE
            : ImageQualityStatus.FAR_REPLICATE,
      });
    }
  }

  return frames;
}

/**
 * The interleaved path, with two changes for a volume of many images.
 *
 * `initialImages` fetches the middle image and the two images beside it, and
 * then the first and the last image. A viewport opens on the middle of the
 * volume, and a reduced texture takes the box average of several frames there,
 * so one middle image alone gives that view almost nothing.
 *
 * `coarse32` then retrieves one image in 32 and replicates each one to the 31
 * images around it, so the whole volume holds data once 1/32 of the images
 * have arrived. The data is at the resolution of the acquisition in the plane,
 * and at one thirty second of it along the k axis. Every later stage refines
 * that volume.
 *
 * The stage needs the number of images, because a position of the middle of
 * the volume plus one image is an index and not a fraction.
 */
function interleavedConfigurationOf(imageCount) {
  const middle = Math.floor(imageCount / 2);
  const [initialImages, ...laterStages] = interleavedRetrieveStages.stages;

  return {
    stages: [
      {
        ...initialImages,
        positions: [middle, middle - 1, middle + 1, 0, -1],
      },
      {
        id: 'coarse32',
        decimate: 32,
        offset: 16,
        priority: 6,
        requestType: RequestType.Thumbnail,
        retrieveType: 'default',
        nearbyFrames: nearbyFramesOfDecimation(32),
      },
      // Every later stage keeps its order behind the coarse stage, which took
      // the priority that the first of them held.
      ...laterStages.map((stage) => ({
        ...stage,
        priority: stage.priority === undefined ? undefined : stage.priority + 1,
      })),
    ],
  };
}

/**
 * The bytes of the one DICOM instance that a WADO-RS instance response holds.
 *
 * That endpoint answers with a `multipart/related` body of one part. The
 * server names no boundary in the Content-Type header, so the boundary comes
 * from the first line of the body, and the headers of the part end at the
 * first empty line. The CRLF before the closing boundary belongs to the
 * envelope, and not to the instance.
 */
function part10BytesOf(contentType: string, buffer: ArrayBuffer): ArrayBuffer {
  if (!contentType || contentType.indexOf('multipart') === -1) {
    return buffer;
  }

  const bytes = new Uint8Array(buffer);
  const latin1Of = (part: Uint8Array) => String.fromCharCode(...part);
  const head = latin1Of(bytes.subarray(0, 2048));
  const boundary = head.slice(0, head.indexOf('\r\n'));
  const headerEnd = head.indexOf('\r\n\r\n');

  if (boundary.slice(0, 2) !== '--' || headerEnd === -1) {
    throw new Error('The response holds no multipart header');
  }

  // The closing boundary is at the end of the body, so read that end only.
  const tailStart = Math.max(0, bytes.length - boundary.length - 8);
  const closeIndex = latin1Of(bytes.subarray(tailStart)).lastIndexOf(
    `\r\n${boundary}`
  );

  return buffer.slice(
    headerEnd + 4,
    closeIndex === -1 ? bytes.length : tailStart + closeIndex
  );
}

/** Adds the frame qualifier that a WADO-URI image id takes. Frames count from 1. */
function withFrame(imageId: string, frame: number): string {
  return `${imageId}${imageId.indexOf('?') === -1 ? '?' : '&'}frame=${frame}`;
}

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
  let selectedSeries = seriesOptions['CT (progressive configurations)'];
  let imageIdsCT = await createImageIdsAndCacheMetaData(selectedSeries);

  addDropdownToToolbar({
    id: 'series',
    labelText: 'Series',
    container: loaders,
    options: {
      map: new Map(Object.entries(seriesOptions)),
      defaultValue: 'CT (progressive configurations)',
    },
    onSelectedValueChange: async (_key, value) => {
      selectedSeries = value;
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

  // The Part 10 bytes of each segmentation that this page fetched, keyed by
  // the series. A second press of a load button then reads no 19 MB again.
  const segBuffers = new Map<string, ArrayBuffer>();

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

    // After the viewports hold their actors, and not before: the resize below
    // fits each camera to the data, and a viewport with no actor has no bounds
    // to fit, which fails inside `getSpatialExtent`.
    sizeViewportsToVolume(volume.dimensions, volume.spacing);

    // The 3D viewport shows nothing without a transfer function.
    const viewport3D = renderingEngine.getViewport(viewportId3D);

    viewport3D?.setProperties?.({ preset: 'CT-Bone' });

    // Render the image
    renderingEngine.renderViewports(viewportIds);

    await loadSegmentation(selectedSeries, imageIds);
  }

  /**
   * Gives each planar viewport the shape of the data that it shows, at one
   * pixel or more for each voxel.
   *
   * A viewport that is smaller than its data samples that data, and a sample
   * hides the change that one stage of a progressive load makes.
   *
   * The shape comes from the world extent and not from the number of voxels,
   * because the camera fits the world extent. A volume whose spacing differs
   * between two axes has a number of voxels of one shape and a world extent of
   * another, and a viewport of the first shape shows the background around the
   * data. The scale is the finest spacing of the two axes, so the finer axis
   * gets one pixel for each voxel and the coarser axis gets more than one.
   *
   * The 3D viewport shows a projection and not a plane of voxels, so it takes
   * the size of the axial viewport, which keeps the row of the two tidy.
   *
   * No side goes beyond `maximumViewportEdge`. A series whose spacing differs
   * strongly between two axes asks for an edge of several thousand pixels, and
   * a page of that size is hard to use. The clip scales BOTH sides by the same
   * factor, so the shape stays the shape of the data and the background does
   * not come back.
   */
  function sizeViewportsToVolume(dimensions, spacing) {
    // The two axes of the plane of each orientation, in the order of
    // `viewportInputArray`: sagittal, then coronal, then axial.
    const planes = [
      [1, 2],
      [0, 2],
      [0, 1],
    ];

    const sizes = planes.map(([first, second]) => {
      const scale = Math.min(spacing[first], spacing[second]);
      const width = (dimensions[first] * spacing[first]) / scale;
      const height = (dimensions[second] * spacing[second]) / scale;
      const clip = Math.min(1, maximumViewportEdge / Math.max(width, height));

      return [Math.round(width * clip), Math.round(height * clip)];
    });

    // The 3D viewport takes the size of the axial viewport, which is the last
    // of the planes above.
    [...sizes, sizes[2]].forEach(([width, height], index) => {
      elements[index].style.width = `${width}px`;
      elements[index].style.height = `${height}px`;
    });

    renderingEngine.resize(true, false);
  }

  /**
   * Loads the segmentation of the selected series, when that series has one.
   *
   * The segmentation loads as one complete DICOM instance, and not in stages.
   * A segment index is a name and not a measurement, so a box average of two
   * segment indices names a third segment, and a coarse version of a labelmap
   * states something that the reader never drew. One request of the whole
   * instance also costs far less than the 2464 requests of one frame each that
   * a per frame path needs on this series.
   *
   * The segmentation references the images of the CT, and not the voxels of
   * the CT, so this runs as soon as the image ids exist. The CT itself keeps
   * loading in stages while the segmentation arrives.
   */
  async function loadSegmentation(series, referenceImageIds) {
    const { StudyInstanceUID, segSeriesInstanceUID, wadoRsRoot } = series;

    csToolsSegmentation.removeAllSegmentationRepresentations();
    csToolsSegmentation.state.removeSegmentation(segmentationId);

    if (!segSeriesInstanceUID) {
      return;
    }

    const start = Date.now();
    const seriesPath = `${wadoRsRoot}/studies/${StudyInstanceUID}/series/${segSeriesInstanceUID}`;

    getOrCreateTiming('segStatus').innerText = 'Fetching the segmentation...';

    let part10 = segBuffers.get(segSeriesInstanceUID);

    if (!part10) {
      // The series holds one instance, and a query of the series names that
      // instance, so this example needs no SOP instance uid of its own.
      const instances = await (await fetch(`${seriesPath}/instances`)).json();
      const sopInstanceUID = instances[0]['00080018'].Value[0];
      const response = await fetch(`${seriesPath}/instances/${sopInstanceUID}`);

      part10 = part10BytesOf(
        response.headers.get('content-type'),
        await response.arrayBuffer()
      );
      segBuffers.set(segSeriesInstanceUID, part10);
    }

    // The file manager holds the bytes, and the WADO-URI loader then reads
    // every frame of the instance out of those bytes, with no further request.
    const segImageId = wadouri.fileManager.add(new Blob([part10]));

    await imageLoader.loadAndCacheImage(segImageId);

    const instance = metaData.get('instance', segImageId) || {};
    const frameCount = Number(instance.NumberOfFrames) || 1;
    const frameImageIds =
      frameCount > 1
        ? Array.from({ length: frameCount }, (_, index) =>
            withFrame(segImageId, index + 1)
          )
        : [segImageId];

    getOrCreateTiming('segStatus').innerText =
      `Reading a segmentation of ${frameCount} frames...`;

    const { labelMapImages } =
      await Cornerstone3D.Segmentation.createFromDicomSegImageId(
        referenceImageIds,
        segImageId,
        { metadataProvider: metaData, frameImageIds }
      );

    csToolsSegmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: {
            imageIds: labelMapImages.flat().map((image) => image.imageId),
          },
        },
      },
    ]);

    // Each planar viewport draws the labelmap. The 3D viewport shows a
    // projection of the CT, and it takes no labelmap here.
    for (const viewportId of viewportIds.filter((id) => id !== viewportId3D)) {
      await csToolsSegmentation.addSegmentationRepresentations(viewportId, [
        {
          segmentationId,
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
        },
      ]);
    }

    renderingEngine.renderViewports(viewportIds);

    getOrCreateTiming('segStatus').innerText =
      `Segmentation of ${frameCount} frames took ${Date.now() - start} ms`;
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

  // The button reads the image ids when it is pressed. A bound argument would
  // hold the series that was selected when the button was created, so a change
  // of the series would never reach the load.
  const loadButton = (text, volId, getImageIds, config) =>
    createButton(text, () => loadVolume(volId, getImageIds(), config, text));

  // The two loads that every DICOMweb server serves, because neither one asks
  // for an alternate frames path. They differ in the ORDER of the requests:
  // `Linear` asks for the frames from the first to the last, and `Progressive`
  // interleaves them, so a coarse version of the whole volume arrives first.
  loadButton('Linear', volumeId, () => imageIdsCT, null);
  // The configuration needs the number of images, so it is built when the
  // button is pressed and not when the button is created.
  createButton('Progressive', () =>
    loadVolume(
      volumeId,
      imageIdsCT,
      interleavedConfigurationOf(imageIdsCT.length),
      'Progressive'
    )
  );
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
