import resemble from 'resemblejs';
import { fakeImageLoader, fakeMetaDataProvider } from './testUtilsImageLoader';
import { fakeVolumeLoader } from './testUtilsVolumeLoader';
import { createNormalizedMouseEvent } from './testUtilsMouseEvents';
import { fillStackSegmentationWithMockData } from './fillStackSegmentationWithMockData';
import { fillVolumeLabelmapWithMockData } from './fillVolumeLabelmapWithMockData';
import { addMockContourSegmentation } from './addMockContourSegmentation';
import {
  Enums,
  utilities,
  init,
  cache,
  metaData,
  RenderingEngine,
  imageLoader,
  volumeLoader,
  eventTarget,
  getRenderingEngine,
  init as initCore,
  setUseCPURendering,
  getRenderingEngines,
} from '@cornerstonejs/core';
import {
  init as initTools,
  addTool,
  ToolGroupManager,
  SynchronizerManager,
  destroy,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';

function setupTestEnvironment({
  renderingEngineId = utilities.uuidv4(),
  toolGroupIds = ['default'],
  tools = [],
  toolConfigurations = {},
  toolActivations = {},
  viewportIds = [],
  options = {},
} = {}) {
  // Initialize csTools3d and add specified tools
  window.devicePixelRatio = 1;

  initCore();
  initTools();
  tools.forEach((tool) => addTool(tool));

  // Clear cache and reset metadata
  cache.purgeCache();
  metaData.removeAllProviders();

  // Create rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Register common loaders
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);

  // Add metadata providers
  metaData.addProvider(utilities.calibratedPixelSpacingMetadataProvider.get);
  metaData.addProvider(utilities.genericMetadataProvider.get);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  // Create tool groups
  const toolGroups = {};
  toolGroupIds.forEach((groupId, index) => {
    const toolGroup = ToolGroupManager.createToolGroup(groupId);
    toolGroups[groupId] = toolGroup;

    // Add tools to each group
    tools.forEach((tool) => {
      const toolName = tool.toolName || tool.name;
      const configuration = toolConfigurations[toolName] || {};
      toolGroup.addTool(toolName, configuration);

      if (toolActivations[toolName]) {
        toolGroup.setToolActive(toolName, toolActivations[toolName]);
      }
    });

    viewportIds.forEach((viewportId) => {
      toolGroup.addViewport(viewportId);
    });
  });

  return {
    renderingEngine,
    toolGroups,
  };
}

function cleanupTestEnvironment(options = {}) {
  console.debug('running cleanupTestEnvironment');
  const {
    renderingEngineId,
    toolGroupIds = [],
    synchronizerId,
    removeMetadataProvider = true,
    unregisterImageLoaders = true,
    cleanupDOMElements = true,
  } = options;

  // Clear the cache
  cache.purgeCache();
  destroy();

  // Destroy the rendering engine
  if (renderingEngineId) {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      renderingEngine.destroy();
    }
  }

  // remove all rendering engines
  getRenderingEngines().forEach((renderingEngine) => {
    renderingEngine.destroy();
  });

  // Remove the metadata provider
  if (removeMetadataProvider && metaData) {
    metaData.removeProvider(fakeMetaDataProvider);
    metaData.removeProvider(utilities.calibratedPixelSpacingMetadataProvider);
  }

  // Unregister all image loaders
  if (unregisterImageLoaders && imageLoader) {
    imageLoader.unregisterAllImageLoaders();
  }

  // Destroy the tool groups
  const allToolGroups = ToolGroupManager.getAllToolGroups();

  allToolGroups.forEach((toolGroup) => {
    ToolGroupManager.destroyToolGroup(toolGroup.id);
  });

  // Destroy the synchronizer
  if (SynchronizerManager && synchronizerId) {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    SynchronizerManager.destroy();
  }

  // Reset the event target
  if (eventTarget) {
    eventTarget.reset();
  }

  // purge cache
  cache.purgeCache();

  const ONE_GB = 1073741824;

  cache.setMaxCacheSize(ONE_GB);
  setUseCPURendering(false);

  // Clean up DOM elements
  if (cleanupDOMElements) {
    const elementsToRemove = [
      ...document.querySelectorAll('.viewport-element'),
      ...document.querySelectorAll('svg'),
      ...document.querySelectorAll('canvas'),
      ...document.querySelectorAll('div'),

      // anything with class of cornerstone-canvas
      ...document.querySelectorAll('.cornerstone-canvas'),
    ];
    elementsToRemove.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  }
}

