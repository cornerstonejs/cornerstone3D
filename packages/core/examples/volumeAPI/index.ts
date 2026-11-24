import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';

const {
  PanTool,
  ZoomTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';
const displaySetId = 'volumeAPI:ct';
const toolGroupId = 'volumeAPIToolGroup';

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
element.style.width = '512px';
element.style.height = '512px';

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
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySetAppearance(displaySetId, {
      voiRange: { lower: -1500, upper: 2500 },
    });
    viewport.render();
  },
});
addButtonToToolbar({
  title: 'Flip H',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Flip the viewport horizontally
    const { flipHorizontal = false } = viewport.getViewState();
    viewport.setViewState({ flipHorizontal: !flipHorizontal });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip V',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Flip the viewport vertically
    const { flipVertical = false } = viewport.getViewState();

    viewport.setViewState({ flipVertical: !flipVertical });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const invert =
      viewport.getDisplaySetAppearance(displaySetId)?.invert ??
      viewport.getDefaultInvert(displaySetId) ??
      false;

    viewport.setDisplaySetAppearance(displaySetId, { invert: !invert });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetViewState();

    const presentation = cameraHelpers.getRandomZoomAndPanPresentation(
      viewport,
      50
    );
    const viewState =
      presentation && viewportProjection.withFraming(viewport, presentation);

    if (viewState) {
      viewport.setViewState(viewState);
    }
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply random rotation',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Apply the rotation to the camera of the viewport
    const viewState = viewportProjection.withFraming(viewport, {
      rotation: Math.random() * 360,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply colormap',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Apply the colormap to the viewport
    viewport.setDisplaySetAppearance(displaySetId, {
      colormap: { name: 'hsv' },
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
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetDisplaySetAppearance(displaySetId);
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
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

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
        viewUp = [
          -0.38790845665744467, -0.8382291511213861, -0.38327394832411943,
        ];
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ];

        viewport.setViewState({ orientation: { viewPlaneNormal, viewUp } });
        viewport.resetViewState({ resetOrientation: false });

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
  range: [0.05, 50],
  defaultValue: 0.05,
  onSelectedValueChange: (value) => {
    const valueAsNumber = Number(value);

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySetAppearance(displaySetId, {
      blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
      slabThickness: valueAsNumber,
    });
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

  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const imageIds = ctImageIds;

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      // orientation: Enums.OrientationAxis.SAGITTAL,
      // background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Primary },
      { mouseButton: MouseBindings.Wheel },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  element.addEventListener('contextmenu', (e) => e.preventDefault());

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport and it's default properties
  displaySetRegistry.add(displaySetId, {
    imageIds,
    volumeId,
  });

  await viewport.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
  viewport.setDisplaySetAppearance(displaySetId, ctPresentation());
  viewport.setDisplaySetAppearance(displaySetId, {
    voiRange: { lower: -160, upper: 240 },
    voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,
    colormap: { name: 'Grayscale' },
    slabThickness: 0.1,
  });

  // Render the image
  viewport.render();
}

run();
