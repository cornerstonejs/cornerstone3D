import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import { getRenderingEngine } from '@cornerstonejs/core';

enum ViewportType {
  STACK = 'mine',
  ORTHOGRAPHIC = 'other',
}

const mine = ViewportType.STACK;
const tool = csToolsEnums.MouseBindings.Primary;
const layout = { type: 'stack', columns: 2 };

function describe(viewport) {
  return viewport.getCurrentMode() === 'stack' ? 'a stack' : 'a volume';
}

console.log(
  mine,
  tool,
  layout,
  describe(getRenderingEngine('e').getViewport('v'))
);
