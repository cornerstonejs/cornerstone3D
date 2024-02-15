import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  camera as cameraHelpers,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Viewport API',
  'Demonstrates how to interact with a Volume viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

// TODO -> Maybe some of these implementations should be pushed down to some API

// Buttons
addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    viewport.setProperties({ voiRange: { lower: -1500, upper: 2500 } });
    viewport.render();
  },
});
addButtonToToolbar({
  title: 'Flip H',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Flip the viewport horizontally
    const { flipHorizontal } = viewport.getCamera();
    viewport.setCamera({ flipHorizontal: !flipHorizontal });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip V',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Flip the viewport vertically
    const { flipVertical } = viewport.getCamera();

    viewport.setCamera({ flipVertical: !flipVertical });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const { invert } = viewport.getProperties();

    viewport.setProperties({ invert: !invert }, volumeId);

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetCamera();

    // Get the current camera properties
    const camera = viewport.getCamera();

    const { parallelScale, position, focalPoint } =
      cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50);

    viewport.setCamera({
      parallelScale,
      position: <Types.Point3>position,
      focalPoint: <Types.Point3>focalPoint,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply random rotation',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Apply the rotation to the camera of the viewport
    viewport.setProperties({ rotation: Math.random() * 360 });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply colormap',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Apply the colormap to the viewport
    viewport.setProperties({ colormap: { name: 'hsv' } });

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

    // TODO reset the viewport properties, we don't have API for this.
    viewport.resetProperties(volumeId);
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

    let viewUp;
    let viewPlaneNormal;

    switch (selectedValue) {
      case orientationOptions.axial:
        viewport.setOrientation(Enums.OrientationAxis.AXIAL);

        break;
      case orientationOptions.sagittal:
        viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);

        break;
      case orientationOptions.coronal:
        viewport.setOrientation(Enums.OrientationAxis.CORONAL);
        break;
      case orientationOptions.oblique:
        // Some random oblique value for this dataset
        viewUp = [-0.5962687530844388, 0.5453181550345819, -0.5891448751239446];
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ];

        viewport.setCamera({ viewUp, viewPlaneNormal });
        viewport.resetCamera();

        break;
      default:
        throw new Error('undefined orientation option');
    }

    // TODO -> Maybe we should have a helper for this on the viewport
    // Set the new orientation
    // Reset the camera after the normal changes
    viewport.render();
  },
});

addSliderToToolbar({
  title: 'Slab Thickness',
  range: [0, 50],
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const valueAsNumber = Number(value);

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    viewport.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
    viewport.setProperties({ slabThickness: valueAsNumber });
    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
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

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport and it's default properties
  viewport
    .setVolumes([{ volumeId, callback: setCtTransferFunctionForVolumeActor }])
    .then(() => {
      viewport.setProperties({
        voiRange: { lower: -160, upper: 240 },
        VOILUTFunction: Enums.VOILUTFunctionType.LINEAR,
        colormap: { name: 'Grayscale' },
        slabThickness: 0.1,
      });
    });

  // Render the image
  viewport.render();
}

run();