function createViewports(renderingEngine, options = {}, count = 1) {
  const optionsArray = Array.isArray(options) ? options : [options];

  const elements = [];
  const viewports = [];
  let enabledByEnableElement = false;

  for (let i = 0; i < optionsArray.length; i++) {
    const {
      viewportType = Enums.ViewportType.STACK,
      width = 400,
      height = 400,
      orientation = Enums.OrientationAxis.AXIAL,
      background = [1, 0, 1], // pinkish background
      useEnableElement = false,
      viewportId = `viewport${i + 1}`,
    } = optionsArray[i] || {};

    const element = document.createElement('div');
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    document.body.appendChild(element);

    const viewportConfig = {
      viewportId,
      type: viewportType,
      element,
      defaultOptions: {
        background,
        orientation,
      },
    };

    if (orientation) {
      viewportConfig.defaultOptions.orientation = orientation;
    }

    if (useEnableElement) {
      renderingEngine.enableElement(viewportConfig);
      enabledByEnableElement = true;
    }

    elements.push(element);
    viewports.push(viewportConfig);
  }

  if (!enabledByEnableElement) {
    renderingEngine.setViewports(viewports);
  }

  return elements.length === 1 ? elements[0] : elements;
}

/**
 * TestUtils: used for colorizing the image and comparing it to a baseline,
 * should not be used for development.
 */
const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [128, 0, 0],
  [0, 0, 255],
  [0, 128, 0],
  [255, 255, 0],
  [0, 255, 255],
  [0, 0, 0],
  [0, 0, 128],
  [255, 0, 255],
];

Object.freeze(colors);

/**
 * Compares images or signals to update baselines based on the updateBaselines parameter.
 * @param {string} imageDataURL - The rendered imageDataURL
 * @param {string} baseline - Baseline imageDataURL - imported png in the test files
 * @param {string} outputName - The name of the image for logging
 * @param {boolean} updateBaselines - Whether to update baselines instead of comparing
 * @returns A promise.
 */
function compareImages(
  imageDataURL,
  baseline,
  outputName,
  updateBaselines = true
) {
  if (updateBaselines) {
    console.debug(`[Update Baseline]`);
    console.debug(`${outputName}: ${imageDataURL}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    resemble.outputSettings({
      useCrossOrigin: false,
      errorColor: {
        red: 0,
        green: 255,
        blue: 0,
      },
      transparency: 0.5,
      largeImageThreshold: 1200,
      outputDiff: true,
    });

    resemble(baseline.default)
      .compareTo(imageDataURL)
      .onComplete((data) => {
        const mismatch = parseFloat(data.misMatchPercentage);
        // If the error is greater than 1%, fail the test
        // and download the difference image
        // Todo: this should be a configurable threshold
        if (mismatch > 1) {
          console.warn('mismatch of', mismatch, '% to image', imageDataURL);
          const diff = data.getImageDataUrl();
          // Todo: we should store the diff image somewhere
          reject(
            new Error(
              `mismatch of ${mismatch} between images for ${outputName},
              the diff image is: \n\n ${diff} \n\n`
            )
          );
          // reject(new Error(`mismatch between images for ${outputName}\n mismatch: ${mismatch}\n ${baseline.default}\n ${imageDataURL}\n ${diff}`));
        } else {
          resolve();
        }
      });
  });
}

function encodeImageIdInfo(info) {
  return `fakeImageLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeImageIdInfo(imageId) {
  const [scheme, encodedInfo] = imageId.split(':');
  if (scheme !== 'fakeImageLoader') {
    return null;
  }
  return JSON.parse(decodeURIComponent(encodedInfo));
}

function encodeVolumeIdInfo(info) {
  return `fakeVolumeLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeVolumeIdInfo(volumeId) {
  const [scheme, encodedInfo] = volumeId.split(':');
  if (scheme !== 'fakeVolumeLoader') {
    return null;
  }
  return JSON.parse(decodeURIComponent(encodedInfo));
}

export {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  compareImages,
  createNormalizedMouseEvent,
  // utils
  colors,
  fillStackSegmentationWithMockData,
  fillVolumeLabelmapWithMockData,
  addMockContourSegmentation,
  encodeImageIdInfo,
  decodeImageIdInfo,
  encodeVolumeIdInfo,
  decodeVolumeIdInfo,
  // createViewport,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
};
