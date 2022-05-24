import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Non Volume Actor in Volume Viewport API',
  'Demonstrates how to interact with a Volume viewport with non volume actors.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

addButtonToToolbar({
  title: 'Apply Zoom',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Get the current camera properties
    const camera = viewport.getCamera();

    const parallelScale = camera.parallelScale * 0.5;

    viewport.setCamera({
      parallelScale,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply UnZoom',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Get the current camera properties
    const camera = viewport.getCamera();

    const parallelScale = camera.parallelScale * 2;

    viewport.setCamera({
      parallelScale,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Resets the viewport's camera
    viewport.resetCamera();
    // TODO reset the viewport properties, we don't have API for this.

    viewport.render();
  },
});

const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
  oblique: 'oblique',
};

addDropdownToToolbar({
  options: {
    values: ['axial', 'sagittal', 'coronal', 'oblique'],
    defaultValue: 'sagittal',
  },
  onSelectedValueChange: (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // TODO -> Maybe we should rename sliceNormal to viewPlaneNormal everywhere?
    let viewUp;
    let viewPlaneNormal;

    switch (selectedValue) {
      case orientationOptions.axial:
        viewUp = ORIENTATION.AXIAL.viewUp;
        viewPlaneNormal = ORIENTATION.AXIAL.sliceNormal;

        break;
      case orientationOptions.sagittal:
        viewUp = ORIENTATION.SAGITTAL.viewUp;
        viewPlaneNormal = ORIENTATION.SAGITTAL.sliceNormal;

        break;
      case orientationOptions.coronal:
        viewUp = ORIENTATION.CORONAL.viewUp;
        viewPlaneNormal = ORIENTATION.CORONAL.sliceNormal;

        break;
      case orientationOptions.oblique:
        // Some random oblique value for this dataset
        viewUp = [-0.5962687530844388, 0.5453181550345819, -0.5891448751239446];
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ];

        break;
      default:
        throw new Error('undefined orientation option');
    }

    // TODO -> Maybe we should have a helper for this on the viewport
    // Set the new orientation
    viewport.setCamera({ viewUp, viewPlaneNormal });
    // Reset the camera after the normal changes
    viewport.resetCamera();
    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: ORIENTATION.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  const sphereSource = vtkSphereSource.newInstance();
  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  actor.getProperty().setEdgeVisibility(true);

  mapper.setInputConnection(sphereSource.getOutputPort());
  actor.setMapper(mapper);

  const nonVolumeActors = [];
  nonVolumeActors.push({ uid: 'spherePolyData', actor });

  viewport.addActors(nonVolumeActors);

  // Render the image
  viewport.render();
}

run();
