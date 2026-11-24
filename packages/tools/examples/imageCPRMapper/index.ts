import type {
  VolumeViewport3D,
  PlanarViewport,
  Types,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  cache,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import { getAnnotations } from '../../src/stateManagement/annotation/annotationState';

import * as cornerstoneTools from '@cornerstonejs/tools';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageCPRMapper from '@kitware/vtk.js/Rendering/Core/ImageCPRMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';

const {
  SplineROITool,
  PanTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const volumeDisplaySetId = 'CT_VOLUME_DISPLAY_SET';
const renderingEngineId = 'myRenderingEngine';
let renderingEngine: RenderingEngine;

let centerline;
let cprActor: vtkImageSlice;

const viewportIds = ['CT_VOLUME_SAGITTAL', 'CT_STACK'];

// ======== Set up page ======== //
setTitleAndDescription('Image CPR Mapper Tool', '');

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const cprElement = document.createElement('div');
const sagittalElement = document.createElement('div');
cprElement.style.width = size;
cprElement.style.height = size;
sagittalElement.style.width = size;
sagittalElement.style.height = size;

// Disable right click context menu so we can have right click tool
cprElement.oncontextmenu = (e) => e.preventDefault();
sagittalElement.oncontextmenu = (e) => e.preventDefault();

// Append in the order we want them displayed: volume on the left, stack on the right
viewportGrid.appendChild(sagittalElement);
viewportGrid.appendChild(cprElement);

content.appendChild(viewportGrid);

addButtonToToolbar({
  title: 'CPR Mapper',
  onClick: () => {
    renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(
      viewportIds[0]
    );
    if (!viewport) {
      return;
    }
    const annotations = getAnnotations(toolsNames[0], viewport.element) || [];
    if (annotations.length) {
      const lastAnnotation = annotations[annotations.length - 1];
      const contourPolyline = lastAnnotation.data.contour.polyline;
      // Ensure polyline is ordered top-to-bottom along Z-axis.
      // The CPRMapper requires consistent orientation regardless
      // of drawing direction (top-to-bottom vs bottom-to-top)
      if (contourPolyline[0][2] > contourPolyline.at(-1)[2]) {
        contourPolyline.reverse();
      }

      // Convert 2D array of [x, y, z] points into a flat 1D array for VTK
      // VTK expects coordinates as [x1, y1, z1, x2, y2, z2, ...]
      const polylineFlat = contourPolyline.flat();

      centerline = vtkPolyData.newInstance();
      const nPoints = polylineFlat.length / 3;
      centerline.getPoints().setData(polylineFlat, 3);

      // Define connectivity for the centerline polyline in VTK format:
      const centerlineLines = new Uint16Array(1 + nPoints);
      centerlineLines[0] = nPoints;
      for (let i = 0; i < nPoints; ++i) {
        centerlineLines[i + 1] = i;
      }
      centerline.getLines().setData(centerlineLines);

      centerline.modified();

      // Configure mapper for Curved Planar Reformation (CPR)
      // Uniform orientation [0, 1, 0, 0] applies same viewing direction (Y-axis)
      // to all points along the centerline, creating orthogonal cross-sections
      const mapper = vtkImageCPRMapper.newInstance();
      mapper.setUseUniformOrientation(true);
      mapper.setUniformOrientation([0, 1, 0, 0]);

      const imageData = createImageDataForCPR(cache.getVolume(volumeId));
      mapper.setInputData(imageData, 0);
      mapper.setInputData(centerline, 1);
      mapper.setWidth(500);

      const cprViewport = renderingEngine.getViewport<VolumeViewport3D>(
        viewportIds[1]
      );
      const actor = vtkImageSlice.newInstance();
      actor.setMapper(mapper);

      const renderer = cprViewport.getRenderer();
      if (cprActor) {
        renderer.removeActor(cprActor);
      }
      renderer.addActor(actor);
      cprActor = actor;

      cprViewport.resetViewState();
      cprViewport.render();
    }
  },
});

const toolGroupId = 'STACK_TOOL_GROUP_ID';
const Splines = {
  CatmullRomSplineROI: {
    splineType: SplineROITool.SplineTypes.CatmullRom,
  },
};

const SplineToolNames = Object.keys(Splines);
const toolsNames = [...SplineToolNames];
let toolName = toolsNames[0];

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SplineROITool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addToolInstance('CatmullRomSplineROI', SplineROITool.toolName, {
    spline: {
      type: SplineROITool.SplineTypes.CatmullRom,
    },
  });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(toolsNames[0], {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // Allow drawing incomplete splines without requiring closure
  // Useful for defining paths that don't need to form a closed loop
  toolGroup.setToolConfiguration(toolName, {
    allowOpenSplines: true,
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

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Create a planar viewport for the volume and a 3D viewport for the CPR
  // Match the order of viewportIds and DOM elements for left-to-right rendering
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.PLANAR,
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.VOLUME_3D,
      element: cprElement,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  const volumeViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds[0]
  );

  renderingEngine
    .getViewport<VolumeViewport3D>(viewportIds[1])
    .setViewState({ viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] });

  // Set the volume to load
  volume.load();

  displaySetRegistry.add(volumeDisplaySetId, {
    imageIds: volumeImageIds,
    volumeId,
  });

  // Set the volume on the viewport
  volumeViewport.setDisplaySets({ displaySetId: volumeDisplaySetId });

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

/**
 * Makes the vtk.js image data that the CPR mapper reads: the geometry of the
 * volume, with its voxels as scalars. The volume keeps its voxels in its
 * voxel manager, and its own image data, which the viewport draws, has no
 * scalars, so the CPR mapper gets an image data of its own.
 *
 * @param volume - The volume of the cache
 * @returns The image data for the CPR mapper
 */
function createImageDataForCPR(volume: Types.IImageVolume) {
  const { voxelManager } = volume;
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(volume.dimensions);
  imageData.setSpacing(volume.spacing);
  imageData.setOrigin(volume.origin);
  imageData.setDirection(volume.direction);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      numberOfComponents: voxelManager.numberOfComponents,
      values: voxelManager.getCompleteScalarDataArray(),
    })
  );

  return imageData;
}

run();
