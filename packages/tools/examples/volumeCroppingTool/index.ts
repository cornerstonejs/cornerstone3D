import type { Types } from '@cornerstonejs/core';
import {
  CONSTANTS,
  Enums,
  getRenderingEngine,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  addManipulationBindings,
  addSliderToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

import TrackballRotateTool from '../../src/tools/TrackballRotateTool';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager, Enums: csToolsEnums } = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportId = '3D_VIEWPORT';

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Cropping',
  'Here we demonstrate how to crop a 3D  volume along 6 planes.'
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

function setClippingPlane(planeIndex, origin) {
  const mapper = viewport.getDefaultActor().actor.getMapper();
  const clippingPlanes = mapper.getClippingPlanes();
  clippingPlanes[planeIndex].setOrigin(origin);
  viewport.setOriginalClippingPlane(planeIndex, origin);
  viewport.render();
}

// ============================= //
let viewport;

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  addManipulationBindings(toolGroup, {
    is3DViewport: true,
  });
  cornerstoneTools.addTool(cornerstoneTools.TrackballRotateTool);
  toolGroup.addTool(TrackballRotateTool.toolName);
  toolGroup.setToolActive(TrackballRotateTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.VOLUME_3D,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        //  background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  // Get the vtkImageData from the volume
  const imageData = volume.imageData;
  const dimensions = imageData.getDimensions(); // [xDim, yDim, zDim]
  console.log('Volume dimensions:', dimensions);

  // Log the world dimensions (physical size)
  const spacing = imageData.getSpacing(); // [xSpacing, ySpacing, zSpacing]
  const worldDimensions = [
    Math.round(dimensions[0] * spacing[0]),
    Math.round(dimensions[1] * spacing[1]),
    Math.round(dimensions[2] * spacing[2]),
  ];
  console.log('Volume world dimensions (mm):', worldDimensions);

  // Set the volume to load
  volume.load();
  viewport = renderingEngine.getViewport(viewportId);

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId]
  ).then(() => {
    viewport.setProperties({
      preset: 'CT-Bone',
    });
    const mapper = viewport.getDefaultActor().actor.getMapper();
    const xMin = worldDimensions[0] * -0.5;
    const xMax = worldDimensions[0] * 0.5;
    const yMin = worldDimensions[1] * -0.5;
    const yMax = worldDimensions[1] * 0.5;
    const zMin = -worldDimensions[2];
    const zMax = 0;
    const planes: vtkPlane[] = [];

    // X min plane (cuts everything left of xMin)
    const planeXmin = vtkPlane.newInstance({
      origin: [xMin, 0, 0],
      normal: [1, 0, 0],
    });
    mapper.addClippingPlane(planeXmin);
    addSliderToToolbar({
      title: ' x-min:  ' + xMin,
      range: [xMin, xMax],
      defaultValue: xMin,
      updateLabelOnChange(value, label) {
        label.innerText = ` x-min: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(0, [newDisplayThreshold, 0, 0]);
      },
    });
    planes.push(planeXmin);

    // X max plane (cuts everything right of xMax)
    const planeXmax = vtkPlane.newInstance({
      origin: [xMax, 0, 0],
      normal: [-1, 0, 0],
    });
    mapper.addClippingPlane(planeXmax);
    addSliderToToolbar({
      title: ' x-max: ' + xMax,
      range: [xMin, xMax],
      defaultValue: xMax,
      updateLabelOnChange(value, label) {
        label.innerText = ` x-max: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(1, [newDisplayThreshold, 0, 0]);
      },
    });
    planes.push(planeXmax);

    // Y min plane
    const planeYmin = vtkPlane.newInstance({
      origin: [0, yMin, 0],
      normal: [0, 1, 0],
    });
    addSliderToToolbar({
      title: ' y-min: ' + yMin,
      range: [yMin, yMax],
      defaultValue: yMin,
      updateLabelOnChange(value, label) {
        label.innerText = ` y-min: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(2, [0, newDisplayThreshold, 0]);
      },
    });
    mapper.addClippingPlane(planeYmin);
    planes.push(planeYmin);

    // Y max plane
    const planeYmax = vtkPlane.newInstance({
      origin: [0, yMax, 0],
      normal: [0, -1, 0],
    });
    mapper.addClippingPlane(planeYmax);
    addSliderToToolbar({
      title: ' y-max: ' + yMax,
      range: [yMin, yMax],
      defaultValue: yMax,
      updateLabelOnChange(value, label) {
        label.innerText = ` y-max: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(3, [0, newDisplayThreshold, 0]);
      },
    });
    planes.push(planeYmax);

    // Z min plane
    const planeZmin = vtkPlane.newInstance({
      origin: [0, 0, zMin],
      normal: [0, 0, 1],
    });
    mapper.addClippingPlane(planeZmin);
    addSliderToToolbar({
      title: ' z-min: ' + zMin,
      range: [zMin, zMax],
      defaultValue: zMin,
      updateLabelOnChange(value, label) {
        label.innerText = ` z-min: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(4, [0, 0, newDisplayThreshold]);
      },
    });
    planes.push(planeZmin);

    // Z max plane
    const planeZmax = vtkPlane.newInstance({
      origin: [0, 0, zMax],
      normal: [0, 0, -1],
    });
    mapper.addClippingPlane(planeZmax);
    addSliderToToolbar({
      title: ' z-max: ' + zMax,
      range: [zMin, zMax],
      defaultValue: zMax,
      updateLabelOnChange(value, label) {
        label.innerText = ` z-max: ${value} `;
      },
      onSelectedValueChange: (newDisplayThreshold) => {
        setClippingPlane(5, [0, 0, newDisplayThreshold]);
      },
    });
    planes.push(planeZmax);

    const originalPlanes = planes.map((plane) => ({
      origin: [...plane.getOrigin()],
      normal: [...plane.getNormal()],
    }));

    viewport.setOriginalClippingPlanes(originalPlanes);
    viewport.render();
  });
}

run();
