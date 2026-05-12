const { defineInlineTest } = require('jscodeshift/dist/testUtils');
const transform = require('../src/transforms/rendering-engine-viewport-accessors');

defineInlineTest(
  transform,
  {},
  `
import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const stackViewports = renderingEngine.getStackViewports();
const volumeViewports = renderingEngine.getVolumeViewports();
`,
  `
import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const stackViewports = renderingEngine.getViewports().filter(utilities.viewportSupportsStackCompatibility);
const volumeViewports = renderingEngine.getViewports().filter(utilities.viewportSupportsVolumeCompatibility);
`,
  'replaces removed viewport list accessors'
);

defineInlineTest(
  transform,
  {},
  `
import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getStackViewport(viewportId);
await viewport.setStack(imageIds);
`,
  `
import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport(viewportId);

if (!utilities.viewportSupportsStackCompatibility(viewport)) {
  throw new Error('Viewport does not support setStack');
}

await viewport.setStack(imageIds);
`,
  'replaces getStackViewport and inserts a guard for simple declarations'
);

defineInlineTest(
  transform,
  {},
  `
import { utilities } from '@cornerstonejs/core';

const stackViewports = renderingEngine.getStackViewports();
`,
  `
import { utilities } from '@cornerstonejs/core';

const stackViewports = renderingEngine.getViewports().filter(utilities.viewportSupportsStackCompatibility);
`,
  'does not duplicate an existing utilities import'
);

defineInlineTest(
  transform,
  {},
  `
import type { Types } from '@cornerstonejs/core';

const stackViewports = renderingEngine.getStackViewports();
`,
  `
import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const stackViewports = renderingEngine.getViewports().filter(utilities.viewportSupportsStackCompatibility);
`,
  'does not add utilities to type-only imports'
);
