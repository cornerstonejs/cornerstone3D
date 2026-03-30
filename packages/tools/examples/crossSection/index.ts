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
import vtkImageReslice from '@kitware/vtk.js/Imaging/Core/ImageReslice';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import { vec3, mat4 } from 'gl-matrix';

const {
  CrossSectionSplineTool,
  PanTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
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
let currentPolyline = null;
let cprMapper = null;
let cprActor = null;
let cprViewport = null;
let resliceActor = null;
let resliceViewport = null;

const viewportIds = ['CT_VOLUME_SAGITTAL', 'CPR_STACK', 'CROSS_STACK'];

// ======== Set up page ======== //
setTitleAndDescription('Image CPR Mapper Tool', '');

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const cprElement = document.createElement('div');
const crossElement = document.createElement('div');
const sagittalElement = document.createElement('div');

crossElement.style.width = size;
crossElement.style.height = size;

cprElement.style.width = size;
cprElement.style.height = size;

sagittalElement.style.width = size;
sagittalElement.style.height = size;

// Disable right click context menu so we can have right click tool
crossElement.oncontextmenu = (e) => e.preventDefault();
cprElement.oncontextmenu = (e) => e.preventDefault();
sagittalElement.oncontextmenu = (e) => e.preventDefault();

// Append in the order we want them displayed: volume on the left, stack on the right
viewportGrid.appendChild(sagittalElement);
viewportGrid.appendChild(cprElement);
viewportGrid.appendChild(crossElement);

content.appendChild(viewportGrid);

function getPolylineCrossSection(
  inputVolume,
  polyline,
  index,
  viewPlaneNormal
) {
  const P_curr = polyline[index];
  const P_prev = polyline[Math.max(0, index - 1)];
  const P_next = polyline[Math.min(polyline.length - 1, index + 1)];

  // 1. Calcular Vetores do Frame Local
  const tangent = vec3.create();
  vec3.subtract(tangent, P_next, P_prev);
  vec3.normalize(tangent, tangent);

  const right = vec3.create();
  // Usamos o viewPlaneNormal da câmera para garantir que o 'Right' seja consistente com a visualização
  vec3.cross(right, tangent, viewPlaneNormal);
  vec3.normalize(right, right);

  const up = vec3.create();
  vec3.cross(up, tangent, right);
  vec3.normalize(up, up);

  // 2. Configurar Matriz 4x4 (Column-Major para gl-matrix)
  // Coluna 0: Right, Coluna 1: Up, Coluna 2: Tangent (Normal do plano), Coluna 3: Origin (P_curr)
  const resliceAxes = mat4.create();
  resliceAxes[0] = right[0];
  resliceAxes[1] = right[1];
  resliceAxes[2] = right[2];
  resliceAxes[3] = 0;
  resliceAxes[4] = up[0];
  resliceAxes[5] = up[1];
  resliceAxes[6] = up[2];
  resliceAxes[7] = 0;
  resliceAxes[8] = tangent[0];
  resliceAxes[9] = tangent[1];
  resliceAxes[10] = tangent[2];
  resliceAxes[11] = 0;
  resliceAxes[12] = P_curr[0];
  resliceAxes[13] = P_curr[1];
  resliceAxes[14] = P_curr[2];
  resliceAxes[15] = 1;

  const reslice = vtkImageReslice.newInstance();
  reslice.setInputData(inputVolume);
  reslice.setResliceAxes(resliceAxes);

  // Define o plano de saída: centrado na origem (0,0) do plano local
  // Para uma imagem de 200x200 com espaçamento 1mm, o centro é 100
  reslice.setOutputSpacing([1, 1, 1]);
  reslice.setOutputExtent([-100, 99, -100, 99, 0, 0]);
  reslice.setOutputOrigin([0, 0, 0]);

  reslice.update();
  return reslice.getOutputData();
}

addButtonToToolbar({
  title: 'CPR Mapper',
  onClick: () => {
    renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportIds[0]);
    if (!viewport) {
      return;
    }
    const annotations =
      getAnnotations(CrossSectionSplineTool.toolName, viewport.element) || [];
    if (annotations.length) {
      const lastAnnotation = annotations[annotations.length - 1];
      const contourPolyline = lastAnnotation.data.contour.polyline;

      // Ensure polyline is ordered top-to-bottom along Z-axis.
      // The CPRMapper requires consistent orientation regardless
      // of drawing direction (top-to-bottom vs bottom-to-top)
      if (contourPolyline[0][2] > contourPolyline.at(-1)[2]) {
        contourPolyline.reverse();
      }

      currentPolyline = contourPolyline;

      // Convert 2D array of [x, y, z] points into a flat 1D array for VTK
      // VTK expects coordinates as [x1, y1, z1, x2, y2, z2, ...]
      const polylineFlat = contourPolyline.flat();

      // Create or update centerline
      if (!centerline) {
        centerline = vtkPolyData.newInstance();
      }

      centerline.getPoints().setData(polylineFlat, 3);

      // Define connectivity for the centerline polyline in VTK format:
      const nPoints = polylineFlat.length / 3;
      const centerlineLines = new Uint16Array(1 + nPoints);
      centerlineLines[0] = nPoints;
      for (let i = 0; i < nPoints; ++i) {
        centerlineLines[i + 1] = i;
      }
      centerline.getLines().setData(centerlineLines);

      centerline.modified();

      // Configure mapper for Curved Planar Reformation (CPR)
      // Create mapper only once
      if (!cprMapper) {
        cprMapper = vtkImageCPRMapper.newInstance();
        cprMapper.setUseUniformOrientation(true);
        cprMapper.setUniformOrientation([0, 1, 0, 0]);

        const volumeActor = viewport.getDefaultActor().actor;
        const imageData = volumeActor.getMapper().getInputData();
        cprMapper.setInputData(imageData, 0);
        cprMapper.setWidth(500);
      }

      cprMapper.setInputData(centerline, 1);

      const stackViewport = <Types.IStackViewport>(
        renderingEngine.getViewport(viewportIds[1])
      );
      cprViewport = stackViewport;

      if (!cprActor) {
        cprActor = vtkImageSlice.newInstance();
        cprActor.setMapper(cprMapper);
        stackViewport.addActor({ actor: cprActor, uid: 'cprActor' });
      }

      const renderer = stackViewport.getRenderer();
      renderer.resetCamera();

      stackViewport.render();
    }
  },
});

