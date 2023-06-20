import { vec3 } from 'gl-matrix';
import * as nifti from './nifti/src/nifti';
import {
  metaData,
  CONSTANTS,
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  createVolumeActor,
  Types,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  addButtonToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  WindowLevelTool,
  TrackballRotateTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

import sortImageIdsAndGetSpacing from '../../../streaming-image-volume-loader/src/helpers/sortImageIdsAndGetSpacing';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportId = '3D_VIEWPORT';

// ======== Set up page ======== //
setTitleAndDescription(
  '3D Volume Rendering',
  'Here we demonstrate how to 3D render a volume.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = 'Click the image to rotate it.';

content.append(instructions);

addDropdownToToolbar({
  options: {
    values: CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
    defaultValue: 'CT-Bone',
  },
  onSelectedValueChange: (presetName) => {
    const actors = renderingEngine.getViewport(viewportId).getActors();
    const volumeActor = actors[1].actor as Types.VolumeActor;

    utilities.applyPreset(
      volumeActor,
      CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === presetName)
    );

    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Full volume',
  onClick: () => {
    const viewport = renderingEngine.getViewport(viewportId);
    const actors = viewport.getActors();
    actors[1].slabThickness = undefined;
    viewport.render();
    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Slice view',
  onClick: () => {
    const viewport = renderingEngine.getViewport(viewportId);
    const actors = viewport.getActors();
    actors[1].slabThickness = 1.0;
    viewport.render();
    renderingEngine.render();
  },
});

function setInitialPreset(viewport, initialPreset = 'CT-Bone') {
  const actors = viewport.getActors();
  const volumeActor = actors[1].actor as Types.VolumeActor;

  utilities.applyPreset(
    volumeActor,
    CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === initialPreset)
  );
  viewport.resetCamera();
  viewport.render();
}

function sortImageIds(imageIds) {
  const { rowCosines, columnCosines } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );
  const scanAxisNormal = vec3.create();

  vec3.cross(scanAxisNormal, rowCosines, columnCosines);

  const { sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );
  return sortedImageIds;
}

function openNiftiArrayBuffer(arrayBuffer, flipSlice = true) {
  // parse nifti
  if (nifti.isCompressed(arrayBuffer)) {
    arrayBuffer = nifti.decompress(arrayBuffer);
  }
  if (nifti.isNIFTI(arrayBuffer)) {
    const niftiHeader = nifti.readHeader(arrayBuffer);
    const niftiImage = nifti.readImage(niftiHeader, arrayBuffer);

    // convert raw data to typed array based on nifti datatype
    let typedData;

    if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT8) {
      typedData = new Uint8Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT16) {
      typedData = new Int16Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT32) {
      typedData = new Int32Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_FLOAT32) {
      typedData = new Float32Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_FLOAT64) {
      typedData = new Float64Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT8) {
      typedData = new Int8Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT16) {
      typedData = new Uint16Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT32) {
      typedData = new Uint32Array(niftiImage);
    }

    let minI, maxI;
    for (let i = 0; i < typedData.length; i++) {
      typedData[i] =
        typedData[i] * niftiHeader.scl_slope + niftiHeader.scl_inter;
      if (i === 0) {
        minI = typedData[i];
        maxI = typedData[i];
      } else {
        if (minI > typedData[i]) minI = typedData[i];

        if (maxI < typedData[i]) maxI = typedData[i];
      }
    }
    if (flipSlice) {
      const cols = niftiHeader.dims[1];
      const rows = niftiHeader.dims[2];
      const slices = niftiHeader.dims[3];
      const sliceSize = cols * rows;
      const middleRow = Math.floor(rows / 2);

      for (let s = 0; s < slices; s++) {
        for (let r = 0; r < middleRow; r++) {
          for (let c = 0; c < cols; c++) {
            const value = typedData[s * sliceSize + (rows - r - 1) * cols + c];
            typedData[s * sliceSize + (rows - r - 1) * cols + c] =
              typedData[s * sliceSize + r * cols + c];
            typedData[s * sliceSize + r * cols + c] = value;
          }
        }
      }
      console.log(cols, rows, middleRow, slices);
    }
    return typedData;
  }
}
async function convertNiftiToLabelMapData(toolGroupId, imageData) {
  const segmentationVolume = await volumeLoader.createAndCacheDerivedVolume(
    volumeId,
    {
      volumeId: segmentationId,
    }
  );
  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
  const scalarData = segmentationVolume.getScalarData();
  const { dimensions } = segmentationVolume;
  let voxelIndex = 0;
  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        scalarData[voxelIndex] = imageData[voxelIndex];
        voxelIndex++;
      }
    }
  }
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

async function addVolumeToStackViewport(viewport) {
  const actor = await createVolumeActor({ volumeId }, element1, viewportId);
  const actorUID = volumeId;

  const volumeActorEntry = {
    uid: actorUID,
    actor,
    slabThickness: undefined,
  };

  viewport.addActor(volumeActorEntry);
}

function createLabelMapData(toolGroupId) {
  fetch('/lungs.nii.gz')
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => {
      const imageData = openNiftiArrayBuffer(arrayBuffer);
      convertNiftiToLabelMapData(toolGroupId, imageData);
    });
}

async function getImageIds() {
  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  return { imageIds, imageIds2 };
}

function setupTools(toolGroupId) {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });
  toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: true });
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(SegmentationDisplayTool.toolName);

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Left Click
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
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  return toolGroup;
}
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';
  const toolGroup = setupTools(toolGroupId);

  const { imageIds, imageIds2 } = await getImageIds();
  const sortedImageIds = sortImageIds(imageIds2);
  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

  const viewType = 3;
  if (viewType === 1) {
    const viewportInputArray = [
      {
        viewportId: viewportId,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
          background: <Types.Point3>[0.2, 0, 0.2],
        },
      },
    ];
    renderingEngine.setViewports(viewportInputArray);

    // Set the tool group on the viewports
    toolGroup.addViewport(viewportId, renderingEngineId);
    // Set volumes on the viewports
    await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);

    renderingEngine.renderViewports([viewportId]);
    createLabelMapData(toolGroupId);
  } else if (viewType > 1) {
    const viewportInputArray = [
      {
        viewportId: viewportId,
        type: ViewportType.STACK,
        element: element1,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
          background: <Types.Point3>[0, 0, 0],
        },
      },
    ];

    renderingEngine.setViewports(viewportInputArray);

    // Set the tool group on the viewports
    toolGroup.addViewport(viewportId, renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack(sortedImageIds);

    if (viewType === 3) {
      renderingEngine.renderViewports([viewportId]);
      createLabelMapData(toolGroupId);
    } else {
      addVolumeToStackViewport(viewport);
      setTimeout(() => {
        setInitialPreset(viewport);
      }, 300);
    }
  }
  renderingEngine.render();
}

run();
