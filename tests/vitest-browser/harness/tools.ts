// Shared @cornerstonejs/tools test harness for vitest-browser state tests.
//
// Factors the proven patterns from tests/vitest-browser/toolMeasurements.browser.test.ts
// (do not modify that file) into reusable primitives: tool-group bootstrap on
// top of the GenericViewport harness (./createPlanarViewport), and synthetic
// pointer-event dispatch that mirrors the real DOM event flow @cornerstonejs/tools
// depends on (see packages/tools/src/eventListeners/mouse/mouseDownListener.ts).
//
// FROZEN CONTRACT: this module's exported signatures are relied on by five
// other vitest-browser suites (plans 08-12). Do not change existing exported
// signatures; additive exports are fine but must be documented in the
// consuming plan's final report.
//
// Black-box rule: this file itself only imports the PUBLIC @cornerstonejs/tools
// and @cornerstonejs/core entry points (never packages/tools/src/**), same as
// any spec file built on top of it.

import * as cornerstoneTools from '@cornerstonejs/tools';
import { utilities } from '@cornerstonejs/core';
import {
  createPlanarViewport,
  type CreatePlanarViewportOptions,
  type PlanarViewportContext,
} from './createPlanarViewport';

const { ToolGroupManager, annotation, cancelActiveManipulations } =
  cornerstoneTools;
const { MouseBindings } = cornerstoneTools.Enums;

// Minimal shape needed from a tool class: `addTool`/`toolGroup.addTool` only
// ever need the static `toolName`. Kept separate from the frozen `unknown[]`
// parameter type below so internals stay type-safe without changing the
// public signature.
interface ToolClassLike {
  toolName: string;
}

export interface SetupToolsOptions {
  /** default: generated unique id, namespaced by the harness viewportId once known */
  toolGroupId?: string;
  /** Tool classes; each gets addTool(t) (idempotent-safe) + toolGroup.addTool(t.toolName). */
  tools?: unknown[];
  /** toolName to setToolActive with a Primary mouse binding. */
  activeTool?: string;
  /** Forwarded to createPlanarViewport. */
  viewport?: CreatePlanarViewportOptions;
}

export interface ToolsContext extends PlanarViewportContext {
  /** The IToolGroup returned by ToolGroupManager.createToolGroup. */
  toolGroup: unknown;
  toolGroupId: string;
  /** Idempotent: safe to call more than once. */
  cleanup(): void;
}

let toolsHarnessInstanceCounter = 0;

function nextToolGroupId(namespace: string): string {
  toolsHarnessInstanceCounter += 1;
  return `${namespace}-${toolsHarnessInstanceCounter}-${utilities.uuidv4()}`;
}

/**
 * Boots @cornerstonejs/tools against a fresh harness viewport: init(),
 * addTool for every requested tool class, a dedicated tool group, the
 * viewport attached to it, and (if requested) the tool set active with a
 * Primary mouse binding.
 *
 * CRITICAL ordering: cornerstoneTools.init() + addTool() run BEFORE
 * createPlanarViewport() -- tools wires its element listeners from the
 * synchronous ELEMENT_ENABLED event fired inside enableElement(). Calling
 * init() afterwards misses that event and leaves the element with no tools
 * listeners at all (mousedown/mousemove dispatch silently does nothing).
 * Mirrors packages/tools/src/init.ts + store/addEnabledElement.ts and the
 * reference test's setupToolTest.
 */
