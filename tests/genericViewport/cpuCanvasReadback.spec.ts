import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createExampleUrl, getVisibleViewportCanvas } from '../utils/index';

const SETTLE_MS = 5000;
const READBACK_WARNING = /willReadFrequently|Multiple readback operations/i;

type Readback = {
  canvas: number;
  willReadFrequently: boolean;
  count: number;
  stack: string;
};

/**
 * Counts each `getImageData` per 2D canvas and keeps whether the context of
 * that canvas was made with `willReadFrequently`. Chrome warns once a canvas
 * that is not marked so has been read back more than once, and only when it
 * keeps that canvas on the GPU, which a headless run may not do; the count
 * finds the same canvases in any run.
 */
function recordReadbacks() {
  const ids = new WeakMap<object, number>();
  const options = new WeakMap<object, boolean>();
  const readbacks = new Map<number, Readback>();
  let next = 1;
  const getContext = HTMLCanvasElement.prototype.getContext;
  const offscreenGetContext = globalThis.OffscreenCanvas?.prototype.getContext;
  const idOf = (canvas: object) => {
    if (!ids.has(canvas)) {
      ids.set(canvas, next++);
    }
    return ids.get(canvas);
  };

  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === '2d' && !options.has(this)) {
      options.set(this, !!attributes?.willReadFrequently);
    }
    return getContext.call(this, type, attributes);
  } as typeof getContext;

  if (offscreenGetContext) {
    OffscreenCanvas.prototype.getContext = function (type, attributes) {
      if (type === '2d' && !options.has(this)) {
        options.set(this, !!attributes?.willReadFrequently);
      }
      return offscreenGetContext.call(this, type, attributes);
    } as typeof offscreenGetContext;
  }

  const wrap = (prototype) => {
    const getImageData = prototype.getImageData;

    prototype.getImageData = function (...args) {
      const canvas = this.canvas;
      const id = idOf(canvas);
      const entry = readbacks.get(id) ?? {
        canvas: id,
        willReadFrequently: !!options.get(canvas),
        count: 0,
        stack: '',
      };

      entry.count++;
      entry.stack ||= new Error().stack?.split('\n').slice(2, 7).join('\n');
      readbacks.set(id, entry);

      return getImageData.apply(this, args);
    };
  };

  wrap(CanvasRenderingContext2D.prototype);

  if (globalThis.OffscreenCanvasRenderingContext2D) {
    wrap(OffscreenCanvasRenderingContext2D.prototype);
  }

  (window as unknown as { __readbacks: () => Readback[] }).__readbacks = () => [
    ...readbacks.values(),
  ];
}

async function openOnCpu(page: Page, example: string, warnings: string[]) {
  page.on('console', (message) => {
    if (READBACK_WARNING.test(message.text())) {
      warnings.push(message.text());
    }
  });
  await page.addInitScript(recordReadbacks);

  const url = createExampleUrl(example + '.html');

  url.searchParams.set('cpu', 'true');
  await page.goto(url.toString());
  await page.waitForSelector('div#content');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(SETTLE_MS);
}

async function scrollAndDrag(page: Page, button: 'left' | 'middle') {
  const canvas = getVisibleViewportCanvas(page);
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error('The viewport canvas is not visible');
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);

  for (let tick = 0; tick < 6; tick++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
  }

  await page.mouse.down({ button });

  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(x + step * 8, y + step * 5);
    await page.waitForTimeout(50);
  }

  await page.mouse.up({ button });
  await page.waitForTimeout(1000);
}

async function getRepeatedReadbacks(page: Page): Promise<Readback[]> {
  const readbacks = await page.evaluate(() =>
    (window as unknown as { __readbacks: () => Readback[] }).__readbacks()
  );

  return readbacks.filter(
    (readback) => readback.count > 1 && !readback.willReadFrequently
  );
}

/**
 * Puts the window level tool on the first mouse button and the stack scroll
 * tool on the wheel in every tool group, and takes the first button from the
 * tool that had it.
 */
function useWindowLevelAndScroll() {
  const tools = (
    window as unknown as {
      cornerstoneTools: typeof import('@cornerstonejs/tools');
    }
  ).cornerstoneTools;
  const { ToolGroupManager, WindowLevelTool, StackScrollTool, Enums } = tools;

  tools.addTool(WindowLevelTool);
  tools.addTool(StackScrollTool);

  for (const toolGroup of ToolGroupManager.getAllToolGroups()) {
    for (const [toolName, options] of Object.entries(toolGroup.toolOptions)) {
      const onPrimary = options.bindings?.some(
        (binding) =>
          binding.mouseButton === Enums.MouseBindings.Primary &&
          !binding.modifierKey
      );

      if (options.mode === Enums.ToolModes.Active && onPrimary) {
        toolGroup.setToolPassive(toolName);
      }
    }

    for (const tool of [WindowLevelTool, StackScrollTool]) {
      if (!toolGroup.hasTool(tool.toolName)) {
        toolGroup.addTool(tool.toolName);
      }
    }

    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
    });
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
    });
  }
}

test.describe('CPU path: no repeated readback of a 2D canvas', () => {
  test('a stack through a scroll and a window level drag', async ({ page }) => {
    const warnings: string[] = [];

    await openOnCpu(page, 'genericStackManipulationTools', warnings);
    await scrollAndDrag(page, 'left');

    expect({
      repeated: await getRepeatedReadbacks(page),
      warnings,
    }).toEqual({ repeated: [], warnings: [] });
  });

  test('a fused volume slice through a scroll and a window level drag', async ({
    page,
  }) => {
    const warnings: string[] = [];

    await openOnCpu(page, 'genericMultiVolumeAPI', warnings);
    await page.evaluate(useWindowLevelAndScroll);
    await scrollAndDrag(page, 'left');

    expect({
      repeated: await getRepeatedReadbacks(page),
      warnings,
    }).toEqual({ repeated: [], warnings: [] });
  });

  test('an MPR that shows the faces of the volume through a scroll and a window level drag', async ({
    page,
  }) => {
    const warnings: string[] = [];

    await openOnCpu(page, 'genericVolumeAnnotationTools', warnings);
    await page.evaluate(useWindowLevelAndScroll);
    await page.evaluate(() => {
      const { getRenderingEngines } = (
        window as unknown as {
          cornerstone: typeof import('@cornerstonejs/core');
        }
      ).cornerstone;

      for (const renderingEngine of getRenderingEngines()) {
        for (const viewport of renderingEngine.getViewports()) {
          (viewport as import('@cornerstonejs/core').PlanarViewport).setZoom(
            0.6
          );
          viewport.render();
        }
      }
    });
    await page.waitForTimeout(1000);
    await scrollAndDrag(page, 'left');

    expect({
      repeated: await getRepeatedReadbacks(page),
      warnings,
    }).toEqual({ repeated: [], warnings: [] });
  });
});
