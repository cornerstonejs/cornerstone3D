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
  getShouldUseCPURendering,
  setUseCPURendering,
  getConfiguration,
  getRenderingEngines,
} from '@cornerstonejs/core';
import {
  init as initTools,
  addTool,
  ToolGroupManager,
  SynchronizerManager,
  destroy,
  segmentation,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';

const viewportNextConfigurationStack = [];
const cpuRenderingConfigurationStack = [];
const KARMA_CURRENT_SPEC_FULL_NAME = '__karmaCurrentSpecFullName';
const KARMA_LAST_SPEC_FULL_NAME = '__karmaLastSpecFullName';
const KARMA_LAST_SPEC_DONE_AT = '__karmaLastSpecDoneAt';
const KARMA_SPEC_REPORTER_INSTALLED = '__karmaSpecReporterInstalled';

installKarmaSpecTracker();

function getForcedCompatFromKarma() {
  return window.__karma__?.config?.forceCompat === true;
}

function getForcedCpuRenderingFromKarma() {
  return window.__karma__?.config?.forceCpuRendering === true;
}

function getCompatModeString() {
  const compat = getForcedCompatFromKarma();
  const cpu = getForcedCpuRenderingFromKarma();
  if (compat && cpu) return 'compat-cpu';
  if (compat) return 'compat';
  if (cpu) return 'cpu';
  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function setupTestEnvironment({
  renderingEngineId = utilities.uuidv4(),
  toolGroupIds = ['default'],
  tools = [],
  toolConfigurations = {},
  toolActivations = {},
  viewportIds = [],
  options = {},
  useViewportNext = false,
} = {}) {
  // Initialize csTools3d and add specified tools
  window.devicePixelRatio = 1;

  initCore();

  const renderingConfiguration = getConfiguration().rendering;
  const resolvedUseViewportNext = useViewportNext || getForcedCompatFromKarma();
  const resolvedUseCpuRendering =
    getShouldUseCPURendering() || getForcedCpuRenderingFromKarma();

  viewportNextConfigurationStack.push(renderingConfiguration.useViewportNext);
  cpuRenderingConfigurationStack.push(renderingConfiguration.useCPURendering);
  renderingConfiguration.useViewportNext = resolvedUseViewportNext;
  setUseCPURendering(resolvedUseCpuRendering, false);
  initTools();
  tools.forEach((tool) => addTool(tool));

  // remove all rendering engines
  getRenderingEngines().forEach((renderingEngine) => {
    renderingEngine.destroy();
  });

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
  segmentation.state.removeAllSegmentationRepresentations();
  segmentation.state.removeAllSegmentations();

  // Clear the cache
  cache.purgeCache();
  destroy();

  segmentation.state.destroy();

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

  const previousUseViewportNext = viewportNextConfigurationStack.pop();
  const previousUseCpuRendering = cpuRenderingConfigurationStack.pop();

  if (previousUseViewportNext !== undefined) {
    getConfiguration().rendering.useViewportNext = previousUseViewportNext;
  }

  if (previousUseCpuRendering !== undefined) {
    setUseCPURendering(previousUseCpuRendering, false);
  }

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
  updateBaselines = false
) {
  installKarmaSpecTracker();
  const testName = getCurrentTestName();

  if (updateBaselines) {
    if (!window.__groundTruthUpdates) {
      window.__groundTruthUpdates = {};
    }
    window.__groundTruthUpdates[outputName] = imageDataURL;
    console.log(`[GROUND_TRUTH_UPDATE]::${outputName}::${imageDataURL}`);
    return Promise.resolve();
  }

  const compatMode = getCompatModeString();

  if (compatMode) {
    return compareWithCompatBaseline(
      imageDataURL,
      outputName,
      compatMode,
      testName
    );
  }

  return runResembleComparison(imageDataURL, baseline.default, outputName, testName);
}

function compareWithCompatBaseline(imageDataURL, outputName, mode, testName) {
  const baselineUrl = '/karma-baselines/' + mode + '/' + outputName + '.png';

  return fetch(baselineUrl)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('not found');
      }
      return response.blob();
    })
    .then(function (blob) {
      return blobToDataUrl(blob);
    })
    .then(function (baselineDataUrl) {
      return runResembleComparison(
        imageDataURL,
        baselineDataUrl,
        outputName,
        testName
      );
    })
    .catch(function () {
      // No compat baseline exists yet - save the actual as the new baseline
      console.log(
        '[KARMA_BASELINE_CREATE]' +
          JSON.stringify({
            mode: mode,
            outputName: outputName,
            image: imageDataURL,
          })
      );
      console.log(
        '[KARMA_IMAGE_ARTIFACT]' +
          JSON.stringify({
            actual: imageDataURL,
            diff: '',
            expected: '',
            mismatch: 0,
            mismatchExact: '0',
            outputName: outputName,
            status: 'new',
            testName: testName,
          })
      );
      // Pass the test - baseline will be created after the run
    });
}

