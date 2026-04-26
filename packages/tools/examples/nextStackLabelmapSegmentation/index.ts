import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  imageLoader,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  addDropdownToToolbar,
  setTitleAndDescription,
  addButtonToToolbar,
  addBrushSizeSlider,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  ZoomTool,
  StackScrollTool,
  Enums: csToolsEnums,
  RectangleScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

let renderingEngine: RenderingEngine;
let viewport: PlanarViewport;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK_VIEWPORT';
const viewportId2 = 'STACK_VIEWPORT_2';
const toolGroupId = 'TOOL_GROUP_ID';
const ctDataId = 'stack-labelmap-segmentation-next:ct';
const mgDataId = 'stack-labelmap-segmentation-next:mg';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Segmentation in StackViewport',
  'Here we demonstrate how to render a segmentation in StackViewport with a mammography image.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;
element1.style.width = size;
element1.style.height = size;
viewportGrid.appendChild(element1);

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;
element2.style.width = size;
element2.style.height = size;
viewportGrid.appendChild(element2);

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
  SphereBrush: 'SphereBrush',
  CircularEraser: 'CircularEraser',
  ThresholdBrushCircle: 'ThresholdBrushCircle',
  ThresholdBrushSphere: 'ThresholdBrushSphere',
  DynamicThreshold: 'DynamicThreshold',
  DynamicThresholdWithIslandRemoval: 'DynamicThresholdWithIslandRemoval',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.SphereBrush]: 'FILL_INSIDE_SPHERE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.ThresholdBrushCircle]: 'THRESHOLD_INSIDE_CIRCLE',
  [brushInstanceNames.ThresholdBrushSphere]: 'THRESHOLD_INSIDE_SPHERE',
  [brushInstanceNames.DynamicThreshold]: 'THRESHOLD_INSIDE_CIRCLE',
  [brushInstanceNames.DynamicThresholdWithIslandRemoval]:
    'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL',
};

const brushValues = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.SphereBrush,
  brushInstanceNames.CircularEraser,
  brushInstanceNames.ThresholdBrushCircle,
  brushInstanceNames.ThresholdBrushSphere,
  brushInstanceNames.DynamicThreshold,
  brushInstanceNames.DynamicThresholdWithIslandRemoval,
];

const thresholdBrushValues = [
  brushInstanceNames.ThresholdBrushCircle,
  brushInstanceNames.ThresholdBrushSphere,
  brushInstanceNames.DynamicThreshold,
  brushInstanceNames.DynamicThresholdWithIslandRemoval,
];

const optionsValues = [
  ...brushValues,
  RectangleScissorsTool.toolName,
  CircleScissorsTool.toolName,
  PaintFillTool.toolName,
];

const segmentationIds = ['SEGMENTATION_CT', 'SEGMENTATION_MG'];
const dropDownId = 'SEGMENTATION_DROPDOWN';

function updateSegmentationDropdownOptions(
  availableSegmentationIds,
  activeSegmentationId
) {
  const dropdown = document.getElementById(dropDownId) as HTMLSelectElement;

  dropdown.innerHTML = '';

  availableSegmentationIds.forEach((segmentationId) => {
    const option = document.createElement('option');
    option.value = segmentationId;
    option.innerText = segmentationId;
    dropdown.appendChild(option);
  });

  if (activeSegmentationId) {
    dropdown.value = activeSegmentationId;
  }
}

addBrushSizeSlider({
  toolGroupId,
});

addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup) {
      return;
    }

    const toolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    const thresholdDropdown = document.getElementById('thresholdDropdown');
    if (thresholdDropdown) {
      thresholdDropdown.style.display = thresholdBrushValues.includes(name)
        ? 'block'
        : 'none';
    }

    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

const thresholdOptions = ['CT Fat: (-150, -70)', 'CT Bone: (200, 1000)'];

addDropdownToToolbar({
  id: 'thresholdDropdown',
  options: {
    values: thresholdOptions,
    defaultValue: thresholdOptions[0],
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    let threshold;
    if (name === thresholdOptions[0]) {
      threshold = [-150, -70];
    } else if (name === thresholdOptions[1]) {
      threshold = [100, 1000];
    }

    segmentationUtils.setBrushThresholdForToolGroup(toolGroupId, threshold);
  },
}).style.display = 'none';

