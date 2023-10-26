import {
  defaultParameterMap,
  elastix,
  DefaultParameterMapOptions,
  DefaultParameterMapResult,
  ElastixOptions,
} from '@itk-wasm/elastix';
import { Image, ImageType, FloatTypes, PixelTypes, Metadata } from 'itk-wasm';
import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addButtonToToolbar,
  addNumberInputToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const toolGroupIds = new Set<string>();
const imageIdsCache = new Map();
let webWorker = null;

const volumesInfo = [
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_1`,

    // Neptune
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095449.8',

    // Juno
    // wadoRsRoot: 'http://localhost/dicom-web',
    // StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125112931.11',
    // SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113028.6',

    // Registration Patient
    // wadoRsRoot: 'http://localhost/dicom-web',
    // StudyInstanceUID: '1.2.276.0.7230010.3.1.2.8323329.48268.1698701222.813076',
    // SeriesInstanceUID: '1.2.826.0.1.3680043.8.498.84963501100167841758743213842999883579',
  },
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_2`,

    // Neptune
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095305.12',

    // Juno
    // wadoRsRoot: 'http://localhost/dicom-web',
    // StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    // SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113420.1',

    // Registration Patient
    // wadoRsRoot: 'http://localhost/dicom-web',
    // StudyInstanceUID: '1.2.826.0.1.3680043.8.498.12964356232224616523807475287136128640',
    // SeriesInstanceUID: '1.2.826.0.1.3680043.8.498.75254374739656968107738714604787374813',
  },
];

