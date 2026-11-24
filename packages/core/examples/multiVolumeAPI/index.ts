import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  eventTarget,
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
} from '../../../../utils/demo/helpers';
import { petColorMapPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';

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
const toolGroupId = 'myToolGroup';

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const ctDisplaySetId = 'multiVolumeAPI:ct';
const ptDisplaySetId = 'multiVolumeAPI:pt';

/**
 * The opacity of the PET layer at the start. The legacy example set 0.85,
 * which a legacy volume viewport drew on a slice as 1 - (1 - 0.85) ** 0.125,
 * about 0.21. A next viewport draws an opacity as given.
 */
const PET_DEFAULT_OPACITY = 0.2;

/**
 * The SUV below which the PET layer is clear at the start: the first value
 * that the PET callback of the legacy example gave an opacity.
 */
const PET_DEFAULT_THRESHOLD = 0.1;

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Viewport API With Multiple Volumes',
  'Demonstrates how to interact with a Volume viewport when using fusion.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

// Create element to display colormap event details
const eventDetailsElement = document.createElement('div');
eventDetailsElement.id = 'event-details';
eventDetailsElement.style.margin = '10px';
eventDetailsElement.style.padding = '10px';
eventDetailsElement.style.border = '1px solid #ccc';
eventDetailsElement.style.backgroundColor = '#f8f8f8';
eventDetailsElement.style.fontFamily = 'monospace';
eventDetailsElement.style.maxHeight = '150px';
eventDetailsElement.style.overflow = 'auto';
eventDetailsElement.innerText = 'Colormap modification events will appear here';

content.appendChild(eventDetailsElement);
// ============================= //

addSliderToToolbar({
  title: 'Opacity',
  range: [0, 1],
  step: 0.05,
  defaultValue: PET_DEFAULT_OPACITY,
  onSelectedValueChange: (value) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySetPresentation(ptDisplaySetId, {
      colormap: { opacity: Number(value) },
    });
    viewport.render();
  },
});

// New slider for PET threshold
addSliderToToolbar({
  title: 'PET Threshold',
  range: [0, 5],
  step: 0.1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const threshold = Number(value);

    viewport.setDisplaySetPresentation(
      ptDisplaySetId,
      threshold > 0 ? { colormap: { threshold } } : { colormap: {} }
    );
    viewport.render();
  },
});

// Buttons
addButtonToToolbar({
  title: 'Set CT VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySetPresentation(ctDisplaySetId, {
      voiRange: { lower: -1500, upper: 2500 },
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

    // Resets the viewport's camera
    viewport.resetViewState();

    viewport.render();
  },
});

const fused = false;

addButtonToToolbar({
  title: 'toggle PET',
  onClick: async () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    await viewport.addDisplaySet(ptDisplaySetId, { role: 'overlay' });
    viewport.resetDisplaySetPresentation(ptDisplaySetId);
    viewport.setDisplaySetPresentation(
      ptDisplaySetId,
      petColorMapPresentation()
    );
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
          -0.43474846290129526, 0.39759962008252653, 0.8080274228732535,
        ];
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ];

        viewport.setViewState({ orientation: { viewPlaneNormal, viewUp } });
        viewport.resetViewState({ resetOrientation: false });
        break;
    }

    viewport.render();
  },
});

// Add event listener for colormap modification
function addColormapEventListener() {
  element.addEventListener(Enums.Events.COLORMAP_MODIFIED, function (event) {
    const { volumeId, colormap } = event.detail;
    if (volumeId === ptVolumeId) {
      const opacity = colormap.opacity; // Second value is max opacity
      const threshold = colormap.threshold;

      // get the max opacity from value
      const opacityToUse = Array.isArray(opacity)
        ? opacity.reduce((max, current) => Math.max(max, current.opacity), 0)
        : opacity;

      const details: Record<string, string> = {
        type: 'Colormap Modified',
        volumeId,
        opacity: opacityToUse.toFixed(2),
        timestamp: new Date().toLocaleTimeString(),
      };

      if (typeof threshold === 'number') {
        details.threshold = threshold.toFixed(2);
      }

      eventDetailsElement.innerText = JSON.stringify(details, null, 2);
    }
  });
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  // Set up interaction tools
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

  // Setup event listener for colormap modifications
  addColormapEventListener();

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Set the volume to load
  await ctVolume.load();

  // Render the image
  renderingEngine.render();

  // Load the PT in the background as we know we'll need it

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Set the volume to load
  await ptVolume.load();

  // Set the volume on the viewport
  displaySetRegistry.add(ctDisplaySetId, {
    imageIds: ctImageIds,
    volumeId: ctVolumeId,
  });
  displaySetRegistry.add(ptDisplaySetId, {
    imageIds: ptImageIds,
    volumeId: ptVolumeId,
  });

  await viewport.setDisplaySets(
    { displaySetId: ctDisplaySetId },
    { displaySetId: ptDisplaySetId }
  );
  viewport.setDisplaySetPresentation(ptDisplaySetId, {
    voiRange: petColorMapPresentation().voiRange,
    colormap: {
      name: 'hsv',
      opacity: PET_DEFAULT_OPACITY,
      threshold: PET_DEFAULT_THRESHOLD,
    },
  });

  viewport.render();
}

run();
