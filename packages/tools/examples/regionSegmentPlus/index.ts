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

// This is for debugging purposes
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
const viewportId = 'PT_STACK_VIEWPORT';
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'STACK_TOOL_GROUP_ID';
let toolGroup;
let viewport;

// ======== Set up page ======== //
setTitleAndDescription(
  'Region Segment Plus Tool with Stack Viewport',
  'Demonstrates how to create a segmentation with a single click and running grow cut algorithm in the gpu using a stack viewport with PT data'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

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
    const labelmapImage = cache.getImageLoadObject(segmentationId);
    if (labelmapImage && labelmapImage.image) {
      const voxelManager = labelmapImage.image.voxelManager;
      voxelManager.clear();

      segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
        segmentationId
      );
    }
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

async function addSegmentationToState(imageIds) {
  // Create segmentation images for each image in the stack
  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
    imageIds
  );

  // Add the segmentation to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo({});

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(RegionSegmentPlusTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(RegionSegmentPlusTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools
  toolGroup.setToolActive(RegionSegmentPlusTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel, // Mouse Wheel
      },
    ],
  });

  // Get Cornerstone imageIds for PT data
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.2.826.0.1.3680043.2.1125.1.11608962641993666019702920539307840',
    SeriesInstanceUID:
      '1.2.826.0.1.3680043.2.1125.1.71880611468617661972108550785274516',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
  //   wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  // });

  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // MG
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
  //   wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  // });
  // Create segmentation for the stack
  await addSegmentationToState(imageIds);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId: viewportId,
    type: ViewportType.STACK,
    element: element,
  };

  renderingEngine.setViewports([viewportInput]);
  viewport = renderingEngine.getViewport(viewportId);

  // Set the stack of images on the viewport
  // await viewport.setStack(imageIds);
  await viewport.setStack(imageIds, 80);

  cornerstoneTools.utilities.stackContextPrefetch.enable(element);

  // Add the viewport to the toolgroup
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Add segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId: segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Render the viewport
  renderingEngine.renderViewports([viewportId]);
}

run();