export async function setupTools(
  opts: SetupToolsOptions = {}
): Promise<ToolsContext> {
  const tools = opts.tools ?? [];

  cornerstoneTools.init();
  tools.forEach((toolClass) => {
    cornerstoneTools.addTool(toolClass);
  });

  const viewportCtx = await createPlanarViewport(opts.viewport);

  const toolGroupId =
    opts.toolGroupId ?? nextToolGroupId(`vitest-tools:${viewportCtx.viewportId}`);
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  if (!toolGroup) {
    viewportCtx.cleanup();
    cornerstoneTools.destroy();
    throw new Error(`Failed to create tool group ${toolGroupId}`);
  }

  tools.forEach((toolClass) => {
    toolGroup.addTool((toolClass as ToolClassLike).toolName);
  });

  toolGroup.addViewport(viewportCtx.viewportId, viewportCtx.renderingEngine.id);

  if (opts.activeTool) {
    toolGroup.setToolActive(opts.activeTool, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  }

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    // Teardown order (see plans/vitest-browser-state-tests/00b-tools-shared-context.md):
    // cancel any live manipulation, destroy the tool group + global tool
    // registry + annotation state, THEN tear down the viewport/rendering
    // engine, and finally reset @cornerstonejs/tools entirely so the next
    // test's init() starts from a clean slate. Each step is independently
    // guarded so a failure in one (e.g. nothing to cancel) never skips the
    // rest.
    try {
      cancelActiveManipulations(viewportCtx.element);
    } catch {
      // Nothing active to cancel -- not an error.
    }

    try {
      ToolGroupManager.destroyToolGroup(toolGroupId);
    } catch {
      // Already destroyed -- not an error.
    }

    try {
      annotation.state.removeAllAnnotations();
    } catch {
      // No annotation manager state to clear -- not an error.
    }

    viewportCtx.cleanup();

    try {
      cornerstoneTools.destroy();
    } catch {
      // Already destroyed -- not an error.
    }
  };

  return {
    ...viewportCtx,
    toolGroup,
    toolGroupId,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Input synthesis
//
// Mirrors packages/tools/test/LengthTool_test.js and
// packages/tools/src/eventListeners/mouse/mouseDownListener.ts: a native
// `mousedown` dispatched on the viewport element, followed by `mousemove`(s)
// and `mouseup` dispatched on `document` (mouseDownListener adds its
// move/up listeners to `document`, not the element, for the duration of a
// held button). Canvas points are rounded to integers before dispatch
// (client/page coordinates round-trip cleanly only at integer canvas
// pixels -- see getMouseEventPoints.ts), so callers must derive their
// expected values from the SAME rounded canvas point via
// `viewport.canvasToWorld`/`worldToCanvas`.
// ---------------------------------------------------------------------------

function roundCanvasPoint(point: [number, number]): [number, number] {
  return [Math.round(point[0]), Math.round(point[1])];
}

function clientPointFromCanvasPoint(
  element: HTMLElement,
  canvasPoint: [number, number]
): [number, number] {
  const rect = element.getBoundingClientRect();
  return [canvasPoint[0] + rect.left, canvasPoint[1] + rect.top];
}

function dispatchMouseDownOnElement(
  element: HTMLElement,
  canvasPoint: [number, number],
  buttons: number
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  element.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons,
      clientX,
      clientY,
    })
  );
}

function dispatchMouseMoveOnDocument(
  element: HTMLElement,
  canvasPoint: [number, number],
  buttons: number
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons,
      clientX,
      clientY,
    })
  );
}

function dispatchMouseUpOnDocument(
  element: HTMLElement,
  canvasPoint: [number, number]
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  document.dispatchEvent(
    new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 0,
      clientX,
      clientY,
    })
  );
}

/**
 * Single click: mousedown on the element followed by mouseup on document, at
 * the same canvas point. `opts.button` is the `MouseEvent.buttons` bitmask
 * (cornerstoneTools reads `evt.buttons` exclusively, never `evt.button`);
 * default is `MouseBindings.Primary` (1), i.e. the left button.
 */
export function mouseClick(
  element: HTMLElement,
  canvasPoint: [number, number],
  opts: { button?: number } = {}
): void {
  const point = roundCanvasPoint(canvasPoint);
  const buttons = opts.button ?? MouseBindings.Primary;

  dispatchMouseDownOnElement(element, point, buttons);
  dispatchMouseUpOnDocument(element, point);
}

/**
 * Drag gesture: mousedown at `fromCanvas`, one or more mousemoves ending
 * exactly at `toCanvas`, then mouseup at `toCanvas`. `opts.steps` (default 2,
 * clamped to a minimum of 2) is the number of mousemove dispatches; they are
 * linearly interpolated from `fromCanvas` to `toCanvas` so the first move
 * already covers a meaningful fraction of the total distance.
 *
 * The first dispatched move must exceed the 3px double-click-drag tolerance
 * in mouseDownListener.ts (DOUBLE_CLICK_DRAG_TOLERANCE) so the gesture is
 * recognized as a drag synchronously instead of waiting on the 400ms
 * double-click timer -- true automatically for any `steps` at the default
 * when the total drag distance is more than a few pixels, which holds for
 * every annotation gesture in this campaign's synthetic geometry. If the
 * total distance is at or under that 3px tolerance there is no way to
 * satisfy the guarantee while still ending at `toCanvas`, so this instead
 * collapses to a single move straight to `toCanvas`.
 */
export function mouseDrag(
  element: HTMLElement,
  fromCanvas: [number, number],
  toCanvas: [number, number],
  opts: { button?: number; steps?: number } = {}
): void {
  const buttons = opts.button ?? MouseBindings.Primary;
  const steps = Math.max(2, opts.steps ?? 2);
  const from = roundCanvasPoint(fromCanvas);
  const to = roundCanvasPoint(toCanvas);

  dispatchMouseDownOnElement(element, from, buttons);

  const totalDx = to[0] - from[0];
  const totalDy = to[1] - from[1];

  if (Math.abs(totalDx) + Math.abs(totalDy) <= 3) {
    dispatchMouseMoveOnDocument(element, to, buttons);
  } else {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point: [number, number] = [
        Math.round(from[0] + totalDx * t),
        Math.round(from[1] + totalDy * t),
      ];
      dispatchMouseMoveOnDocument(element, point, buttons);
    }
  }

  dispatchMouseUpOnDocument(element, to);
}

