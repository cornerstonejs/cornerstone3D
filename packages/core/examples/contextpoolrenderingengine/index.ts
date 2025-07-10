import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  getRenderingEngine,
  RenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

const { ViewportType } = Enums;

// ======== Set up page ======== //
const params = new URLSearchParams(window.location.search);

const rows = parseInt(params.get('rows')) || 6;
const columns = parseInt(params.get('columns')) || 6;
const count = rows * columns;

setTitleAndDescription(
  `${columns}x${rows} Grid with ContextPoolRenderingEngine`,
  `Displays a ${columns}x${rows} grid of viewports using ContextPoolRenderingEngine with resize observer`
);

const renderingEngineId = 'myContextPoolRenderingEngine';
let renderingEngine: RenderingEngine;
let resizeTimeout: number;

// Debounced resize handler
const handleResize = () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    renderingEngine = getRenderingEngine(renderingEngineId);

    if (renderingEngine) {
      renderingEngine.resize(true, false);
    }
  }, 50); // 50ms debounce
};

// Set up ResizeObserver for dynamic resizing
const resizeObserver = new ResizeObserver(handleResize);

const content = document.getElementById('content');

// Create viewport container using flexbox
const viewportContainer = document.createElement('div');
viewportContainer.id = 'viewportContainer';
viewportContainer.style.display = 'flex';
viewportContainer.style.flexDirection = 'column';
viewportContainer.style.width = '95vw';
viewportContainer.style.height = '90vh';
viewportContainer.style.backgroundColor = 'darkred';
viewportContainer.style.gap = '2px';

content.appendChild(viewportContainer);

// Create rows*columns viewport elements
const elements: HTMLDivElement[] = [];
const viewportIds: string[] = [];

// Create rows and columns
for (let row = 0; row < rows; row++) {
  const rowContainer = document.createElement('div');
  rowContainer.style.display = 'flex';
  rowContainer.style.flexDirection = 'row';
  rowContainer.style.flex = '1';
  rowContainer.style.width = '100%';
  rowContainer.style.gap = '2px';

  for (let col = 0; col < columns; col++) {
    const element = document.createElement('div');
    element.style.flex = '1';
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.style.background = '#1a1a1a';
    element.style.minWidth = '0';
    element.style.minHeight = '0';

    // Disable right click context menu
    element.oncontextmenu = (e) => e.preventDefault();

    // Add to row
    rowContainer.appendChild(element);

    // Store element and create viewport ID
    elements.push(element);
    viewportIds.push(`viewport_${row}_${col}`);

    // Observe element for resizing
    resizeObserver.observe(element);
  }

  viewportContainer.appendChild(rowContainer);
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

  // Instantiate a ContextPoolRenderingEngine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create viewport input array for all 36 viewports
  const viewportInputArray: Types.PublicViewportInput[] = [];

  for (let i = 0; i < count; i++) {
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
  const imagesPerViewport = Math.max(1, Math.floor(numImages / count));

  // Set stack and render for each viewport
  for (let i = 0; i < count; i++) {
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
  if (!window.IS_PLAYWRIGHT) {
    const info = document.createElement('div');
    info.style.position = 'absolute';
    info.style.top = '10px';
    info.style.right = '10px';
    info.style.color = 'white';
    info.style.backgroundColor = 'rgba(0,0,0,0.7)';
    info.style.padding = '10px';
    info.style.borderRadius = '5px';
    info.innerHTML = `
    <h3>ContextPoolRenderingEngine Example</h3>
    <p>${count} viewports (${columns}x${rows} grid)</p>
    <p>Using ContextPoolRenderingEngine for better performance with large viewport counts</p>
    <p>Resize the window to test resize observer</p>
    <p style="color: #4CAF50;">Avoids WebGL, browser and OS limits</p>
  `;
    content.appendChild(info);
  }
}

run();
