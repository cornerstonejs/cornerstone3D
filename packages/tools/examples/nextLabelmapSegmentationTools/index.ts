import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  ProgressiveRetrieveImages,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import {
  getBooleanUrlParam,
  getStringUrlParam,
} from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

type ThresholdConfiguration = {
  range: Types.Point2;
  isDynamic: boolean;
  dynamicRadius: number;
};

type ThresholdOption = {
  threshold: ThresholdConfiguration;
};

const volumeName = 'CT_VOLUME_ID';
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const dataId = 'labelmap-segmentation-tools-next:source';
const useSliceRendering =
  getBooleanUrlParam('useSliceRendering') ||
  getBooleanUrlParam('sliceRendering');
const segmentationRenderingMode = useSliceRendering ? 'slice' : 'volume';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Basic manual labelmap Segmentation tools',
  'Here we demonstrate manual segmentation tools with selectable volume and slice labelmap rendering.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
  SphereBrush: 'SphereBrush',
  SphereEraser: 'SphereEraser',
  ThresholdCircle: 'ThresholdCircle',
  ScissorsEraser: 'ScissorsEraser',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.SphereEraser]: 'ERASE_INSIDE_SPHERE',
  [brushInstanceNames.ThresholdCircle]: 'THRESHOLD_INSIDE_CIRCLE',
  [brushInstanceNames.ScissorsEraser]: 'ERASE_INSIDE',
};

const brushValues = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.CircularEraser,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.SphereEraser,
  brushInstanceNames.ThresholdCircle,
];

const optionsValues = [
  ...brushValues,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  SphereScissorsTool.toolName,
  brushInstanceNames.ScissorsEraser,
  PaintFillTool.toolName,
];

addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

addDropdownToToolbar({
  id: 'segmentation-rendering-mode',
  labelText: 'Segmentation Rendering',
  options: {
    values: ['volume', 'slice'],
    labels: ['VTK volume slice', '2D slice rendering'],
    defaultValue: segmentationRenderingMode,
  },
  onSelectedValueChange: (modeAsStringOrNumber) => {
    const mode = String(modeAsStringOrNumber);

    if (mode === segmentationRenderingMode) {
      return;
    }

    const url = new URL(window.location.href);

    if (mode === 'slice') {
      url.searchParams.set('useSliceRendering', 'true');
    } else {
      url.searchParams.delete('useSliceRendering');
      url.searchParams.delete('sliceRendering');
    }

    window.location.href = url.toString();
  },
});

const thresholdOptions = new Map<string, ThresholdOption>();
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: {
    range: [-150, -70] as Types.Point2,
    isDynamic: false,
    dynamicRadius: 0,
  },
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: {
    range: [200, 1000] as Types.Point2,
    isDynamic: false,
    dynamicRadius: 0,
  },
});

const defaultThresholdOption = thresholdOptions.keys().next().value;
const defaultThresholdConfiguration = thresholdOptions.get(
  defaultThresholdOption
)?.threshold ?? {
  range: [-150, -70] as Types.Point2,
  isDynamic: false,
  dynamicRadius: 0,
};

addDropdownToToolbar({
  options: {
    values: Array.from(thresholdOptions.keys()),
    defaultValue: defaultThresholdOption,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const thresholdArgs = thresholdOptions.get(name);

    if (!thresholdArgs?.threshold) {
      return;
    }

    segmentationUtils.setBrushThresholdForToolGroup(
      toolGroupId,
      thresholdArgs.threshold
    );
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

async function addSegmentationsToState() {
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
}

async function run() {
  const overwriteMode = getStringUrlParam('overwriteMode');

  await initDemo({
    tools: overwriteMode
      ? {
          segmentation: {
            overwriteMode,
          },
        }
      : undefined,
  });

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(SphereScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.CircularBrush }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.CircularEraser }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereBrush,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.SphereBrush }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereEraser,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.SphereEraser }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.ScissorsEraser,
    BrushTool.toolName,
    { activeStrategy: brushStrategies.ScissorsEraser }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.ThresholdCircle,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdCircle,
      threshold: defaultThresholdConfiguration,
    }
  );

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Alt,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Meta,
      },
    ],
  });

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(brushInstanceNames.CircularEraser, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  utilities.imageRetrieveMetadataProvider.add(
    'volume',
    ProgressiveRetrieveImages.interleavedRetrieveStages
  );

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();
  await addSegmentationsToState();

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputs = [
    {
      viewportId: 'CT_AXIAL',
      orientation: Enums.OrientationAxis.AXIAL,
      element: element1,
    },
    {
      viewportId: 'CT_SAGITTAL',
      orientation: Enums.OrientationAxis.SAGITTAL,
      element: element2,
    },
    {
      viewportId: 'CT_CORONAL',
      orientation: Enums.OrientationAxis.CORONAL,
      element: element3,
    },
  ];

  renderingEngine.setViewports(
    viewportInputs.map(({ viewportId, orientation, element }) => ({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element,
      defaultOptions: {
        orientation,
        background: getNextExampleBackground(),
      },
    }))
  );

  viewportInputs.forEach(({ viewportId }) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  utilities.viewportNextDataSetMetadataProvider.add(dataId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
    referencedId: volumeId,
    volumeId,
  });

  await Promise.all(
    viewportInputs.map(async ({ viewportId, orientation }) => {
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as PlanarViewport;

      await viewport.setDataList([
        {
          dataId,
          options: {
            orientation,
          },
        },
      ]);
      viewport.setDataPresentation(dataId, { voiRange: ctVoiRange });
    })
  );

  const segmentationRepresentation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
    ...(useSliceRendering
      ? {
          config: {
            useSliceRendering: true,
          },
        }
      : {}),
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    CT_AXIAL: [segmentationRepresentation],
    CT_SAGITTAL: [segmentationRepresentation],
    CT_CORONAL: [segmentationRepresentation],
  });

  renderingEngine.render();
}

run();