addButtonToToolbar({
  title: 'Create New Segmentation on Current Image',
  onClick: async () => {
    const currentImageId = viewport.getCurrentImageId();

    if (!currentImageId) {
      return;
    }

    const segmentationImage =
      await imageLoader.createAndCacheDerivedLabelmapImage(currentImageId);

    const newSegImageId = segmentationImage.imageId;
    const newSegmentationId = `SEGMENTATION_${newSegImageId}`;
    segmentationIds.push(newSegmentationId);

    segmentation.addSegmentations([
      {
        segmentationId: newSegmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: {
            imageIds: [newSegImageId],
          },
        },
      },
    ]);

    await segmentation.addSegmentationRepresentations(viewportId, [
      {
        segmentationId: newSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

    segmentation.activeSegmentation.setActiveSegmentation(
      viewportId,
      newSegmentationId
    );

    updateSegmentationDropdownOptions(segmentationIds, newSegmentationId);
  },
});

addButtonToToolbar({
  id: 'Undo',
  title: 'Undo',
  onClick() {
    DefaultHistoryMemo.undo();
  },
});

addButtonToToolbar({
  id: 'Redo',
  title: 'Redo',
  onClick() {
    DefaultHistoryMemo.redo();
  },
});

addSegmentIndexDropdown(segmentationIds[0]);

addDropdownToToolbar({
  id: dropDownId,
  labelText: 'Set Active Segmentation',
  options: { values: segmentationIds, defaultValue: '' },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    segmentation.activeSegmentation.setActiveSegmentation(viewportId, name);
    updateSegmentationDropdownOptions(segmentationIds, name);
  },
});

function setupTools(activeToolGroupId) {
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  const toolGroup = ToolGroupManager.createToolGroup(activeToolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addToolInstance(
    brushInstanceNames.DynamicThreshold,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.DynamicThreshold,
      threshold: {
        isDynamic: true,
        dynamicRadius: 3,
      },
      preview: {
        enabled: false,
      },
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.DynamicThresholdWithIslandRemoval,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.DynamicThresholdWithIslandRemoval,
      threshold: {
        isDynamic: true,
        dynamicRadius: 3,
      },
      preview: {
        enabled: false,
      },
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularBrush,
      preview: {
        enabled: false,
      },
      useCenterSegmentIndex: true,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.SphereBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.SphereBrush,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularEraser,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.ThresholdBrushCircle,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdBrushCircle,
      threshold: {
        range: [-150, -70],
        isDynamic: false,
      },
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.ThresholdBrushSphere,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.ThresholdBrushSphere,
      threshold: {
        range: [100, 1000],
        isDynamic: false,
      },
    }
  );

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
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
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  return toolGroup;
}

async function run() {
  await initDemo();

  const toolGroup = setupTools(toolGroupId);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const mgImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports([
    {
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: element1,
      defaultOptions: {
        background: getNextExampleBackground(),
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.PLANAR_NEXT,
      element: element2,
      defaultOptions: {
        background: getNextExampleBackground(),
      },
    },
  ]);

  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);

  viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
  const viewport2 = renderingEngine.getViewport<PlanarViewport>(viewportId2);

  const ctImageIds = imageIds.slice(0, 3);
  const ctSegImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(ctImageIds);
  const mgSegImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(mgImageIds);
  const mgStackImageIds = [...mgImageIds, ctImageIds[2]];

  utilities.viewportNextDataSetMetadataProvider.add(ctDataId, {
    kind: 'planar',
    imageIds: ctImageIds,
    initialImageIdIndex: 0,
  });
  utilities.viewportNextDataSetMetadataProvider.add(mgDataId, {
    kind: 'planar',
    imageIds: mgStackImageIds,
    initialImageIdIndex: 0,
  });

  await viewport.setDataList([
    {
      dataId: ctDataId,
      options: {},
    },
  ]);
  await viewport2.setDataList([
    {
      dataId: mgDataId,
      options: {},
    },
  ]);

  cornerstoneTools.utilities.stackContextPrefetch.enable(element1);
  cornerstoneTools.utilities.stackContextPrefetch.enable(element2);

  renderingEngine.renderViewports([viewportId, viewportId2]);

  segmentation.addSegmentations([
    {
      segmentationId: segmentationIds[0],
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: ctSegImages.map((it) => it.imageId),
        },
      },
    },
  ]);

  segmentation.addSegmentations([
    {
      segmentationId: segmentationIds[1],
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: [
            ...mgSegImages.map((it) => it.imageId),
            ctSegImages[2].imageId,
          ],
        },
      },
    },
  ]);

  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId: segmentationIds[0],
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  await segmentation.addSegmentationRepresentations(viewportId2, [
    {
      segmentationId: segmentationIds[1],
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

run();
