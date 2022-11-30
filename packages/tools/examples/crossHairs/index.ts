import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import loadRTStruct from './utils/loadStruct';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  CrosshairsTool,
  StackScrollMouseWheelTool,
  ZoomTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Crosshairs',
  'Here we demonstrate crosshairs linking three orthogonal views of the same data'
);

const size = '500px';
const content = document.getElementById('content');
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
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Click/Drag anywhere in the viewport to move the center of the crosshairs.
  - Drag a reference line to move it, scrolling the other views.

  Advanced controls: Hover over a line and find the following two handles:
  - Square (closest to center): Drag these to change the thickness of the MIP slab in that plane.
  - Circle (further from center): Drag these to rotate the axes.
  `;

content.append(instructions);

// ============================= //

const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';

const viewportColors = {
  [viewportId1]: 'rgb(200, 0, 0)',
  [viewportId2]: 'rgb(200, 200, 0)',
  [viewportId3]: 'rgb(0, 200, 0)',
};

const viewportReferenceLineControllable = [
  viewportId1,
  viewportId2,
  viewportId3,
];

const viewportReferenceLineDraggableRotatable = [
  viewportId1,
  viewportId2,
  viewportId3,
];

const viewportReferenceLineSlabThicknessControlsOn = [
  viewportId1,
  viewportId2,
  viewportId3,
];

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId) {
  const index = viewportReferenceLineControllable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineDraggableRotatable(viewportId) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
  return index !== -1;
}

function createPolyData(roiData, addClippingPlanes = false) {
  const pointList = roiData.pointsList;
  const polygon = vtkPolyData.newInstance();
  const pointArray = [];
  let index = 0;

  const lines = vtkCellArray.newInstance();

  for (let i = 0; i < pointList.length; i++) {
    const points = pointList[i].points;
    const lineArray = [];
    for (let j = 0; j < points.length; j++) {
      pointArray.push(points[j].x);
      pointArray.push(points[j].y);
      pointArray.push(points[j].z);

      lineArray.push(index + j);
    }
    // Uniting the last point with the first
    lineArray.push(index);
    lines.insertNextCell(lineArray);
    index = index + points.length;
  }
  polygon.getPoints().setData(Float32Array.from(pointArray), 3);
  polygon.setLines(lines);

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polygon);

  if (addClippingPlanes) {
    const clipPlane1 = vtkPlane.newInstance();
    const clipPlane2 = vtkPlane.newInstance();
    let clipPlane1Position = 0;
    let clipPlane2Position = 0;
    const clipPlane1Normal = [-1, 1, 0];
    const clipPlane2Normal = [0, 0, 1];

    const sizeX = 0;
    const sizeY = 10;
    clipPlane1Position = sizeX / 4;
    clipPlane2Position = sizeY / 2;
    const clipPlane1Origin = [
      clipPlane1Position * clipPlane1Normal[0],
      clipPlane1Position * clipPlane1Normal[1],
      clipPlane1Position * clipPlane1Normal[2],
    ];
    const clipPlane2Origin = [
      clipPlane2Position * clipPlane2Normal[0],
      clipPlane2Position * clipPlane2Normal[1],
      clipPlane2Position * clipPlane2Normal[2],
    ];

    clipPlane1.setNormal(clipPlane1Normal);
    clipPlane1.setOrigin(clipPlane1Origin);
    clipPlane2.setNormal(clipPlane2Normal);
    clipPlane2.setOrigin(clipPlane2Origin);
    mapper.addClippingPlane(clipPlane1);
    mapper.addClippingPlane(clipPlane2);
  }

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  return actor;
}

function getSphereActor({
  center,
  radius,
  phiResolution,
  thetaResolution,
  opacity,
  edgeVisibility,
}) {
  const sphereSource = vtkSphereSource.newInstance({
    center,
    radius,
    phiResolution,
    thetaResolution,
  });

  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  actor.getProperty().setEdgeVisibility(edgeVisibility);
  actor.getProperty().setOpacity(opacity);

  mapper.setInputConnection(sphereSource.getOutputPort());
  actor.setMapper(mapper);

  return actor;
}

const blendModeOptions = {
  MIP: 'Maximum Intensity Projection',
  MINIP: 'Minimum Intensity Projection',
  AIP: 'Average Intensity Projection',
};

addDropdownToToolbar({
  options: {
    values: [
      'Maximum Intensity Projection',
      'Minimum Intensity Projection',
      'Average Intensity Projection',
    ],
    defaultValue: 'Maximum Intensity Projection',
  },
  onSelectedValueChange: (selectedValue) => {
    let blendModeToUse;
    switch (selectedValue) {
      case blendModeOptions.MIP:
        blendModeToUse = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        break;
      case blendModeOptions.MINIP:
        blendModeToUse = Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
        break;
      case blendModeOptions.AIP:
        blendModeToUse = Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
        break;
      default:
        throw new Error('undefined orientation option');
    }

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    const crosshairsInstance = toolGroup.getToolInstance(
      CrosshairsTool.toolName
    );
    const oldConfiguration = crosshairsInstance.configuration;

    crosshairsInstance.configuration = {
      ...oldConfiguration,
      slabThicknessBlendMode: blendModeToUse,
    };

    // Update the blendMode for actors to instantly reflect the change
    toolGroup.viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as Types.IVolumeViewport;

      viewport.setBlendMode(blendModeToUse);
      viewport.render();
    });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(ZoomTool);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const StudyInstanceUID =
    '1.2.840.113619.2.278.3.3523880722.420.1464584245.596';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID: '1.2.840.113619.2.278.3.3523880722.420.1464584245.665',
    wadoRsRoot: 'http://localhost/dicom-web',
    type: 'VOLUME',
  });

  const RTSTRUCTId = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.2.246.352.205.5293987336505275805.4293842691528653980',
    wadoRsRoot: 'http://localhost/dicom-web',
    type: 'VOLUME',
  });

  const rtData = await loadRTStruct(RTSTRUCTId, imageIds);
  console.log(rtData);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  let type = ViewportType.PERSPECTIVE;
  const ortographic = true;
  if (ortographic) type = ViewportType.ORTHOGRAPHIC;

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  const viewportIds = [viewportId1, viewportId2, viewportId3];

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  // await setVolumesForViewports(
  //   renderingEngine,
  //   [
  //     {
  //       volumeId,
  //       callback: setCtTransferFunctionForVolumeActor,
  //     },
  //   ],
  //   [viewportId1, viewportId2, viewportId3]
  // );

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // For the crosshairs to operate, the viewports must currently be
  // added ahead of setting the tool active. This will be improved in the future.
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  // Manipulation Tools
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  // Add Crosshairs tool and configure it to link the three viewports
  // These viewports could use different tool groups. See the PET-CT example
  // for a more complicated used case.
  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  });

  toolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  // Render the image
  renderingEngine.renderViewports(viewportIds);
  const displaySphere = false;
  if (displaySphere) {
    setTimeout(() => {
      const toolCenter = [0, 0, -20];
      const actor = getSphereActor({
        center: toolCenter,
        radius: 300,
        phiResolution: 20,
        thetaResolution: 20,
        opacity: 1,
        edgeVisibility: true,
      });
      viewportIds.forEach((viewportId) => {
        const viewport = renderingEngine.getViewport(viewportId);
        viewport.addActor({ uid: 'spherePolyData', actor });
        // Render the image
        viewport.render();
        renderingEngine.render();
      }, 3000);

      renderingEngine.render();
    });
  } else {
    setTimeout(() => {
      const actor = createPolyData(rtData['CONTOUR EXTERNE']);
      viewportIds.forEach((viewportId) => {
        const viewport = renderingEngine.getViewport(viewportId);
        viewport.addActor({ uid: 'spherePolyData', actor });
        // Render the image
        viewport.render();
        renderingEngine.render();
      }, 3000);

      renderingEngine.render();
    });
  }
  renderingEngine.renderViewports(viewportIds);
}

run();