addButtonToToolbar({
  title: 'ImageReslice CrossSection',
  onClick: () => {
    renderingEngine = getRenderingEngine(renderingEngineId);
    const volumeViewport = renderingEngine.getViewport(viewportIds[0]);
    const stackViewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportIds[2])
    );

    if (!volumeViewport || !stackViewport || !currentPolyline) {
      console.warn('Volume, stack viewport, or polyline not available');
      return;
    }

    resliceViewport = stackViewport;
    const volumeActor = volumeViewport.getDefaultActor()?.actor;
    if (!volumeActor) {
      return;
    }

    const imageData = volumeActor.getMapper().getInputData();
    const camera = volumeViewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal as [number, number, number];

    const currentConfig =
      toolGroup?.getToolConfiguration(CrossSectionSplineTool.toolName) || {};
    const idx =
      currentConfig?.perpendicularIndex || currentConfig?.calculatedIndex || 0;

    const crossSectionImageData = getPolylineCrossSection(
      imageData,
      currentPolyline,
      idx,
      viewPlaneNormal
    );

    const imageMapper = vtkImageMapper.newInstance();
    imageMapper.setInputData(crossSectionImageData);

    // Use o vtkImageMapper padrão do core
    if (!resliceActor) {
      const imageMapper = vtkImageMapper.newInstance();
      imageMapper.setInputData(crossSectionImageData);

      resliceActor = vtkImageSlice.newInstance();
      resliceActor.setMapper(imageMapper);
      stackViewport.addActor({ actor: resliceActor, uid: 'cross-section' });
    } else {
      resliceActor.getMapper().setInputData(crossSectionImageData);
    }
    stackViewport.resetCamera();
    stackViewport.render();
    console.log('ImageReslice cross-section initialized at index', idx);
  },
});

