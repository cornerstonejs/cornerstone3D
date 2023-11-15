import {
  defaultParameterMap,
  elastix,
  DefaultParameterMapOptions,
  DefaultParameterMapResult,
  ElastixOptions,
} from '@itk-wasm/elastix';
import {
  Image,
  ImageType,
  IntTypes,
  FloatTypes,
  PixelTypes,
  Metadata,
} from 'itk-wasm';
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
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addButtonToToolbar,
  addNumberInputToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';
import {
  defaultNumberOfResolutions,
  defaultFinalGridSpacing,
  parametersSettings,
} from './elastixParametersSettings';
import { getImageIds, stringify } from './utils';
import RegistrationConsole from './RegistrationConsole';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const dataTypesMap = {
  Int8: IntTypes.Int8,
  UInt8: IntTypes.UInt8,
  Int16: IntTypes.Int16,
  UInt16: IntTypes.UInt16,
  Int32: IntTypes.Int32,
  UInt32: IntTypes.UInt32,
  Int64: IntTypes.Int64,
  UInt64: IntTypes.UInt64,
  Float32: FloatTypes.Float32,
  Float64: FloatTypes.Float64,
};

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
let webWorker = null;

const volumesInfo = [
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_1`,
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095449.8',
  },
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_2`,
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095305.12',
  },
];

const viewportsInfo = [
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[0],
    viewportInput: {
      viewportId: 'CT_VOLUME_FIXED',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[1],
    viewportInput: {
      viewportId: 'CT_VOLUME_MOVING',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

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

// ==[ Set up page ]============================================================

setTitleAndDescription(
  'Registration',
  'Spatially align two volumes from different frames of reference using the itk-wasm/elastix package. Please note that in this demo, we only explore the different parameters that are available. Visually, you will not see any rendering of the registered moving image on top of the fixed image yet. '
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

const regConsole = new RegistrationConsole(content);

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
    regConsole.clear();

    // Fake call just to get a new webWorker because we need to make sure
    // it will be destroyed even if an error occur during registration
    // Is there a better way to get a WebWorker?
    const { webWorker } = await defaultParameterMap(undefined, 'rigid', {
      numberOfResolutions: 4,
    });

    // Use the same parameter map updated by the user
    const parameterMap = currentParameterMap;

    regConsole.log(`Parameters map:\n${stringify(parameterMap, 4)}`, true);

    const [fixedViewportInfo, movingViewportInfo] = viewportsInfo;
    const { viewportId: fixedViewportId } = fixedViewportInfo.viewportInput;
    const { viewportId: movingViewportId } = movingViewportInfo.viewportInput;
    const fixedImage = getImageFromViewport(fixedViewportId, 'fixed');
    const movingImage = getImageFromViewport(movingViewportId, 'moving');

    regConsole.logImageInfo(fixedImage);
    regConsole.logImageInfo(movingImage);

    const elastixOptions: ElastixOptions = {
      fixed: fixedImage,
      moving: movingImage,
      initialTransform: undefined,
      initialTransformParameterObject: undefined,
    };

    regConsole.log(`Registration in progress (${activeTransformName})...`);

    console.log('Registration:');
    console.log('    parameterMap:', parameterMap);
    console.log('    options:', elastixOptions);

    try {
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

      regConsole.log(
        `transformParameterObject:\n${stringify(transformParameterObject, 4)}`,
        true
      );

      regConsole.log('Resulting image:');
      regConsole.logImageInfo(result);
      regConsole.logTransform(transform);
      regConsole.log(`Total time: ${(totalTime / 1000).toFixed(3)} seconds`);
      regConsole.log('Registration complete');
    } catch (error: any) {
      window.error = error;
      let message = 'unknown error';

      if (typeof error === 'string') {
        message = error.toUpperCase();
      } else if (error.message) {
        message = error.message;
      }

      regConsole.log(`An error ocurred during : ${message}`);
      console.log('Error: ', error);
    } finally {
      webWorker.terminate();
    }
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

    parameterMap['AutomaticTransformInitialization'] = ['true'];
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
  const dataType = scalars
    .getDataType()
    .replace(/^Ui/, 'UI')
    .replace(/Array$/, '');
  const metadata: Metadata = undefined;
  const scalarData = scalars.getData();
  const imageType: ImageType = new ImageType(
    dimensions.length,
    dataTypesMap[dataType],
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
  image.data = scalarData;

  // image.data = new scalarData.constructor(scalarData.length);
  // image.data.set(scalarData, 0);

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

  regConsole.log(
    `Viewport ${viewportId} initialized (${imageIds.length} slices)`
  );
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
