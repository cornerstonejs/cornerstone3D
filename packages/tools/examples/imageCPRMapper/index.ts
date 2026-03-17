import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  utilities,
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
import vtkImageCPRMapper from '@kitware/vtk.js/Rendering/Core/ImageCPRMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PlanarFreehandROITool,
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
const renderingEngineId = 'myRenderingEngine';
let renderingEngine: RenderingEngine;

let centerline;

const viewportIds = ['CT_VOLUME_SAGITTAL', 'CT_STACK'];

// ======== Set up page ======== //
setTitleAndDescription('Image CPR Mapper Tool', '');

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tool
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

// Append in the order we want them displayed: volume on the left, stack on the right
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

addButtonToToolbar({
  title: 'CPR Mapper',
  onClick: () => {
    renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportIds[0]);
    if (!viewport) {
      return;
    }
    const annotations =
      getAnnotations(PlanarFreehandROITool.toolName, viewport.element) || [];
    if (annotations.length) {
      const lastAnnotation = annotations[annotations.length - 1];
      const polylineFlat = lastAnnotation.data.contour.polyline.flat();

      centerline = vtkPolyData.newInstance();
      const nPoints = polylineFlat.length / 3;
      centerline.getPoints().setData(polylineFlat, 3);

      // Set polylines of the centerline
      const centerlineLines = new Uint16Array(1 + nPoints);
      centerlineLines[0] = nPoints;
      for (let i = 0; i < nPoints; ++i) {
        centerlineLines[i + 1] = i;
      }
      centerline.getLines().setData(centerlineLines);

      centerline.modified();

      // Defining const orientation for all points
      const mapper = vtkImageCPRMapper.newInstance();
      mapper.setUseUniformOrientation(true);
      mapper.setUniformOrientation([0, 1, 0, 0]);

      const volumeActor = viewport.getDefaultActor().actor;
      const imageData = volumeActor.getMapper().getInputData();
      mapper.setInputData(imageData, 0);
      mapper.setInputData(centerline, 1);
      mapper.setWidth(500);

      const stackViewport = <Types.IStackViewport>(
        renderingEngine.getViewport(viewportIds[1])
      );
      const actor = vtkImageSlice.newInstance();
      actor.setMapper(mapper);
      stackViewport.setActors([{ uid: 'cprActor', actor: actor }]);

      const renderer = stackViewport.getRenderer();
      renderer.resetCamera();

      stackViewport.render();
    }
  },
});

addButtonToToolbar({
  title: 'Clear All',
  onClick: () => {
    const annotationManager = annotation.state.getAnnotationManager();
    annotationManager.removeAllAnnotations();

    const stackViewport = renderingEngine.getViewport(
      viewportIds[1]
    ) as Types.IStackViewport;
    if (stackViewport) {
      stackViewport.setActors([]);
    }

    renderingEngine.renderViewports(viewportIds);
  },
});

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandROITool.toolName, { cachedStats: true });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
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

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Create a stack and a volume viewport
  // Match the order of viewportIds and DOM elements for left-to-right rendering
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.STACK,
      element: element1,
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

  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]).then(() => {
    prepareImageDataForPicking(volumeViewport);
  });

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

/**
 * Creates the minimum infrastructure needed to pick a point in the 3D volume
 * with VTK.js
 * @remarks
 * @param viewport
 * @returns
 */
function prepareImageDataForPicking(viewport: Types.IVolumeViewport) {
  const volumeActor = viewport.getDefaultActor()?.actor;
  if (!volumeActor) {
    return;
  }
  // Get the imageData from the volumeActor
  const imageData = volumeActor.getMapper().getInputData();

  if (!imageData) {
    console.error('No imageData found in the volumeActor');
    return null;
  }

  // Get the voxelManager from the imageData
  const { voxelManager } = imageData.get('voxelManager');

  if (!voxelManager) {
    console.error('No voxelManager found in the imageData');
    return imageData;
  }

  // Create a fake scalar object to expose the scalar data to VTK.js
  const fakeScalars = {
    getData: () => {
      return voxelManager.getCompleteScalarDataArray();
    },
    getNumberOfComponents: () => voxelManager.numberOfComponents,
    getDataType: () =>
      voxelManager.getCompleteScalarDataArray().constructor.name,
    getMTime: () => 0,
    getRange: () => {
      const { min, max } = utilities.getMinMax(
        voxelManager.getCompleteScalarDataArray()
      );
      return [min, max];
    },
  };

  // Set the point data to return the fakeScalars
  imageData.setPointData({
    getScalars: () => fakeScalars,
    getMTime: () => 0, // Add getMTime to avoid VTK.js error
  });
}

run();
