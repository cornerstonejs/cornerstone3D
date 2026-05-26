import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, imageLoader } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { fillStackSegmentationWithMockData } from '../../../../utils/test/fillStackSegmentationWithMockData';
import * as cornerstone from '@cornerstonejs/core';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { segmentation } = cornerstoneTools;
const { ViewportType } = Enums;
const { SegmentationRepresentations } = cornerstoneTools.Enums;

// Define unique ids
const renderingEngineId = 'myRenderingEngine';
const viewportIds = [
  // Row 1 - Non-segmentation viewports
  'VIEWPORT_1', // Normal
  'VIEWPORT_2', // Flip Vertical
  'VIEWPORT_3', // Flip Horizontal
  'VIEWPORT_4', // Flip Both
  // Row 2 - Segmentation viewports
  'VIEWPORT_5', // Normal + Seg
  'VIEWPORT_6', // Flip Vertical + Seg
  'VIEWPORT_7', // Flip Horizontal + Seg
  'VIEWPORT_8', // Flip Both + Seg
];
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewports with Segmentation and Cine',
  'This example demonstrates 8 viewports in a 4x2 grid. Row 1 shows non-segmentation viewports with different flip combinations. Row 2 shows the same but with segmentation. All viewports have cine playback.'
);

const size = '200px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'column';
viewportGrid.style.gap = '10px';

// Create elements and containers for all 8 viewports
const elements = [];
const containers = [];

// Create labels for each viewport
const createLabel = (text) => {
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = '5px';
  label.style.left = '5px';
  label.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  label.style.color = 'white';
  label.style.padding = '2px 6px';
  label.style.fontSize = '11px';
  label.style.fontFamily = 'Arial, sans-serif';
  label.style.borderRadius = '3px';
  label.style.zIndex = '1000';
  label.textContent = text;
  return label;
};

// Labels for all viewports
const labels = [
  // Row 1 - Non-segmentation
  'Normal',
  'Flip Vertical',
  'Flip Horizontal',
  'Flip Both',
  // Row 2 - Segmentation
  'Normal + Seg',
  'Flip Vertical + Seg',
  'Flip Horizontal + Seg',
  'Flip Both + Seg',
];

// Create all viewport elements
for (let i = 0; i < 8; i++) {
  const container = document.createElement('div');
  container.style.position = 'relative';

  const element = document.createElement('div');
  element.style.width = size;
  element.style.height = size;
  element.oncontextmenu = (e) => e.preventDefault();

  const label = createLabel(labels[i]);

  container.appendChild(element);
  container.appendChild(label);

  elements.push(element);
  containers.push(container);
}

// Create two rows
const row1 = document.createElement('div');
row1.style.display = 'flex';
row1.style.flexDirection = 'row';
row1.style.gap = '5px';

const row2 = document.createElement('div');
row2.style.display = 'flex';
row2.style.flexDirection = 'row';
row2.style.gap = '5px';

// Add first 4 viewports to row 1
for (let i = 0; i < 4; i++) {
  row1.appendChild(containers[i]);
}

// Add last 4 viewports to row 2
for (let i = 4; i < 8; i++) {
  row2.appendChild(containers[i]);
}

viewportGrid.appendChild(row1);
viewportGrid.appendChild(row2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
Row 1 (4 viewports without segmentation):
- Normal, Flip Vertical, Flip Horizontal, Flip Both

Row 2 (4 viewports with segmentation):
- Normal + Seg, Flip Vertical + Seg, Flip Horizontal + Seg, Flip Both + Seg

All viewports have cine playback enabled.
No interactive tools - viewports are for display only.
`;

content.append(instructions);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [];
  for (let i = 0; i < 8; i++) {
    viewportInputArray.push({
      viewportId: viewportIds[i],
      type: ViewportType.STACK,
      element: elements[i],
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    });
  }

  renderingEngine.setViewports(viewportInputArray);

  // Get the stack viewports
  const stackViewports = renderingEngine.getStackViewports();

  // Set the stack on each viewport
  for (const viewport of stackViewports) {
    await viewport.setStack(imageIds);
  }

  // Apply flips to viewports based on their position
  // Row 1 (indices 0-3): No seg
  // Index 1: Flip Vertical
  renderingEngine.getViewport(viewportIds[1]).setCamera({ flipVertical: true });

  // Index 2: Flip Horizontal
  renderingEngine
    .getViewport(viewportIds[2])
    .setCamera({ flipHorizontal: true });

  // Index 3: Flip Both
  renderingEngine.getViewport(viewportIds[3]).setCamera({
    flipHorizontal: true,
    flipVertical: true,
  });

  // Row 2 (indices 4-7): With seg
  // Index 5: Flip Vertical + Seg
  renderingEngine.getViewport(viewportIds[5]).setCamera({ flipVertical: true });

  // Index 6: Flip Horizontal + Seg
  renderingEngine
    .getViewport(viewportIds[6])
    .setCamera({ flipHorizontal: true });

  // Index 7: Flip Both + Seg
  renderingEngine.getViewport(viewportIds[7]).setCamera({
    flipHorizontal: true,
    flipVertical: true,
  });

  // Render the viewports
  renderingEngine.renderViewports(viewportIds);

  // Create segmentation labelmap images
  const segmentationImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  // Add the segmentation to the state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImages.map((image) => image.imageId),
        },
      },
    },
  ]);

  // Fill segmentation with mock data
  fillStackSegmentationWithMockData({
    imageIds,
    segmentationImageIds: segmentationImages.map((image) => image.imageId),
    cornerstone,
  });

  // Add segmentation representation to row 2 viewports (indices 4-7)
  const segmentationRepresentation = {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  };

  const segmentationViewportMap = {};
  for (let i = 4; i < 8; i++) {
    segmentationViewportMap[viewportIds[i]] = [segmentationRepresentation];
  }

  await segmentation.addLabelmapRepresentationToViewportMap(
    segmentationViewportMap
  );

  // Set up cine playback for all viewports
  for (let i = 0; i < 8; i++) {
    const viewport = renderingEngine.getViewport(viewportIds[i]);
    cornerstoneTools.utilities.cine.playClip(viewport.element, {
      framesPerSecond: 24,
    });
  }
}

run();
