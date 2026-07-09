// State-based tests covering two contract areas of @cornerstonejs/tools against
// the GenericViewport (PLANAR_NEXT) harness:
//
//   A. ToolGroupManager / tool-mode state machine as observable public state
//      and events (createToolGroup/getToolGroup/destroyToolGroup, mode
//      transitions, binding exclusivity, multi-viewport tool groups).
//   B. Manipulation tools (Pan, Zoom, WindowLevel, StackScroll) driven by
//      synthesized pointer/wheel input, asserted against exact viewport-state
//      values derived from the same canvas points that were dispatched.
//
// Black-box rule: only public exports of @cornerstonejs/tools and
// @cornerstonejs/core are imported; no packages/tools/src/** deep imports, no
// underscore-prefixed field access.
//
// Event targets (verified against source, not guessed -- see report):
//   - TOOL_MODE_CHANGED / TOOL_ACTIVATED fire on the core `eventTarget`
//     singleton (ToolGroup.ts's setToolActive/setToolPassive/setToolEnabled/
//     setToolDisabled all call `triggerEvent(eventTarget, ...)`), never on the
//     viewport element. Verified empirically in the first A2 test below by
//     recording on both targets simultaneously.
//   - VOI_MODIFIED fires on the viewport `element` (PlanarViewport's
//     `notifyDataPresentationModified` calls `triggerEvent(this.element, ...)`).
//   - IMAGE_RENDERED / STACK_NEW_IMAGE fire on the viewport `element`.
import { afterEach, describe, expect, test } from 'vitest';
import { Enums, eventTarget, utilities } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import {
  createPlanarViewport,
  mouseDrag,
  mouseWheel,
  recordEvents,
  setupTools,
  waitForAnnotationRendered,
  type PlanarViewportContext,
} from './harness';

const {
  ToolGroupManager,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  annotation,
  cancelActiveManipulations,
} = cornerstoneTools;
const { Events: ToolsEvents, MouseBindings, ToolModes } = cornerstoneTools.Enums;
const { Events: CoreEvents } = Enums;

// ---------------------------------------------------------------------------
// Local helpers (spec-file-local; the frozen harness surface is untouched).
// ---------------------------------------------------------------------------

/**
 * Raw event recorder that keeps the FULL, unfiltered `detail` object.
 * harness/recordEvents.ts intentionally keeps only an allowlist of primitive
 * viewport-navigation detail keys (viewportId, range, etc.) and drops
 * everything else -- which strips exactly the fields (`toolGroupId`,
 * `toolName`, `mode`) this file needs to assert on ToolGroup lifecycle
 * events. This local variant is unfiltered, for that narrow purpose only.
 */
function recordRawEvents(target: EventTarget, types: string[]) {
  const events: Array<{ type: string; detail: unknown }> = [];
  const listener = (evt: Event) => {
    events.push({ type: evt.type, detail: (evt as CustomEvent).detail });
  };
  types.forEach((type) => target.addEventListener(type, listener));

  return {
    events,
    last(type: string): { type: string; detail: unknown } | undefined {
      const filtered = events.filter((event) => event.type === type);
      return filtered[filtered.length - 1];
    },
    count(type: string): number {
      return events.filter((event) => event.type === type).length;
    },
    stop(): void {
      types.forEach((type) => target.removeEventListener(type, listener));
    },
  };
}

function clientPointFromCanvasPoint(
  element: HTMLElement,
  canvasPoint: [number, number]
): [number, number] {
  const rect = element.getBoundingClientRect();
  return [canvasPoint[0] + rect.left, canvasPoint[1] + rect.top];
}

/**
 * Dispatches mousedown (element) + mousemove (document) WITHOUT a trailing
 * mouseup, so the tool is left mid-draw/mid-drag. Mirrors the dispatch
 * mechanics documented in harness/tools.ts (mousedown on element, move/up on
 * document) minus the final mouseup -- needed for the
 * cancelActiveManipulations test (B5), which must observe genuinely
 * in-progress tool state. Not exposed by the frozen harness because every
 * other consumer wants a completed gesture.
 */