const viewportsInfo = [
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[0],
    viewportInput: {
      viewportId: 'CT_VOLUME_AXIAL_FIXED',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[1],
    viewportInput: {
      viewportId: 'CT_VOLUME_AXIAL_MOVING',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

const defaultNumberOfResolutions = 2;
const defaultFinalGridSpacing = 8;
const transformNames = [
  'translation',
  'rigid',
  'affine',
  'bspline',
  'spline',
  // 'groupwise', // 2D+time or 3D+time
];

let activeTransformName = transformNames[1];
let currentParameterMap = {};

const defaultParameterMaps = {};
const parametersSettings = {
  NumberOfResolutions: {
    inputType: 'number',
    defaultValue: defaultNumberOfResolutions,
  },
  MaximumNumberOfIterations: {
    inputType: 'number',
    defaultValue: 256,
  },
  Registration: {
    inputType: 'dropdown',
    values: [
      'MultiResolutionRegistration',
      'MultiResolutionRegistrationWithFeatures',
      'MultiMetricMultiResolutionRegistration',
    ],
  },
  Metric: {
    inputType: 'dropdown',
    values: [
      'AdvancedKappaStatistic',
      'AdvancedMattesMutualInformation',
      'AdvancedMeanSquares',
      'AdvancedNormalizedCorrelation',
      'CorrespondingPointsEuclideanDistanceMetric',
      'DisplacementMagnitudePenalty',
      'DistancePreservingRigidityPenalty',
      'GradientDifference',
      'KNNGraphAlphaMutualInformation',
      'MissingStructurePenalty',
      'NormalizedGradientCorrelation',
      'NormalizedMutualInformation',
      'PCAMetric',
      'PCAMetric2',
      'PatternIntensity',
      'PolydataDummyPenalty',
      'StatisticalShapePenalty',
      'SumOfPairwiseCorrelationCoefficientsMetric',
      'SumSquaredTissueVolumeDifference',
      'TransformBendingEnergyPenalty',
      'TransformRigidityPenalty',
      'VarianceOverLastDimensionMetric',
    ],
  },
  Interpolator: {
    inputType: 'dropdown',
    values: [
      'BSplineInterpolator',
      'BSplineInterpolatorFloat',
      'LinearInterpolator',
      'NearestNeighborInterpolator',
      'RayCastInterpolator',
      'ReducedDimensionBSplineInterpolator',
    ],
  },
  FixedImagePyramid: {
    inputType: 'dropdown',
    values: [
      'FixedGenericImagePyramid',
      'FixedRecursiveImagePyramid',
      'FixedSmoothingImagePyramid',
      'FixedShrinkingImagePyramid',
      'OpenCLFixedGenericImagePyramid',
    ],
  },
  MovingImagePyramid: {
    inputType: 'dropdown',
    values: [
      'MovingGenericImagePyramid',
      'MovingRecursiveImagePyramid',
      'MovingShrinkingImagePyramid',
      'MovingSmoothingImagePyramid',
      'OpenCLMovingGenericImagePyramid',
    ],
  },
  Optimizer: {
    inputType: 'dropdown',
    values: [
      'AdaGrad',
      'AdaptiveStochasticGradientDescent',
      'AdaptiveStochasticLBFGS',
      'AdaptiveStochasticVarianceReducedGradient',
      'CMAEvolutionStrategy',
      'ConjugateGradient',
      'ConjugateGradientFRPR',
      'FiniteDifferenceGradientDescent',
      'FullSearch',
      'Powell',
      'PreconditionedGradientDescent',
      'PreconditionedStochasticGradientDescent',
      'QuasiNewtonLBFGS',
      'RSGDEachParameterApart',
      'RegularStepGradientDescent',
      'Simplex',
      'SimultaneousPerturbation',
      'StandardGradientDescent',
    ],
  },
  Resampler: {
    inputType: 'dropdown',
    values: ['DefaultResampler', 'OpenCLResampler'],
  },
  ResampleInterpolator: {
    inputType: 'dropdown',
    values: [
      'FinalBSplineInterpolator',
      'FinalBSplineInterpolatorFloat',
      'FinalLinearInterpolator',
      'FinalNearestNeighborInterpolator',
      'FinalReducedDimensionBSplineInterpolator',
      'FinalRayCastInterpolator',
    ],
  },
  FinalBSplineInterpolationOrder: {
    inputType: 'number',
  },
  ImageSampler: {
    inputType: 'dropdown',
    values: [
      'Random',
      'RandomCoordinate',
      'Full',
      'Grid',
      'MultiInputRandomCoordinate',
      'RandomSparseMask',
    ],
  },
  NumberOfSpatialSamples: {
    inputType: 'number',
    defaultValue: 2048,
  },
  CheckNumberOfSamples: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  MaximumNumberOfSamplingAttempts: {
    inputType: 'number',
    defaultValue: 8,
  },
  NewSamplesEveryIteration: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  NumberOfSamplesForExactGradient: {
    inputType: 'number',
    defaultValue: 4096,
  },
  DefaultPixelValue: {
    inputType: 'number',
    defaultValue: 0,
  },
  AutomaticParameterEstimation: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  AutomaticScalesEstimation: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  AutomaticTransformInitialization: {
    inputType: 'dropdown',
    values: ['true', 'false'],
    defaultValue: 'true',
  },
  Metric0Weight: {
    inputType: 'number',
    defaultValue: '1.0',
    step: 0.1,
  },
  Metric1Weight: {
    inputType: 'number',
    defaultValue: '1.0',
    step: 0.1,
  },
  FinalGridSpacing: {
    inputType: 'number',
    defaultValue: defaultFinalGridSpacing,
  },
  ResultImageFormat: {
    inputType: 'dropdown',
    values: ['mhd', 'nii', 'nrrd', 'vti'],
  },
};

// ==[ Set up page ]============================================================

setTitleAndDescription(
  'Registration',
  'Spatially align two volumes from different frames of reference'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

Object.assign(viewportGrid.style, {
  display: 'grid',
  gridTemplateColumns: `1fr 1fr`,
  width: '100%',
  height: '400px',
  paddingTop: '5px',
  gap: '5px',
});

content.appendChild(viewportGrid);

const statusFieldset = document.createElement('fieldset');
statusFieldset.style.fontSize = '12px';
statusFieldset.style.height = '200px';
statusFieldset.style.overflow = 'scroll';
content.appendChild(statusFieldset);

const statusFieldsetLegent = document.createElement('legend');
statusFieldsetLegent.innerText = 'Processing logs';
statusFieldset.appendChild(statusFieldsetLegent);

const statusNode = document.createElement('div');
statusNode.style.fontFamily = 'monospace';
statusFieldset.appendChild(statusNode);

const logStatus = (text, preFormated = false) => {
  const node = document.createElement(preFormated ? 'pre' : 'p');

  node.innerText = `${getFormatedDateTime()} ${text}`;
  node.style.margin = '0';
  node.style.fontSize = '10px';
  statusNode.appendChild(node);

  // Scroll to the end
  statusFieldset.scrollBy(
    0,
    statusFieldset.scrollHeight - statusFieldset.scrollTop
  );
};

const clearStatus = () => {
  while (statusNode.hasChildNodes()) {
    statusNode.removeChild(statusNode.firstChild);
  }
};

// ==[ Toolbar ]================================================================
const toolbar = document.getElementById('demo-toolbar');
const toolbarTransformSection = document.createElement('div');
const toolbarParamsSection = document.createElement('div');

[toolbarTransformSection, toolbarParamsSection].forEach((toolbarSection) => {
  toolbarSection.style.margin = '0px 0px 10px';
});

// Parameters container
const toolbarParamsContainer = document.createElement('fieldset');
const toolbarParamsContainerLegend = document.createElement('legend');

toolbarParamsContainer.style.display = 'grid';
toolbarParamsContainer.style.gridTemplateColumns = 'repeat(2, max-content 1fr)';

toolbarParamsContainerLegend.innerText = 'Parameters';

toolbarParamsContainer.appendChild(toolbarParamsContainerLegend);
toolbarParamsSection.appendChild(toolbarParamsContainer);

toolbar.append(toolbarTransformSection, toolbarParamsSection);

addDropDownToToolbar({
  labelText: 'Transform ',
  container: toolbarTransformSection,
  options: {
    values: transformNames,
    defaultValue: activeTransformName,
  },
  onSelectedValueChange: (value) => {
    activeTransformName = value.toString();
    loadParameterMap(activeTransformName);
  },
});

Object.keys(parametersSettings).forEach((parameterName) => {
  const parameterSettings = parametersSettings[parameterName];
  const { inputType, defaultValue } = parameterSettings;
  const id = parameterName;
  const onChange = (newValue: string | number) => {
    newValue = newValue.toString();

    // Some parameters need to update a global variable
    parameterSettings.onChange?.(newValue);

    if (newValue === '') {
      delete currentParameterMap[parameterName];
    } else {
      currentParameterMap[parameterName] = [newValue];
    }
  };

  const label = document.createElement('label');
  label.htmlFor = id;
  label.innerText = parameterName;
  label.style.margin = '0px 5px';
  toolbarParamsContainer.append(label);

  if (inputType === 'number') {
    const { step = 1 } = parameterSettings;

    addNumberInputToToolbar({
      id,
      value: defaultValue ?? 0,
      step,
      container: toolbarParamsContainer,
      onChange,
    });
  } else if (inputType === 'dropdown') {
    const { values } = parameterSettings;
    const dropdownValues = ['', ...values];

    addDropDownToToolbar({
      id,
      options: {
        values: dropdownValues,
        defaultValue: defaultValue ?? dropdownValues[0],
      },
      container: toolbarParamsContainer,
      onSelectedValueChange: onChange,
    });
  }
});

addButtonToToolbar({
  id: 'btnRegister',
  title: 'Register volumes',
  onClick: async () => {
    clearStatus();

    // Use the same parameter map updated by the user
    const parameterMap = currentParameterMap;

    logStatus(`Parameters map:\n${stringify(parameterMap, 4)}`, true);

    const [fixedViewportInfo, movingViewportInfo] = viewportsInfo;
    const { viewportId: fixedViewportId } = fixedViewportInfo.viewportInput;
    const { viewportId: movingViewportId } = movingViewportInfo.viewportInput;
    const fixedImage = getImageFromViewport(fixedViewportId, 'fixed');
    const movingImage = getImageFromViewport(movingViewportId, 'moving');

    logImageInfo(fixedImage);
    logImageInfo(movingImage);

    const elastixOptions: ElastixOptions = {
      fixed: fixedImage,
      moving: movingImage,
      initialTransform: undefined,
      initialTransformParameterObject: undefined,
    };

    logStatus('Registration in progress (rigid)...');

    console.log('Registration:', parameterMap);
    console.log('    parameterMap:', parameterMap);
    console.log('    options:', elastixOptions);

    const startTime = performance.now();
    const elastixResult = await elastix(
      webWorker,
      [parameterMap],
      'transform.h5',
      elastixOptions
    );

    const totalTime = performance.now() - startTime;
    const { result, transform, transformParameterObject } = elastixResult;

    console.log('Elastix result');
    console.log('    result:', result);
    console.log('    transform:', transform);
    console.log('    transformParameterObject:', transformParameterObject);

    logStatus(
      `transformParameterObject:\n${stringify(transformParameterObject, 4)}`,
      true
    );

    logStatus(`Total time: ${(totalTime / 1000).toFixed(3)} seconds`);
    logStatus('Registration complete');
  },
});

// =============================================================================

async function getElastixParameterMap(
  transformName: string
): Promise<DefaultParameterMapResult> {
  const parameterMapOptions: DefaultParameterMapOptions = {
    numberOfResolutions: defaultNumberOfResolutions,
    finalGridSpacing: defaultFinalGridSpacing,
  };

  const parameterMap: DefaultParameterMapResult = await defaultParameterMap(
    webWorker,
    transformName,
    parameterMapOptions
  );

  webWorker = parameterMap.webWorker;

  return parameterMap;
}

async function loadAndCacheAllParameterMaps() {
  for (let i = 0, len = transformNames.length; i < len; i++) {
    const transformName = transformNames[i];
    const { parameterMap } = await getElastixParameterMap(transformName);

    defaultParameterMaps[transformName] = parameterMap;
    console.log(`Default parameter map (${transformName}):`, parameterMap);
  }
}

/**
 * Update the screen with all parameter values for a given transformation
 * @param transformName - Transformation name
 */
function loadParameterMap(transformName: string) {
  const parameterMap = defaultParameterMaps[transformName];

  // Update the current parameter map that shall be updated on every input change
  currentParameterMap = parameterMap;

  // For each parameters that has settings which means an input field on the screen
  Object.keys(parametersSettings).forEach((parameterName) => {
    const parameterSettings = parametersSettings[parameterName];
    const parameterValues = parameterMap[parameterName];
    const input = document.getElementById(parameterName) as HTMLInputElement;

    // Disable the input field if there is the parameter is not
    // in the default parameter map
    input.disabled = !parameterValues;

    if (!parameterValues) {
      return;
    }

    // Get the first value because the values are always stored as an array
    const parameterValue = parameterValues[0];

    // Update the input field
    input.value = parameterValue;

    // Some parameters needs to update a global variable
    parameterSettings.onLoad?.(parameterValue);
  });
}

/**
 * Get the current date/time ("YYYY-MM-DD hh:mm:ss.SSS")
 */
function getFormatedDateTime() {
  const now = new Date();
  const day = `0${now.getDate()}`.slice(-2);
  const month = `0${now.getMonth() + 1}`.slice(-2);
  const year = now.getFullYear();
  const hours = `0${now.getHours()}`.slice(-2);
  const minutes = `0${now.getMinutes()}`.slice(-2);
  const seconds = `0${now.getSeconds()}`.slice(-2);
  const ms = `00${now.getMilliseconds()}`.slice(-3);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Converts a JavaScript object to a JSON string ignoring circular references
 * @param obj - The object to convert to a JSON string
 * @param space - Parameter passed to JSON.stringify() that's used to insert
 *   white space (including indentation, line break characters, etc.) into the
 *   output JSON string for readability purposes
 * @returns A JSON string representing the given object, or undefined.
 */
function stringify(obj, space = 0) {
  const cache = new Set();
  const str = JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.add(value);
      }
      return value;
    },
    space
  );

  return str;
}

/**
 * Log all image information
 */
function logImageInfo(image) {
  logStatus(`image "${image.name}"`);
  logStatus(`    origin: ${image.origin.join(', ')}`, true);
  logStatus(`    spacing: ${image.spacing.join(', ')}`, true);
  logStatus(`    direction: ${image.direction.join(', ')}`, true);
  logStatus(`    size: ${image.size.join(', ')}`, true);
  logStatus(`    imageType:`, true);
  logStatus(`        dimension: ${image.imageType.dimension}`, true);
  logStatus(`        components: ${image.imageType.components}`, true);
  logStatus(`        componentType: ${image.imageType.componentType}`, true);
  logStatus(`        pixelType: ${image.imageType.pixelType}`, true);
}

/**
 * Get the ITK Image from a given viewport
 * @param viewportId - Viewport Id
 * @param imageName - Any random name that shall be set in the image
 * @returns An ITK Image that can be used as fixed or moving image
 */
function getImageFromViewport(viewportId, imageName?: string): Image {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );
  const { actor: volumeActor } = viewport.getDefaultActor();
  const imageData = volumeActor.getMapper().getInputData();
  const pointData = imageData.getPointData();
  const scalars = pointData.getScalars();
  const dimensions = imageData.getDimensions();
  const origin = imageData.getOrigin();
  const spacing = imageData.getSpacing();
  const directionArray = imageData.getDirection();
  const direction = new Float64Array(directionArray);
  const numComponents = pointData.getNumberOfComponents();
  const dataType = scalars.getDataType().replace('Array', '');
  const metadata: Metadata = undefined;
  const scalarData = scalars.getData();
  const imageType: ImageType = new ImageType(
    dimensions.length,
    FloatTypes[dataType],
    PixelTypes.Scalar,
    numComponents
  );

  const image = new Image(imageType);

  image.name = imageName;
  image.origin = origin;
  image.spacing = spacing;
  image.direction = direction;
  image.size = dimensions;
  image.metadata = metadata;
  image.data = new scalarData.constructor(scalarData.length);

  image.data.set(scalarData, 0);

  return image;
}

async function initializeVolumeViewport(
  viewport: Types.IVolumeViewport,
  volumeId: string,
  imageIds: string[]
) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();
  }

  // Set the volume on the viewport
  await viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  return volume;
}

