import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngineSequential,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  '6x6 Grid with RenderingEngineSequential',
  'Displays a 6x6 grid of viewports using RenderingEngineSequential with resize observer'
);

const renderingEngineId = 'myRenderingEngineSequential';
let renderingEngine: RenderingEngineSequential;

// Set up ResizeObserver for dynamic resizing
const resizeObserver = new ResizeObserver(() => {
  renderingEngine = getRenderingEngine(
    renderingEngineId
  ) as RenderingEngineSequential;

  if (renderingEngine) {
    renderingEngine.resize(true, false);
  }
});

const content = document.getElementById('content');

// Create viewport grid
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateRows = 'repeat(6, 1fr)';
viewportGrid.style.gridTemplateColumns = 'repeat(6, 1fr)';
viewportGrid.style.width = '95vw';
viewportGrid.style.height = '90vh';
viewportGrid.style.gap = '2px';
viewportGrid.style.backgroundColor = '#000';

content.appendChild(viewportGrid);

// Create 36 viewport elements
const elements: HTMLDivElement[] = [];
const viewportIds: string[] = [];

for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 6; col++) {
    const element = document.createElement('div');
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.background = '#1a1a1a';

    // Disable right click context menu
    element.oncontextmenu = (e) => e.preventDefault();

    // Add to grid
    viewportGrid.appendChild(element);

    // Store element and create viewport ID
    elements.push(element);
    viewportIds.push(`viewport_${row}_${col}`);

    // Observe element for resizing
    resizeObserver.observe(element);
  }
}

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

  // Instantiate a RenderingEngineSequential
  renderingEngine = new RenderingEngineSequential(renderingEngineId);

  // Create viewport input array for all 36 viewports
  const viewportInputArray: Types.PublicViewportInput[] = [];

  for (let i = 0; i < 36; i++) {
    viewportInputArray.push({
      viewportId: viewportIds[i],
      type: ViewportType.STACK,
      element: elements[i],
      defaultOptions: {
        background: [0.1, 0.1, 0.1] as Types.Point3,
      },
    });
  }

  // Set all viewports at once
  renderingEngine.setViewports(viewportInputArray);

  // Prepare stacks for each viewport
  // We'll display different images from the series in each viewport
  const numImages = imageIds.length;
  const imagesPerViewport = Math.max(1, Math.floor(numImages / 36));

  // Set stack and render for each viewport
  for (let i = 0; i < 36; i++) {
    const viewport = renderingEngine.getViewport(
      viewportIds[i]
    ) as Types.IStackViewport;

    // Calculate which image to show
    const imageIndex = Math.min(i * imagesPerViewport, numImages - 1);
    const stack = [imageIds[imageIndex]];

    // Set the stack on the viewport
    await viewport.setStack(stack);

    // Set the VOI of the stack
    viewport.setProperties({ voiRange: ctVoiRange });
  }

  // Render all viewports
  renderingEngine.render();

  // Add performance info
  const info = document.createElement('div');
  info.style.position = 'absolute';
  info.style.top = '10px';
  info.style.right = '10px';
  info.style.color = 'white';
  info.style.backgroundColor = 'rgba(0,0,0,0.7)';
  info.style.padding = '10px';
  info.style.borderRadius = '5px';
  info.innerHTML = `
    <h3>RenderingEngineSequential Example</h3>
    <p>36 viewports (6x6 grid)</p>
    <p>Using RenderingEngineSequential for better performance with large viewport counts</p>
    <p>Resize the window to test resize observer</p>
    <p style="color: #4CAF50;">Sequential rendering reduces GPU memory pressure</p>
  `;
  content.appendChild(info);
}

run();