function beginDragWithoutRelease(
  element: HTMLElement,
  fromCanvas: [number, number],
  toCanvas: [number, number]
): void {
  const from = [Math.round(fromCanvas[0]), Math.round(fromCanvas[1])] as [
    number,
    number,
  ];
  const to = [Math.round(toCanvas[0]), Math.round(toCanvas[1])] as [
    number,
    number,
  ];

  const [downX, downY] = clientPointFromCanvasPoint(element, from);
  element.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
      clientX: downX,
      clientY: downY,
    })
  );

  const [moveX, moveY] = clientPointFromCanvasPoint(element, to);
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
      clientX: moveX,
      clientY: moveY,
    })
  );
}

function dispatchMouseUpOnDocument(
  element: HTMLElement,
  canvasPoint: [number, number]
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(
    element,
    [Math.round(canvasPoint[0]), Math.round(canvasPoint[1])]
  );
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

interface TwoViewportToolGroupContext {
  a: PlanarViewportContext;
  b: PlanarViewportContext;
  toolGroup: ToolsTypes.IToolGroup;
  toolGroupId: string;
  cleanup(): void;
}

/**
 * Builds a single tool group shared by TWO independent harness viewports
 * (each with its own RenderingEngine). The frozen `setupTools` always
 * creates exactly one viewport plus a dedicated tool group, so it cannot
 * express the "two viewports, one tool group" scenarios in A4/A5; this is a
 * spec-file-local composition of the same primitives `setupTools` uses
 * internally (init/addTool BEFORE createPlanarViewport -- see
 * harness/tools.ts's setupTools doc comment for why the ordering matters).
 */
async function setupTwoViewportToolGroup(
  toolClass: { toolName: string }
): Promise<TwoViewportToolGroupContext> {
  cornerstoneTools.init();
  cornerstoneTools.addTool(toolClass);

  const a = await createPlanarViewport();
  const b = await createPlanarViewport();

  const toolGroupId = `vitest-two-viewport-group-${utilities.uuidv4()}`;
  const toolGroup = ToolGroupManager.createToolGroup(
    toolGroupId
  ) as ToolsTypes.IToolGroup;

  if (!toolGroup) {
    a.cleanup();
    b.cleanup();
    cornerstoneTools.destroy();
    throw new Error(`Failed to create tool group ${toolGroupId}`);
  }

  toolGroup.addTool(toolClass.toolName);
  toolGroup.addViewport(a.viewportId, a.renderingEngine.id);
  toolGroup.addViewport(b.viewportId, b.renderingEngine.id);
  toolGroup.setToolActive(toolClass.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    try {
      cancelActiveManipulations(a.element);
    } catch {
      // Nothing active to cancel.
    }
    try {
      cancelActiveManipulations(b.element);
    } catch {
      // Nothing active to cancel.
    }
    try {
      ToolGroupManager.destroyToolGroup(toolGroupId);
    } catch {
      // Already destroyed.
    }
    try {
      annotation.state.removeAllAnnotations();
    } catch {
      // No annotation state to clear.
    }

    a.cleanup();
    b.cleanup();

    try {
      cornerstoneTools.destroy();
    } catch {
      // Already destroyed.
    }
  };

  return { a, b, toolGroup, toolGroupId, cleanup };
}

// ---------------------------------------------------------------------------
// Shared per-test cleanup registration (mirrors toolMeasurements.browser.test.ts).
// ---------------------------------------------------------------------------

let activeCleanup: (() => void) | null = null;

afterEach(() => {
  if (!activeCleanup) {
    return;
  }
  const cleanup = activeCleanup;
  activeCleanup = null;
  cleanup();
});

describe('ToolGroupManager state machine', () => {
  test('createToolGroup / getToolGroup / getToolGroupForViewport / destroyToolGroup', async () => {
    const ctx = await setupTools({ tools: [] });
    activeCleanup = ctx.cleanup;
    const { toolGroup, toolGroupId, viewportId, renderingEngine } = ctx;

    // getToolGroup returns the SAME instance created by setupTools.
    expect(ToolGroupManager.getToolGroup(toolGroupId)).toBe(toolGroup);

    // Contract (pinned from packages/tools/src/store/ToolGroupManager/createToolGroup.ts):
    // calling createToolGroup with an id that already exists logs a
    // console.warn and returns undefined. It does NOT return the existing
    // group and does NOT throw. The existing group is left untouched.
    const duplicateResult = ToolGroupManager.createToolGroup(toolGroupId);
    expect(duplicateResult).toBeUndefined();
    expect(ToolGroupManager.getToolGroup(toolGroupId)).toBe(toolGroup);

    // getToolGroupForViewport resolves once addViewport has run (setupTools
    // already did this as part of its bootstrap).
    expect(
      ToolGroupManager.getToolGroupForViewport(viewportId, renderingEngine.id)
    ).toBe(toolGroup);

    // destroyToolGroup makes getToolGroup return undefined afterward.
    ToolGroupManager.destroyToolGroup(toolGroupId);
    expect(ToolGroupManager.getToolGroup(toolGroupId)).toBeUndefined();
    expect(
      ToolGroupManager.getToolGroupForViewport(viewportId, renderingEngine.id)
    ).toBeUndefined();
  });

  test('mode transitions (Active -> Passive -> Enabled -> Disabled -> Active) are reflected in getToolOptions and fire TOOL_MODE_CHANGED/TOOL_ACTIVATED on eventTarget, not the element', async () => {
    const ctx = await setupTools({ tools: [PanTool] });
    activeCleanup = ctx.cleanup;
    const { element } = ctx;
    const toolGroup = ctx.toolGroup as ToolsTypes.IToolGroup;

    // Verify the event target empirically: record on BOTH eventTarget and the
    // element simultaneously and confirm only eventTarget ever sees these two
    // tool-lifecycle events.
    const onEventTarget = recordRawEvents(eventTarget, [
      ToolsEvents.TOOL_MODE_CHANGED,
      ToolsEvents.TOOL_ACTIVATED,
    ]);
    const onElement = recordRawEvents(element, [
      ToolsEvents.TOOL_MODE_CHANGED,
      ToolsEvents.TOOL_ACTIVATED,
    ]);

    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Active
    );
    expect(onEventTarget.count(ToolsEvents.TOOL_ACTIVATED)).toBe(1);
    expect(onEventTarget.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(1);
    let lastModeChanged = onEventTarget.last(ToolsEvents.TOOL_MODE_CHANGED);
    expect(lastModeChanged?.detail).toMatchObject({
      toolGroupId: ctx.toolGroupId,
      toolName: PanTool.toolName,
      mode: ToolModes.Active,
    });

    toolGroup.setToolPassive(PanTool.toolName);
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Passive
    );
    expect(onEventTarget.count(ToolsEvents.TOOL_ACTIVATED)).toBe(1); // unchanged
    expect(onEventTarget.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(2);
    lastModeChanged = onEventTarget.last(ToolsEvents.TOOL_MODE_CHANGED);
    expect(lastModeChanged?.detail).toMatchObject({
      toolGroupId: ctx.toolGroupId,
      toolName: PanTool.toolName,
      mode: ToolModes.Passive,
    });

    toolGroup.setToolEnabled(PanTool.toolName);
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Enabled
    );
    expect(onEventTarget.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(3);

    toolGroup.setToolDisabled(PanTool.toolName);
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Disabled
    );
    expect(onEventTarget.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(4);

    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Active
    );
    expect(onEventTarget.count(ToolsEvents.TOOL_ACTIVATED)).toBe(2);
    expect(onEventTarget.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(5);

    // Pinned event-target contract: neither event ever reached the element.
    expect(onElement.count(ToolsEvents.TOOL_MODE_CHANGED)).toBe(0);
    expect(onElement.count(ToolsEvents.TOOL_ACTIVATED)).toBe(0);

    onEventTarget.stop();
    onElement.stop();
  });

  test('binding exclusivity: activating a second tool on the same Primary binding does NOT demote the first (contradicts a naive "last-activated wins" assumption)', async () => {
    const ctx = await setupTools({ tools: [PanTool, ZoomTool] });
    activeCleanup = ctx.cleanup;
    const { viewport, element } = ctx;
    const toolGroup = ctx.toolGroup as ToolsTypes.IToolGroup;

    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });

    // Pinned contract (ToolGroup.ts setToolActive): setToolActive never looks
    // up or demotes any other tool. Both remain reported as Active.
    expect(toolGroup.getToolOptions(PanTool.toolName).mode).toBe(
      ToolModes.Active
    );
    expect(toolGroup.getToolOptions(ZoomTool.toolName).mode).toBe(
      ToolModes.Active
    );

    // Pinned contract (getActivePrimaryMouseButtonTool ->
    // Object.keys(toolOptions).find(...)): resolution is FIRST-INSERTED-KEY,
    // not most-recently-activated. Pan's toolOptions entry was inserted first
    // (its setToolActive call ran first), so it -- not Zoom -- is reported
    // here even though Zoom was activated afterward on the identical binding.
    expect(toolGroup.getActivePrimaryMouseButtonTool()).toBe(PanTool.toolName);

    // Behavioral consequence: getActiveToolForMouseEvent (the actual mouse
    // dispatcher used by mouseDown/mouseDrag) applies the SAME
    // Object.keys(toolOptions) first-match rule, so a real Primary-button
    // drag is routed to Pan, not Zoom -- the opposite of "the most recently
    // activated tool on a binding wins".
    const pan0 = viewport.getPan();
    const zoom0 = viewport.getZoom();

    const events = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 200], [240, 230]);
    await events.waitFor(CoreEvents.IMAGE_RENDERED);

    const pan1 = viewport.getPan();
    const zoom1 = viewport.getZoom();

    expect(pan1[0] - pan0[0]).toBeCloseTo(40, 0);
    expect(pan1[1] - pan0[1]).toBeCloseTo(30, 0);
    expect(zoom1).toBeCloseTo(zoom0, 6);
  });

  test('two viewports in one tool group: a drag on A only changes A; removeViewports isolates B', async () => {
    const group = await setupTwoViewportToolGroup(PanTool);
    activeCleanup = group.cleanup;
    const { a, b, toolGroup } = group;

    expect(toolGroup.getViewportIds().sort()).toEqual(
      [a.viewportId, b.viewportId].sort()
    );

    const panA0 = a.viewport.getPan();
    const panB0 = b.viewport.getPan();

    const eventsA = recordEvents(a.element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(a.element, [200, 200], [240, 230]);
    await eventsA.waitFor(CoreEvents.IMAGE_RENDERED);

    const panA1 = a.viewport.getPan();
    const panB1 = b.viewport.getPan();

    expect(panA1[0] - panA0[0]).toBeCloseTo(40, 0);
    expect(panA1[1] - panA0[1]).toBeCloseTo(30, 0);
    // B is untouched: tool scope is per-interaction/per-viewport.
    expect(panB1[0]).toBeCloseTo(panB0[0], 6);
    expect(panB1[1]).toBeCloseTo(panB0[1], 6);

    toolGroup.removeViewports(b.renderingEngine.id, b.viewportId);
    expect(toolGroup.getViewportIds()).toEqual([a.viewportId]);

    // A drag on B now changes nothing on either viewport (B is no longer
    // bound to any tool group, so no tool receives its mouse events; A was
    // never touched by this gesture).
    const panA2 = a.viewport.getPan();
    const panB2 = b.viewport.getPan();

    mouseDrag(b.element, [200, 200], [240, 230]);
    // No event to await (no tool is listening on B anymore); read state
    // synchronously since dispatchEvent is synchronous and there is no
    // listener left to produce any async state change.
    const panA3 = a.viewport.getPan();
    const panB3 = b.viewport.getPan();

    expect(panA3[0]).toBeCloseTo(panA2[0], 6);
    expect(panA3[1]).toBeCloseTo(panA2[1], 6);
    expect(panB3[0]).toBeCloseTo(panB2[0], 6);
    expect(panB3[1]).toBeCloseTo(panB2[1], 6);
  });

  test('getToolGroupForViewport resolution follows addViewport/removeViewports for each of two viewports', async () => {
    const group = await setupTwoViewportToolGroup(PanTool);
    activeCleanup = group.cleanup;
    const { a, b, toolGroup } = group;

    expect(
      ToolGroupManager.getToolGroupForViewport(a.viewportId, a.renderingEngine.id)
    ).toBe(toolGroup);
    expect(
      ToolGroupManager.getToolGroupForViewport(b.viewportId, b.renderingEngine.id)
    ).toBe(toolGroup);

    toolGroup.removeViewports(b.renderingEngine.id, b.viewportId);

    expect(
      ToolGroupManager.getToolGroupForViewport(a.viewportId, a.renderingEngine.id)
    ).toBe(toolGroup);
    expect(
      ToolGroupManager.getToolGroupForViewport(b.viewportId, b.renderingEngine.id)
    ).toBeUndefined();
  });
});