async function initializeViewport(
  renderingEngine,
  toolGroup,
  viewportInfo,
  imageIds,
  volumeId
) {
  const { viewportInput } = viewportInfo;
  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  element.style.overflow = 'hidden';

  viewportInput.element = element;
  viewportGrid.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    // Set the stack on the viewport
    (<Types.IStackViewport>viewport).setStack(imageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewport as Types.IVolumeViewport,
      volumeId,
      imageIds
    );
  } else {
    throw new Error('Invalid viewport type');
  }
}

function initializeToolGroup(toolGroupId) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  return toolGroup;
}

async function getImageIds(
  wadoRsRoot: string,
  StudyInstanceUID: string,
  SeriesInstanceUID: string
) {
  const imageIdsKey = `${StudyInstanceUID}:${SeriesInstanceUID}`;
  let imageIds = imageIdsCache.get(imageIdsKey);

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      wadoRsRoot,
      StudyInstanceUID,
      SeriesInstanceUID,
    });

    imageIdsCache.set(imageIdsKey, imageIds);
  }

  return imageIds;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { volumeInfo, toolGroupId } = viewportInfo;
    const { wadoRsRoot, StudyInstanceUID, SeriesInstanceUID, volumeId } =
      volumeInfo;
    const toolGroup = initializeToolGroup(toolGroupId);
    const imageIds = await getImageIds(
      wadoRsRoot,
      StudyInstanceUID,
      SeriesInstanceUID
    );

    toolGroupIds.add(toolGroupId);

    await initializeViewport(
      renderingEngine,
      toolGroup,
      viewportInfo,
      imageIds,
      volumeId
    );
  }

  await loadAndCacheAllParameterMaps();
  loadParameterMap(activeTransformName);
}

run();
