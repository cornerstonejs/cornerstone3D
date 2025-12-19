import {
  RenderingEngine,
  Enums,
  imageLoader,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addButtonToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  RegionSegmentPlusTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
  utilities: cstUtils,
  PanTool,
  ZoomTool,
  StackScrollTool,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'PT_STACK_VIEWPORT_1';
const viewportId2 = 'PT_STACK_VIEWPORT_2';
const segmentationId1 = 'MY_SEGMENTATION_ID_1';
const segmentationId2 = 'MY_SEGMENTATION_ID_2';
const toolGroupId = 'STACK_TOOL_GROUP_ID';
let toolGroup;
let viewport1;
let viewport2;

setTitleAndDescription(
  'Region Segment Plus Tool with Stack Viewport',
  'Demonstrates how to create a segmentation with a single click and running grow cut algorithm in the gpu using a stack viewport with PT data'
);

const content = document.getElementById('content');

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = '1fr 1fr';
viewportGrid.style.gap = '10px';
viewportGrid.style.width = '1010px';
viewportGrid.style.height = '500px';

const element1 = document.createElement('div');
element1.oncontextmenu = (e) => e.preventDefault();
element1.style.width = '500px';
element1.style.height = '500px';

const element2 = document.createElement('div');
element2.oncontextmenu = (e) => e.preventDefault();
element2.style.width = '500px';
element2.style.height = '500px';

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
content.appendChild(viewportGrid);

const info = document.createElement('div');
content.appendChild(info);

// prettier-ignore
createInfoSection(content)
  .addInstruction('Click on the bright spot you want to segment')
  .addInstruction('Wait for a few seconds to get that region segmented')
  .addInstruction('Left Click: Use Region Segment Plus Tool')
  .addInstruction('Middle Click: Pan')
  .addInstruction('Right Click: Zoom')
  .addInstruction('Mouse Wheel: Scroll through stack');

// ==[ Toolbar ]================================================================

addButtonToToolbar({
  title: 'Shrink',
  onClick: async () => {
    toolGroup.getToolInstance(RegionSegmentPlusTool.toolName).shrink();
  },
});

addButtonToToolbar({
  title: 'Expand',
  onClick: async () => {
    toolGroup.getToolInstance(RegionSegmentPlusTool.toolName).expand();
  },
});

addButtonToToolbar({
  title: 'Clear segmentation',
  onClick: async () => {
    [segmentationId1, segmentationId2].forEach((segId) => {
      const labelmapImage = cache.getImageLoadObject(segId);
      if (labelmapImage && labelmapImage.image) {
        const voxelManager = labelmapImage.image.voxelManager;
        voxelManager.clear();
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
          segId
        );
      }
    });
  },
});

addSliderToToolbar({
  title: 'Positive threshold (10%)',
  range: [0, 100],
  defaultValue: 5,
  label: {
    html: 'test',
  },
  onSelectedValueChange: (value: string) => {
    updateSeedVariancesConfig({ positiveSeedVariance: value });
  },
  updateLabelOnChange: (value: string, label: HTMLElement) => {
    label.innerHTML = `Positive threshold (${value}%)`;
  },
});

addSliderToToolbar({
  title: 'Negative threshold (50%)',
  range: [0, 100],
  defaultValue: 50,
  label: {
    html: 'test',
  },
  onSelectedValueChange: (value: string) => {
    updateSeedVariancesConfig({ negativeSeedVariance: value });
  },
  updateLabelOnChange: (value: string, label: HTMLElement) => {
    label.innerHTML = `Negative threshold (${value}%)`;
  },
});

// =============================================================================

const updateSeedVariancesConfig = cstUtils.throttle(
  ({ positiveSeedVariance, negativeSeedVariance }) => {
    const toolInstance = toolGroup.getToolInstance(
      RegionSegmentPlusTool.toolName
    );
    const { configuration: config } = toolInstance;

    if (positiveSeedVariance !== undefined) {
      config.positiveSeedVariance = Number(positiveSeedVariance) / 100;
    }

    if (negativeSeedVariance !== undefined) {
      config.negativeSeedVariance = Number(negativeSeedVariance) / 100;
    }

    toolInstance.refresh();
  },
  1000
);

async function addSegmentationToState(imageIds, segId) {
  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId: segId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);
}

async function run() {
  await initDemo({});

  cornerstoneTools.addTool(RegionSegmentPlusTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(RegionSegmentPlusTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(RegionSegmentPlusTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
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

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  const imageIds1 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.2.826.0.1.3680043.2.1125.1.11608962641993666019702920539307840',
    SeriesInstanceUID:
      '1.2.826.0.1.3680043.2.1125.1.71880611468617661972108550785274516',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  await addSegmentationToState(imageIds1, segmentationId1);
  await addSegmentationToState(imageIds2, segmentationId2);

  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
    },
    {
      viewportId: viewportId2,
      type: ViewportType.STACK,
      element: element2,
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  viewport1 = renderingEngine.getViewport(viewportId1);
  viewport2 = renderingEngine.getViewport(viewportId2);

  await viewport1.setStack(imageIds1, 80);
  await viewport2.setStack(imageIds2, 80);

  cornerstoneTools.utilities.stackContextPrefetch.enable(element1);
  cornerstoneTools.utilities.stackContextPrefetch.enable(element2);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);

  await segmentation.addSegmentationRepresentations(viewportId1, [
    {
      segmentationId: segmentationId1,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  await segmentation.addSegmentationRepresentations(viewportId2, [
    {
      segmentationId: segmentationId2,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  renderingEngine.renderViewports([viewportId1, viewportId2]);
}

run();