/**
 * Hover-only move: a single `mousemove` dispatched directly on `element`
 * with no button held. This is the listener that stays bound to the element
 * itself outside of a mousedown/mouseup cycle (see mouseMoveListener.ts), so
 * it is what drives multi-gesture tools' "preview" phases between two
 * separate mousedown/mouseup cycles (e.g. AngleTool's second arm -- its
 * `_activateDraw` binds `Events.MOUSE_MOVE`, not only `Events.MOUSE_DRAG`, to
 * the same drag handler).
 */
export function mouseMove(
  element: HTMLElement,
  canvasPoint: [number, number]
): void {
  const point = roundCanvasPoint(canvasPoint);
  const [clientX, clientY] = clientPointFromCanvasPoint(element, point);

  element.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 0,
      clientX,
      clientY,
    })
  );
}

/**
 * Mouse wheel event dispatched directly on `element` (wheelListener.ts reads
 * `evt.currentTarget`, so the element must be the dispatch target, not
 * document). `deltaY` must be outside (-1, 1) or the listener ignores it
 * (see wheelListener.ts, guarding against spurious zero-delta wheel events).
 */
export function mouseWheel(
  element: HTMLElement,
  deltaY: number,
  canvasPoint: [number, number] = [0, 0]
): void {
  const point = roundCanvasPoint(canvasPoint);
  const [clientX, clientY] = clientPointFromCanvasPoint(element, point);

  element.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      view: window,
      deltaY,
      clientX,
      clientY,
    })
  );
}

/**
 * Native `dblclick` dispatched directly on `element`. cornerstoneTools does
 * NOT synthesize its double-click event from replayed mousedown/mouseup
 * pairs (mouseDownListener.ts's internal double-click state machine
 * swallows both raw click cycles of a real double click without emitting
 * any cornerstone event for either -- it defers entirely to the browser's
 * native `dblclick`); a headless-dispatched `dblclick` is what
 * mouseDoubleClickListener.ts listens for, so that is what this synthesizes.
 */
export function mouseDoubleClick(
  element: HTMLElement,
  canvasPoint: [number, number]
): void {
  const point = roundCanvasPoint(canvasPoint);
  const [clientX, clientY] = clientPointFromCanvasPoint(element, point);

  element.dispatchEvent(
    new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 0,
      clientX,
      clientY,
    })
  );
}

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

/**
 * Resolves (or rejects on timeout) the next occurrence of `type` on `target`.
 * Generic version of the reference test's per-file ANNOTATION_RENDERED wait.
 */
export function waitForToolsEvent(
  target: EventTarget,
  type: string,
  opts: { timeoutMs?: number } = {}
): Promise<CustomEvent> {
  const { timeoutMs = 5000 } = opts;

  return new Promise<CustomEvent>((resolve, reject) => {
    const onEvent = (evt: Event) => {
      clearTimeout(timer);
      target.removeEventListener(type, onEvent);
      resolve(evt as CustomEvent);
    };

    const timer = setTimeout(() => {
      target.removeEventListener(type, onEvent);
      reject(
        new Error(
          `waitForToolsEvent: timed out after ${timeoutMs}ms waiting for "${type}"`
        )
      );
    }, timeoutMs);

    target.addEventListener(type, onEvent, { once: true });
  });
}

/**
 * Waits for `Enums.Events.ANNOTATION_RENDERED` on `element`. This is the
 * event that reliably gates a just-drawn/just-modified annotation's
 * `cachedStats` being populated: stats are computed inside each tool's
 * `renderAnnotation` (requestAnimationFrame-driven, via
 * AnnotationRenderingEngine), which fires strictly after
 * ANNOTATION_COMPLETED/ANNOTATION_MODIFIED (both dispatched synchronously in
 * the mouse-up handler, before that RAF).
 */
export function waitForAnnotationRendered(
  element: HTMLElement,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const { Events: ToolsEvents } = cornerstoneTools.Enums;

  return waitForToolsEvent(element, ToolsEvents.ANNOTATION_RENDERED, opts).then(
    () => undefined
  );
}

// ---------------------------------------------------------------------------
// Closed-form math convenience
// ---------------------------------------------------------------------------

/** Euclidean distance between two points of equal (2 or 3) dimension. */
export function worldDistance(a: number[], b: number[]): number {
  let sumOfSquares = 0;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    sumOfSquares += delta * delta;
  }

  return Math.sqrt(sumOfSquares);
}
