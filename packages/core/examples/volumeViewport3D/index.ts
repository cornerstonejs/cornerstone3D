import {
  CONSTANTS,
  Enums,
  eventTarget,
  getOrCreateCanvas,
  RenderingEngine,
  setVolumesForViewports,
  Types,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { TF_Panel } from './tf_ui/TF_panel';
import { Statistics } from './tf_ui/ui';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { Events } = Enums;

const {
  ToolGroupManager,
  TrackballRotateTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportId = '3D_VIEWPORT';

// ======== Set up page ======== //
setTitleAndDescription(
  '3D Volume Rendering',
  'Here we demonstrate how to 3D render a volume.'
);

const size = '700px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);
let viewport;

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = 'Click the image to rotate it.';

content.append(instructions);

addDropdownToToolbar({
  options: {
    values: CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
    defaultValue: 'CT-Bone',
  },
  onSelectedValueChange: (presetName) => {
    viewport.setProperties({
      preset: presetName,
    });

    renderingEngine.render();
  },
});

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(TrackballRotateTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.VOLUME_3D,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  const canvas = getOrCreateCanvas(element1);
  const options = {
    parent: canvas,
    container: canvas.parentElement,
    panel: {
      isCollapsible: true,
      position: 'bottom',
      background: '#090c29',
    },
    histogram: {
      // style: 'bars',
    },
  };

  function convertArrayToString(data, minValue, maxValue) {
    // Skip the first and last items in data
    // const slicedData = data.slice(1, -1);
    const slicedData = data;

    // Map each item in slicedData to their original scale and color & opacity strings
    const colorMapped = slicedData.map(([scaledValue, color]) => {
      const originalValue = scaledValue * (maxValue - minValue) + minValue;
      const colorString = `${originalValue} ${color.r / 255} ${color.g / 255} ${
        color.b / 255
      }`;
      return colorString;
    });

    const opacityMapped = slicedData.map(([scaledValue, color]) => {
      const originalValue = scaledValue * (maxValue - minValue) + minValue;
      const opacityString = `${originalValue} ${color.a}`;
      return opacityString;
    });

    // Convert mapped arrays to single strings with space as separators
    // Count of values is 4 times the count of array elements for colorString, and 2 times for opacityString
    const colorString = colorMapped.reduce(
      (prev, curr) => `${prev} ${curr}`,
      `${4 * slicedData.length}`
    );
    const opacityString = opacityMapped.reduce(
      (prev, curr) => `${prev} ${curr}`,
      `${2 * slicedData.length}`
    );

    return { colorString, opacityString };
  }

  function convertArrayToNested(cfunVals, ofunVals, minValue, maxValue) {
    // if the length of control points in the cfun and ofun are not the same, we can't map them
    // to the UI so we throw an error
    // if (cfunVals.length !== ofunVals.length) {
    //   throw new Error(
    //     'The length of the color and opacity control points must be the same'
    //   );
    // }

    const mapped = cfunVals.map(([originalValue, r, g, b], index) => {
      const scaledValue = (originalValue - minValue) / (maxValue - minValue);
      return [
        scaledValue,
        {
          r: Math.round(r * 255),
          g: Math.round(g * 255),
          b: Math.round(b * 255),
          a: ofunVals[index][1],
        },
      ];
    });

    return mapped;
  }

  let minimum, maximum;

  viewport = renderingEngine.getViewport(viewportId);
  const disableAll = false;

  const tf_panel = new TF_Panel(options);

  const UpdateTF = () => {
    if (disableAll) {
      return;
    }
    const tfValues = tf_panel.getTF();
    if (!tfValues || tfValues.length === 0) {
      return;
    }
    if (!minimum || !maximum) {
      return;
    }

    const { colorString, opacityString } = convertArrayToString(
      tfValues.splice(1, tfValues.length - 2),
      minimum,
      maximum
    );

    const viewport = renderingEngine.getViewport(viewportId);
    const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;
    const property = volumeActor.getProperty();
    const specularPower = property.getSpecularPower();
    const specular = property.getSpecular();
    const shade = property.getShade();
    const ambient = property.getAmbient();
    const diffuse = property.getDiffuse();
    const interpolationType = property.getInterpolationType();
    const gradientOpacityMinimumValue =
      property.getGradientOpacityMinimumValue(0);
    const gradientOpacityMaximumValue =
      property.getGradientOpacityMaximumValue(0);
    const gradientOpacityMinimumOpacity =
      property.getGradientOpacityMinimumOpacity(0);
    const gradientOpacityMaximumOpacity =
      property.getGradientOpacityMaximumOpacity(0);

    const newPreset = {
      name: 'custom',
      gradientOpacity: `4 ${gradientOpacityMinimumValue} ${gradientOpacityMinimumOpacity} ${gradientOpacityMaximumValue} ${gradientOpacityMaximumOpacity}`,
      specularPower: `${specularPower}`,
      scalarOpacity: opacityString,
      specular: `${specular}`,
      shade: `${shade === true ? '1' : '0'}`,
      ambient: `${ambient}`,
      colorTransfer: colorString,
      diffuse: `${diffuse}`,
      interpolation: `${interpolationType}`,
    };
    viewport.setProperties({ preset: newPreset });
    viewport.render();
  };

  let isModifiedViaUI = false;
  tf_panel.registerUIEditCallback(() => {
    isModifiedViaUI = true;
    UpdateTF();
    isModifiedViaUI = false;
  });

  const UpdateUI = (volumeActor) => {
    if (disableAll) {
      return;
    }
    if (isModifiedViaUI) {
      return;
    }

    const cfun = volumeActor.getProperty().getRGBTransferFunction(0);

    const cfunValues = [];

    for (let i = 0; i < cfun.getSize(); i++) {
      const value = [];
      cfun.getNodeValue(i, value);
      cfunValues.push(value);
    }

    const ofun = volumeActor.getProperty().getScalarOpacity(0);

    const ofunValues = [];
    for (let i = 0; i < ofun.getSize(); i++) {
      const value = [];
      ofun.getNodeValue(i, value);
      ofunValues.push(value);
    }

    const { imageData } = viewport.getImageData();

    if (!imageData) {
      return;
    }

    try {
      const converted = convertArrayToNested(
        cfunValues,
        ofunValues,
        minimum,
        maximum
      );
      tf_panel.setTF(converted);
    } catch (e) {
      console.error(e);
      return;
    }
  };

  element1.addEventListener(Events.PRESET_MODIFIED, (e) => {
    if (disableAll) {
      return;
    }
    const volumeActor = e.detail.actor as Types.VolumeActor;

    if (!minimum || !maximum) {
      return;
    }

    UpdateUI(volumeActor);
  });

  eventTarget.addEventListener(Events.IMAGE_VOLUME_LOADING_COMPLETED, (e) => {
    if (disableAll) {
      return;
    }
    if (e.detail.volumeId !== volumeId) {
      return;
    }

    const viewport = renderingEngine.getViewport(viewportId);
    const { scalarData, imageData } = viewport.getImageData();

    const range = imageData.computeHistogram(imageData.getBounds());
    minimum = range.minimum;
    maximum = range.maximum;

    const histogram = Statistics.calcHistogram(scalarData, {
      numBins: 64,
      min: minimum,
      max: maximum,
    });
    tf_panel.setHistogram(histogram);
    tf_panel.draw(true);

    // find the viewport that is instance of volumeViewport3d and grab the volume Actor
    const volumeActor = viewport.getDefaultActor().actor as Types.VolumeActor;

    UpdateUI(volumeActor);
  });

  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]).then(
    () => {
      viewport.setProperties({
        preset: 'CT-Bone',
      });

      viewport.render();
    }
  );

  renderingEngine.render();
}

run();