function runResembleComparison(imageDataURL, expectedDataUrl, outputName, testName) {
  return new Promise((resolve, reject) => {
    resemble.outputSettings({
      useCrossOrigin: false,
      errorColor: { red: 0, green: 255, blue: 0 },
      transparency: 0.5,
      largeImageThreshold: 1200,
      outputDiff: true,
    });

    resemble(expectedDataUrl)
      .compareTo(imageDataURL)
      .onComplete((data) => {
        const mismatchExact = String(data.misMatchPercentage);
        const mismatch = parseFloat(data.misMatchPercentage);
        const diff = data.getImageDataUrl();

        console.log(
          `[KARMA_IMAGE_ARTIFACT]${JSON.stringify({
            actual: imageDataURL,
            diff,
            expected: expectedDataUrl,
            mismatch,
            mismatchExact,
            outputName,
            status: mismatch > 1 ? 'failed' : 'passed',
            testName,
          })}`
        );

        if (mismatch > 1) {
          reject(
            new Error(
              `mismatch of ${mismatchExact} between images for ${outputName},
              the diff image is: \n\n ${diff} \n\n`
            )
          );
        } else {
          resolve();
        }
      });
  });
}

function getCurrentTestName() {
  installKarmaSpecTracker();

  if (typeof globalThis[KARMA_CURRENT_SPEC_FULL_NAME] === 'string') {
    return globalThis[KARMA_CURRENT_SPEC_FULL_NAME];
  }

  if (
    typeof globalThis[KARMA_LAST_SPEC_FULL_NAME] === 'string' &&
    Date.now() - Number(globalThis[KARMA_LAST_SPEC_DONE_AT] || 0) < 5000
  ) {
    return globalThis[KARMA_LAST_SPEC_FULL_NAME];
  }

  const jasmineGlobal = globalThis.jasmine;

  if (!jasmineGlobal) {
    return undefined;
  }

  if (typeof jasmineGlobal.currentTest?.fullName === 'string') {
    return jasmineGlobal.currentTest.fullName;
  }

  const currentSpec = jasmineGlobal.getEnv?.().currentSpec;

  if (typeof currentSpec?.getFullName === 'function') {
    return currentSpec.getFullName();
  }

  if (typeof currentSpec?.result?.fullName === 'string') {
    return currentSpec.result.fullName;
  }
}

function installKarmaSpecTracker() {
  const jasmineGlobal = globalThis.jasmine;

  if (!jasmineGlobal?.getEnv || globalThis[KARMA_SPEC_REPORTER_INSTALLED]) {
    return;
  }

  jasmineGlobal.getEnv().addReporter({
    specStarted(result) {
      globalThis[KARMA_CURRENT_SPEC_FULL_NAME] =
        result.fullName || result.description;
    },
    specDone(result) {
      globalThis[KARMA_LAST_SPEC_FULL_NAME] =
        result.fullName || result.description;
      globalThis[KARMA_LAST_SPEC_DONE_AT] = Date.now();
      delete globalThis[KARMA_CURRENT_SPEC_FULL_NAME];
    },
  });

  globalThis[KARMA_SPEC_REPORTER_INSTALLED] = true;
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