describe('Manipulation tools with exact viewport-state values', () => {
  test('PanTool: drag delta equals the canvas-pixel pan delta (getPan/setPan round-trip in canvas px)', async () => {
    const ctx = await setupTools({
      tools: [PanTool],
      activeTool: PanTool.toolName,
    });
    activeCleanup = ctx.cleanup;
    const { viewport, element } = ctx;

    const pan0 = viewport.getPan();

    const events = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 200], [240, 230]);
    await events.waitFor(CoreEvents.IMAGE_RENDERED);

    const pan1 = viewport.getPan();

    // Pinned contract: PanTool's _dragCallback does
    // `viewport.setPan([pan[0]+deltaCanvas[0], pan[1]+deltaCanvas[1]])` once
    // per mousemove step (packages/tools/src/tools/PanTool.ts); deltaCanvas is
    // the INCREMENTAL step delta (current - last), so across the whole
    // gesture the steps telescope exactly to the total dispatched delta.
    // Tolerance is 1 canvas px per the plan (rounding of dispatched integer
    // client coordinates).
    expect(pan1[0] - pan0[0]).toBeCloseTo(40, 0);
    expect(pan1[1] - pan0[1]).toBeCloseTo(30, 0);
  });

  test('ZoomTool: drag direction pin + exact reversibility', async () => {
    const ctx = await setupTools({
      tools: [ZoomTool],
      activeTool: ZoomTool.toolName,
    });
    activeCleanup = ctx.cleanup;
    const { viewport, element } = ctx;

    const zoom0 = viewport.getZoom();

    // Small total delta (6 canvas px) spread over many steps (20): ZoomTool's
    // per-step update is `zoom = zoom / max(1 - deltaY*zoomScale, 0.01)`
    // (packages/tools/src/tools/ZoomTool.ts, _applyViewportZoomDelta) --
    // MULTIPLICATIVE, not additive, so unlike Pan/WindowLevel it does not
    // telescope exactly across a multi-step drag; a big single-shot delta (as
    // a naive reading of the plan's own example, e.g. a 80px drag over only 2
    // steps) accumulates a double-digit-percent round-trip error from pure
    // discretization, which would fail the "within 1 percent" reversibility
    // contract below through no fault of the tool. Keeping the per-step
    // fraction small (each step here moves zoom by well under 1 percent)
    // keeps the discretization error far below 1 percent while the 6px total
    // still produces an unambiguous, clearly-measurable (~5-10 percent)
    // direction signal.
    const eventsUp = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 200], [200, 194], { steps: 20 });
    await eventsUp.waitFor(CoreEvents.IMAGE_RENDERED);

    const zoomAfterUpDrag = viewport.getZoom();

    // Pinned direction contract: dragging UP (decreasing canvas Y) DECREASES
    // zoom with the tool's default configuration (invert: false) -- the
    // opposite of the plan's example guess ("upward drag" -> increase). See
    // _applyViewportZoomDelta: deltaY is negative for an upward drag, so
    // k = deltaY*zoomScale is negative, denominator = 1-k > 1, and
    // zoom/denominator < zoom.
    expect(zoomAfterUpDrag).toBeLessThan(zoom0);

    const eventsDown = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 194], [200, 200], { steps: 20 });
    await eventsDown.waitFor(CoreEvents.IMAGE_RENDERED);

    const zoomAfterReverse = viewport.getZoom();

    // Reversibility contract: dragging the exact reverse path returns zoom to
    // zoom0 within 1 percent.
    const relativeError = Math.abs(zoomAfterReverse - zoom0) / zoom0;
    expect(relativeError).toBeLessThan(0.01);
  });

  test('WindowLevelTool: horizontal drag widens the window, vertical drag shifts the center, VOI_MODIFIED detail matches stored presentation, and the round trip is reversible', async () => {
    const ctx = await setupTools({
      tools: [WindowLevelTool],
      activeTool: WindowLevelTool.toolName,
    });
    activeCleanup = ctx.cleanup;
    const { viewport, element, displaySetId } = ctx;

    // getDisplaySetPresentation(displaySetId).voiRange is only populated once
    // something has explicitly written it (e.g. a WindowLevel drag calling
    // setDisplaySetPresentation). Before the first drag, the presentation
    // store only holds `{ visible: true }` (set by the mount-time
    // setDefaultDataPresentation call) -- the mounted default VOI is
    // observable only via getDefaultVOIRange, never through
    // getDisplaySetPresentation, until it is written for real. This mirrors
    // WindowLevelTool's own getViewportVOIProperties helper, which reads
    // `dataPresentation?.voiRange ?? defaultVOIRange`.
    function getVoiRange() {
      const presentation = viewport.getDisplaySetPresentation(displaySetId) as
        | { voiRange?: { lower: number; upper: number } }
        | undefined;
      const voiRange =
        presentation?.voiRange ?? viewport.getDefaultVOIRange(displaySetId);
      expect(voiRange).toBeDefined();
      return voiRange as { lower: number; upper: number };
    }

    const voiRange0 = { ...getVoiRange() };
    const width0 = voiRange0.upper - voiRange0.lower;

    // Horizontal-only drag (deltaY = 0): isolates the width-only change.
    // Pinned contract (WindowLevelTool.getNewRange): wwDelta =
    // deltaCanvas.x * multiplier, added directly to windowWidth -- a
    // positive (rightward) horizontal delta increases window width.
    const events1 = recordEvents(element, [
      CoreEvents.VOI_MODIFIED,
      CoreEvents.IMAGE_RENDERED,
    ]);
    mouseDrag(element, [200, 200], [280, 200]);
    await events1.waitFor(CoreEvents.IMAGE_RENDERED);

    const voiRange1 = { ...getVoiRange() };
    const width1 = voiRange1.upper - voiRange1.lower;
    expect(width1).toBeGreaterThan(width0);

    // Exact-value contract: VOI_MODIFIED's event detail range equals the
    // presentation's stored voiRange exactly (event/state consistency).
    const voiModifiedEvents = events1.events.filter(
      (event) => event.type === CoreEvents.VOI_MODIFIED
    );
    expect(voiModifiedEvents.length).toBeGreaterThan(0);
    const lastVoiModifiedDetail = voiModifiedEvents[
      voiModifiedEvents.length - 1
    ].detail as { range?: { lower: number; upper: number } };
    expect(lastVoiModifiedDetail.range).toEqual(voiRange1);

    // Vertical-only drag (deltaX = 0): isolates the center-only shift.
    // Pinned contract: wcDelta = deltaCanvas.y * multiplier, added to
    // windowCenter -- a positive (downward) vertical delta increases center,
    // shifting both lower and upper by the same amount (width unchanged).
    const events2 = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 200], [200, 280]);
    await events2.waitFor(CoreEvents.IMAGE_RENDERED);

    const voiRange2 = { ...getVoiRange() };
    const width2 = voiRange2.upper - voiRange2.lower;
    const center1 = (voiRange1.lower + voiRange1.upper) / 2;
    const center2 = (voiRange2.lower + voiRange2.upper) / 2;

    expect(center2).toBeGreaterThan(center1);
    expect(width2).toBeCloseTo(width1, 6);

    // Reversibility: the exact reverse of both drags (order-independent,
    // since each gesture only touched one of width/center) returns voiRange
    // to voiRange0 within 1 unit. WindowLevelTool's ww/wc <-> lower/upper
    // conversion (utilities.windowLevel.toWindowLevel/toLowHighRange) is an
    // exact affine bijection, so unlike Zoom this telescopes precisely
    // regardless of step count.
    const events3 = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [280, 200], [200, 200]);
    await events3.waitFor(CoreEvents.IMAGE_RENDERED);

    const events4 = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
    mouseDrag(element, [200, 280], [200, 200]);
    await events4.waitFor(CoreEvents.IMAGE_RENDERED);

    const voiRangeFinal = getVoiRange();
    expect(Math.abs(voiRangeFinal.lower - voiRange0.lower)).toBeLessThan(1);
    expect(Math.abs(voiRangeFinal.upper - voiRange0.upper)).toBeLessThan(1);
  });

  test('StackScrollTool on the Wheel binding: exact slice arithmetic with clamping at the last slice', async () => {
    const ctx = await setupTools({ tools: [StackScrollTool] });
    activeCleanup = ctx.cleanup;
    const { viewport, element, toolGroup } = ctx;
    const tg = toolGroup as ToolsTypes.IToolGroup;

    tg.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Wheel }],
    });

    expect(viewport.getSliceIndex()).toBe(0);
    expect(viewport.getNumberOfSlices()).toBe(5);

    async function wheelAndWait(deltaY: number): Promise<void> {
      const events = recordEvents(element, [CoreEvents.IMAGE_RENDERED]);
      mouseWheel(element, deltaY);
      await events.waitFor(CoreEvents.IMAGE_RENDERED);
    }

    // Empirically verified sign convention for this harness (see report):
    // negative deltaY advances forward, positive deltaY scrolls backward.
    // This is the OPPOSITE of a naive reading of
    // packages/tools/test/StackScrollToolTool_test.js's `deltaY: 12`
    // forward-scroll fixture, whose direction depends on the browser's
    // legacy `wheelDelta` emulation (normalizeWheel.ts prefers
    // `wheelDelta`/`wheelDeltaY` over `deltaY` when present); that legacy
    // emulation differs between the Karma test's browser and this
    // Playwright-driven headless Chromium, so the sign was confirmed by
    // direct observation rather than assumed from the Karma fixture.
    const FORWARD = -12;
    const BACKWARD = 12;

    await wheelAndWait(FORWARD);
    expect(viewport.getSliceIndex()).toBe(1);

    // Three more forward ticks reach the last slice (index 4 of 5 slices).
    await wheelAndWait(FORWARD);
    await wheelAndWait(FORWARD);
    await wheelAndWait(FORWARD);
    expect(viewport.getSliceIndex()).toBe(4);

    // One more forward tick past the end stays clamped at the last slice
    // (PlanarViewport.setImageIdIndex clamps to [0, numberOfSlices-1]).
    await wheelAndWait(FORWARD);
    expect(viewport.getSliceIndex()).toBe(4);

    // Backward scrolls back exactly one slice.
    await wheelAndWait(BACKWARD);
    expect(viewport.getSliceIndex()).toBe(3);
  });

  test('cancelActiveManipulations leaves an in-progress annotation completed (not deleted) at its last dragged position, and subsequent drawing is unaffected', async () => {
    const ctx = await setupTools({
      tools: [LengthTool],
      activeTool: LengthTool.toolName,
    });
    activeCleanup = ctx.cleanup;
    const { viewport, element } = ctx;

    const p1: [number, number] = [100, 150];
    const pMidDrag: [number, number] = [180, 150];

    beginDragWithoutRelease(element, p1, pMidDrag);

    // Mid-draw: the annotation already exists (LengthTool creates it on
    // mousedown) but has not been completed by a mouseup yet.
    const midDrawAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(midDrawAnnotations.length).toBe(1);

    const canceledUID = cancelActiveManipulations(element);
    expect(canceledUID).toBeDefined();

    dispatchMouseUpOnDocument(element, pMidDrag);

    // Pinned contract (packages/tools/src/store/cancelActiveManipulations.ts
    // delegating to LengthTool.cancel): the in-progress annotation is NOT
    // deleted. It is left in annotation state, completed (ANNOTATION_COMPLETED
    // fires internally for a brand-new annotation), with its handles frozen
    // at their last dragged position -- not reverted to the mousedown point.
    const afterCancelAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(afterCancelAnnotations.length).toBe(1);
    expect(afterCancelAnnotations[0].annotationUID).toBe(canceledUID);

    const expectedFrozenWorldPoint = viewport.canvasToWorld(pMidDrag);
    const frozenHandlePoints = afterCancelAnnotations[0].data.handles.points;
    // One handle sits at the drag's last position (pMidDrag); the other at
    // the mousedown point (p1). Assert the moving handle landed at pMidDrag
    // rather than assuming handle ordering.
    const matchesFrozenPoint = frozenHandlePoints.some(
      (point: [number, number, number]) =>
        Math.abs(point[0] - expectedFrozenWorldPoint[0]) < 1e-2 &&
        Math.abs(point[1] - expectedFrozenWorldPoint[1]) < 1e-2 &&
        Math.abs(point[2] - expectedFrozenWorldPoint[2]) < 1e-2
    );
    expect(matchesFrozenPoint).toBe(true);

    // Subsequent drawing works normally: a fresh, fully-completed gesture
    // adds a SECOND annotation alongside the canceled one.
    const p2a: [number, number] = [50, 50];
    const p2b: [number, number] = [50, 90];
    const rendered = waitForAnnotationRendered(element);
    mouseDrag(element, p2a, p2b);
    await rendered;

    const finalAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(finalAnnotations.length).toBe(2);

    const newAnnotation = finalAnnotations.find(
      (candidate) => candidate.annotationUID !== canceledUID
    );
    expect(newAnnotation).toBeDefined();
    const newHandlePoints = newAnnotation!.data.handles.points;
    const expectedP2a = viewport.canvasToWorld(p2a);
    const expectedP2b = viewport.canvasToWorld(p2b);
    expect(newHandlePoints[0][0]).toBeCloseTo(expectedP2a[0], 2);
    expect(newHandlePoints[0][1]).toBeCloseTo(expectedP2a[1], 2);
    expect(newHandlePoints[1][0]).toBeCloseTo(expectedP2b[0], 2);
    expect(newHandlePoints[1][1]).toBeCloseTo(expectedP2b[1], 2);
  });
});
