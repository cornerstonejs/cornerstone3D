import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, init as csInit } from '@cornerstonejs/core';
import { init as csTools3dInit } from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const content = document.getElementById('content');

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

async function setup() {
  await csInit();
  await csTools3dInit();

  // registerWebImageLoader(cs)

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInput = [
    {
      viewportId: 'CT_STACK',
      type: Enums.ViewportType.STACK,
      element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInput);
}

setup();
