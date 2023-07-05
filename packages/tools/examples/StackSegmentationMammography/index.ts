import { vec3 } from 'gl-matrix';
import {
  Enums,
  RenderingEngine,
  Types,
  metaData,
  CONSTANTS,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

const { colormap: colormapUtils } = utilities;

const { CPU_COLORMAPS } = CONSTANTS;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK_VIEWPORT';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segmentation in StackViewport',
  'Here we demonstrate how to render a segmentation in StackViewport with a mammography image.'
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

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = 'Click the image to rotate it.';

content.append(instructions);

async function getImageIds() {
  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  return imageIds;
}

function setupTools(toolGroupId) {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(StackScrollMouseWheelTool.toolName, { loop: true });
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(SegmentationDisplayTool.toolName);

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

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
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidSegmentation(dimensions, scalarData) {
  const center = [dimensions[0] / 2, dimensions[1] / 2, 0];
  const outerRadius = 512;
  const innerRadius = 256;

  let voxelIndex = 0;

  for (let z = 0; z < 1; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 50;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 100;
        }
        voxelIndex++;
      }
    }
  }
}

function getImageInfo(imageId: string) {
  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

  let rowCosines, columnCosines;

  rowCosines = <Types.Point3>imagePlaneModule.rowCosines;
  columnCosines = <Types.Point3>imagePlaneModule.columnCosines;

  // if null or undefined
  if (rowCosines == null || columnCosines == null) {
    rowCosines = <Types.Point3>[1, 0, 0];
    columnCosines = <Types.Point3>[0, 1, 0];
  }

  const rowCosineVec = vec3.fromValues(
    rowCosines[0],
    rowCosines[1],
    rowCosines[2]
  );
  const colCosineVec = vec3.fromValues(
    columnCosines[0],
    columnCosines[1],
    columnCosines[2]
  );
  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  let origin = imagePlaneModule.imagePositionPatient;
  // if null or undefined
  if (origin == null) {
    origin = [0, 0, 0];
  }

  const xSpacing = imagePlaneModule.columnPixelSpacing;
  const ySpacing = imagePlaneModule.rowPixelSpacing;
  const xVoxels = imagePlaneModule.columns;
  const yVoxels = imagePlaneModule.rows;

  // Note: For rendering purposes, we use the EPSILON as the z spacing.
  // This is purely for internal implementation logic since we are still
  // technically rendering 3D objects with vtk.js, but the abstracted intention
  //  of the stack viewport is to render 2D images
  const zSpacing = 1;
  const zVoxels = 1;

  return {
    origin,
    direction: [
      ...rowCosineVec,
      ...colCosineVec,
      ...scanAxisNormal,
    ] as Types.Mat3,
    dimensions: [xVoxels, yVoxels, zVoxels],
    spacing: [xSpacing, ySpacing, zSpacing],
    numVoxels: xVoxels * yVoxels * zVoxels,
  };
}

function createVTKImageData(imageId: string): vtkImageDataType {
  const { origin, direction, dimensions, spacing, numVoxels } =
    getImageInfo(imageId);
  const values = new Uint8Array(numVoxels);
  createMockEllipsoidSegmentation(dimensions, values);

  // Todo: I guess nothing should be done for use16bit?
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: values,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);
  return imageData;
}

function setColorMap(actor) {
  const properties = actor.getProperty();
  const opacity = 0.9;
  const bogusMethod = true;
  if (bogusMethod) {
    const opacity_tf = vtkPiecewiseFunction.newInstance();
    const color_tf = vtkColorTransferFunction.newInstance();

    color_tf.addRGBPoint(0, 0, 0, 0);
    opacity_tf.addPoint(0, 0);

    color_tf.addRGBPoint(1, 255, 0, 0);
    opacity_tf.addPoint(1, opacity);

    color_tf.addRGBPoint(2, 0, 255, 0);
    opacity_tf.addPoint(2, opacity);

    color_tf.addRGBPoint(3, 0, 0, 255);
    opacity_tf.addPoint(3, opacity);

    properties.setRGBTransferFunction(0, color_tf);
    properties.setScalarOpacity(0, opacity_tf);
  } else {
    const name = 'hotIron';
    const cfun = vtkColorTransferFunction.newInstance();
    let colormapObj = colormapUtils.getColormap(name);

    if (!colormapObj) {
      colormapObj = vtkColorMaps.getPresetByName(name);
    }

    if (!colormapObj) {
      throw new Error(`Colormap ${name} not found`);
    }

    cfun.applyColorMap(colormapObj);
    cfun.setMappingRange(0, 255);
    properties.setRGBTransferFunction(0, cfun);
  }
}

function createActorMapper(imageId): vtkImageSlice {
  const imageData = createVTKImageData(imageId);

  const mapper = vtkImageMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkImageSlice.newInstance();

  actor.setMapper(mapper);

  if (imageData.getPointData().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }
  setColorMap(actor);

  return actor;
}
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';
  const toolGroup = setupTools(toolGroupId);

  const imageIds = await getImageIds();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
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
  toolGroup.addViewport(viewportId, renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);
  await viewport.setStack(imageIds);

  const actor = createActorMapper(imageIds[0]);
  const actorUID = 'segmentationMG';
  viewport.addActor({ actor, uid: actorUID });

  // const actorEntries = viewport.getActors();
  // actorEntries.forEach((actorEntry) => {
  //   const mapper = actorEntry.actor.getMapper();
  //   mapper.setBlendMode(3);
  // });

  // Render the image
  renderingEngine.renderViewports([viewportId]);
}

run();
