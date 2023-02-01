import { RenderingEngine, Types, Enums, CONSTANTS } from '@cornerstonejs/core';
import { setTitleAndDescription } from '../../../../utils/demo/helpers';
import { init as csRenderInit } from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'POLYDATA_SAGITTAL';

// ======== Set up page ======== //
setTitleAndDescription(
  'Poly Data Actor in a Volume Viewport',
  'Demonstrates how to render poly data with a Volume viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

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

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await csRenderInit();
  await csToolsInit();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  const actor = getSphereActor({
    center: [0, 0, 0],
    radius: 1,
    phiResolution: 20,
    thetaResolution: 20,
    opacity: 1,
    edgeVisibility: true,
  });

  viewport.setActors([{ uid: 'spherePolyData', actor }]);

  // Render the image
  viewport.render();
}

run();