addButtonToToolbar({
  title: 'Prev',
  onClick: () => {
    if (!toolGroup) {
      return;
    }
    const currentConfig = toolGroup.getToolConfiguration(
      CrossSectionSplineTool.toolName
    );
    perpendicularIndex =
      (currentConfig?.perpendicularIndex ||
        currentConfig?.calculatedIndex ||
        0) - 1;
    toolGroup.setToolConfiguration(CrossSectionSplineTool.toolName, {
      perpendicularIndex,
    });
    console.log('Perpendicular index set to', perpendicularIndex);

    // Update reslice cross-section if active
    if (resliceViewport && currentPolyline) {
      const volumeViewport = renderingEngine.getViewport(viewportIds[0]);
      const volumeActor = volumeViewport?.getDefaultActor()?.actor;
      if (volumeActor) {
        const imageData = volumeActor.getMapper().getInputData();
        const camera = volumeViewport.getCamera();
        const viewPlaneNormal = camera.viewPlaneNormal as [
          number,
          number,
          number,
        ];

        const crossSectionImageData = getPolylineCrossSection(
          imageData,
          currentPolyline,
          Math.max(1, perpendicularIndex),
          viewPlaneNormal
        );

        if (resliceActor?.getMapper()) {
          resliceActor.getMapper().setInputData(crossSectionImageData);
          resliceViewport.render();
        }
      }
    }
  },
});

addButtonToToolbar({
  title: 'Next',
  onClick: () => {
    if (!toolGroup) {
      return;
    }
    const currentConfig = toolGroup.getToolConfiguration(
      CrossSectionSplineTool.toolName
    );
    perpendicularIndex =
      (currentConfig?.perpendicularIndex ||
        currentConfig?.calculatedIndex ||
        0) + 1;
    toolGroup.setToolConfiguration(CrossSectionSplineTool.toolName, {
      perpendicularIndex,
    });
    console.log('Perpendicular index set to', perpendicularIndex);

    // Update reslice cross-section if active
    if (resliceViewport && currentPolyline) {
      const volumeViewport = renderingEngine.getViewport(viewportIds[0]);
      const volumeActor = volumeViewport?.getDefaultActor()?.actor;
      if (volumeActor) {
        const imageData = volumeActor.getMapper().getInputData();
        const camera = volumeViewport.getCamera();
        const viewPlaneNormal = camera.viewPlaneNormal as [
          number,
          number,
          number,
        ];

        const crossSectionImageData = getPolylineCrossSection(
          imageData,
          currentPolyline,
          perpendicularIndex,
          viewPlaneNormal
        );

        if (resliceActor?.getMapper()) {
          resliceActor.getMapper().setInputData(crossSectionImageData);
          resliceViewport.render();
        }
      }
    }
  },
});

let toolGroup;
let perpendicularIndex = 0;

const toolGroupId = 'STACK_TOOL_GROUP_ID';

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(CrossSectionSplineTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(CrossSectionSplineTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  // Set the initial state of the tools.
  toolGroup.setToolActive(CrossSectionSplineTool.toolName, {
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
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.STACK,
      element: cprElement,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.STACK,
      element: crossElement,
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
    getNumberOfTuples: () => {
      const dimensions = voxelManager.dimensions;
      return dimensions[0] * dimensions[1] * dimensions[2];
    },
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
    getMTime: () => 0, // Required by VTK to track data updates
  });
}

run();
