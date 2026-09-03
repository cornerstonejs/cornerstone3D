import GenericViewport from '../src/RenderingEngine/GenericViewport/GenericViewport';
import ViewportType from '../src/enums/ViewportType';
import ViewportStatus from '../src/enums/ViewportStatus';
import Events from '../src/enums/Events';
import {
  getGenericViewportRegisteredDisplaySet,
  getGenericViewportImageDisplaySet,
  getGenericViewportPlanarDisplaySet,
  getGenericViewportWSIDisplaySet,
  getGenericViewportSourceDataId,
  isGenericViewportImageDisplaySet,
  isGenericViewportWSIDisplaySet,
  isGenericViewportSourceAliasDisplaySet,
} from '../src/RenderingEngine/GenericViewport/genericViewportDisplaySetAccess';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';

// ── Test fixture: a minimal concrete GenericViewport subclass ────────────
//
// GenericViewport is abstract and generic over view-state/presentation/
// render-context types. The base class only orchestrates bindings, view
// state, and lifecycle; it delegates rendering, resolved-view computation,
// view-state normalization, and presentation notifications to subclasses.
// This fixture implements just enough of those hooks to exercise the base
// class behavior, with spies exposed so tests can assert on hook calls.
class TestViewport extends GenericViewport {
  constructor({
    id,
    element,
    renderingEngineId = 'test-engine',
    dataProvider,
    renderPathResolver,
    renderContext,
    viewState = {},
    resolvedView,
  }) {
    super({ id, element });

    this.type = ViewportType.STACK;
    this.renderingEngineId = renderingEngineId;
    this.dataProvider = dataProvider;
    this.renderPathResolver = renderPathResolver;
    this.renderContext = renderContext ?? { viewportId: id, type: 'planar' };
    this.viewState = viewState;

    this.renderCount = 0;
    this._resolvedView = resolvedView;
    this._normalizeViewState = undefined;

    this.normalizeViewStateSpy = jest.fn();
    this.notifyDataPresentationModifiedSpy = jest.fn();
    this.onDestroySpy = jest.fn();
  }

  render() {
    this.renderCount += 1;
  }

  getResolvedView() {
    return this._resolvedView;
  }

  normalizeViewState(viewState) {
    this.normalizeViewStateSpy(viewState);
    return this._normalizeViewState
      ? this._normalizeViewState(viewState)
      : viewState;
  }

  notifyDataPresentationModified(displaySetId, props) {
    this.notifyDataPresentationModifiedSpy(displaySetId, props);
  }

  onDestroy() {
    this.onDestroySpy();
  }
}

// ── Fakes ──────────────────────────────────────────────────────────────

function createAttachment(overrides = {}) {
  return {
    rendering: { renderMode: 'fake' },
    removeData: jest.fn(),
    applyViewState: jest.fn(),
    updateDataPresentation: jest.fn(),
    getFrameOfReferenceUID: () => '1.2.3',
    render: jest.fn(),
    resize: jest.fn(),
    ...overrides,
  };
}

function createResolver(addData) {
  const impl = addData ?? jest.fn(async () => createAttachment());

  return {
    resolve: jest.fn(() => ({
      createRenderPath: () => ({ addData: impl }),
      selectContext: undefined,
    })),
  };
}

function createDataProvider() {
  return {
    load: jest.fn(async (displaySetId) => ({
      id: displaySetId,
      type: 'image',
    })),
  };
}

function createHarness({
  id = 'vp-1',
  renderingEngineId = 'engine-1',
  viewState = {},
  resolvedView,
  addData,
  dataProvider,
} = {}) {
  const element = document.createElement('div');
  element.setAttribute('data-viewport-uid', id);
  element.setAttribute('data-rendering-engine-uid', renderingEngineId);

  const provider = dataProvider ?? createDataProvider();
  const resolver = createResolver(addData);

  const viewport = new TestViewport({
    id,
    element,
    renderingEngineId,
    dataProvider: provider,
    renderPathResolver: resolver,
    viewState,
    resolvedView,
  });

  return { element, viewport, dataProvider: provider, resolver };
}

// Mounts a display set with a fresh attachment (unless one is supplied),
// swapping the resolver just for this call so each mounted display set gets
// its own distinguishable attachment/spies.
async function mountDisplaySet(
  viewport,
  displaySetId,
  options = {},
  attachment
) {
  const resolvedAttachment = attachment ?? createAttachment();
  viewport.renderPathResolver = createResolver(
    jest.fn(async () => resolvedAttachment)
  );
  await viewport.addDisplaySet(displaySetId, {
    renderMode: 'fake',
    ...options,
  });
  return resolvedAttachment;
}

describe('GenericViewport', () => {
  describe('setDisplaySets', () => {
    it('throws when an entry is missing options', async () => {
      const { viewport } = createHarness();

      await expect(
        viewport.setDisplaySets({ displaySetId: 'ds-1' })
      ).rejects.toThrow(/requires per-entry options/);
    });

    it('defaults the first entry to source and later entries to overlay', async () => {
      const { viewport } = createHarness();

      await viewport.setDisplaySets(
        { displaySetId: 'ds-1', options: { renderMode: 'fake' } },
        { displaySetId: 'ds-2', options: { renderMode: 'fake' } }
      );

      expect(viewport.getDisplaySets()).toEqual([
        { displaySetId: 'ds-1', options: { role: 'source' } },
        { displaySetId: 'ds-2', options: { role: 'overlay' } },
      ]);
    });

    it('respects an explicit role over the positional default', async () => {
      const { viewport } = createHarness();

      await viewport.setDisplaySets({
        displaySetId: 'ds-1',
        options: { renderMode: 'fake', role: 'overlay' },
      });

      expect(viewport.getDisplaySets()).toEqual([
        { displaySetId: 'ds-1', options: { role: 'overlay' } },
      ]);
    });

    it('replaces all previously mounted display sets', async () => {
      const { viewport } = createHarness();
      const firstAttachment = createAttachment();
      const secondAttachment = createAttachment();
      const thirdAttachment = createAttachment();
      const attachments = [firstAttachment, secondAttachment, thirdAttachment];
      let callIndex = 0;

      viewport.renderPathResolver = createResolver(
        jest.fn(async () => attachments[callIndex++])
      );

      await viewport.setDisplaySets(
        { displaySetId: 'ds-1', options: { renderMode: 'fake' } },
        { displaySetId: 'ds-2', options: { renderMode: 'fake' } }
      );

      await viewport.setDisplaySets({
        displaySetId: 'ds-3',
        options: { renderMode: 'fake' },
      });

      expect(firstAttachment.removeData).toHaveBeenCalledTimes(1);
      expect(secondAttachment.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.getDisplaySets()).toEqual([
        { displaySetId: 'ds-3', options: { role: 'source' } },
      ]);
    });
  });

  describe('addLoadedData lifecycle', () => {
    it('mounts loaded data, re-applies stored presentation before mounting, applies view state, and schedules a render', async () => {
      const { viewport } = createHarness({ viewState: { zoom: 1 } });
      const attachment = createAttachment();

      viewport.renderPathResolver = createResolver(
        jest.fn(async () => attachment)
      );

      // Presentation stored before the display set is ever mounted.
      viewport.setDisplaySetPresentation('ds-1', { opacity: 0.5 });

      await viewport.addDisplaySet('ds-1', { renderMode: 'fake' });

      expect(attachment.updateDataPresentation).toHaveBeenCalledWith({
        opacity: 0.5,
      });
      expect(attachment.applyViewState).toHaveBeenCalledWith({ zoom: 1 });
      expect(viewport.viewportStatus).toBe(ViewportStatus.PRE_RENDER);
      expect(viewport.renderCount).toBeGreaterThan(0);
      expect(viewport._debug.renderModes['ds-1']).toBe('fake');
      expect(viewport.getDisplaySets()).toEqual([
        { displaySetId: 'ds-1', options: { role: 'overlay' } },
      ]);
    });

    it('returns false and mounts nothing when shouldIgnore is already true before addData is called', async () => {
      const { viewport } = createHarness();
      const addData = jest.fn();

      viewport.renderPathResolver = createResolver(addData);

      const result = await viewport.addLoadedData(
        'ds-1',
        { id: 'ds-1', type: 'image' },
        { renderMode: 'fake' },
        () => true
      );

      expect(result).toBe(false);
      expect(addData).not.toHaveBeenCalled();
      expect(viewport.getDisplaySets()).toEqual([]);
    });

    it('discards the staged attachment and leaves the previous binding untouched when shouldIgnore flips true mid-await', async () => {
      const { viewport } = createHarness();
      const previousAttachment = createAttachment();

      viewport.renderPathResolver = createResolver(
        jest.fn(async () => previousAttachment)
      );

      await viewport.addLoadedData(
        'ds-1',
        { id: 'ds-1', type: 'image' },
        { renderMode: 'fake' }
      );

      let resolveAddData;
      const stagedAttachment = createAttachment();

      viewport.renderPathResolver = createResolver(
        jest.fn(
          () =>
            new Promise((resolve) => {
              resolveAddData = resolve;
            })
        )
      );

      let ignore = false;
      const pending = viewport.addLoadedData(
        'ds-1',
        { id: 'ds-1', type: 'image' },
        { renderMode: 'fake' },
        () => ignore
      );

      ignore = true;
      resolveAddData(stagedAttachment);
      const result = await pending;

      expect(result).toBe(false);
      expect(stagedAttachment.removeData).toHaveBeenCalledTimes(1);
      expect(previousAttachment.removeData).not.toHaveBeenCalled();
      expect(viewport.bindings.get('ds-1').removeData).toBe(
        previousAttachment.removeData
      );
    });

    it('removes the staged attachment and throws when the viewport is destroyed mid-await', async () => {
      const { viewport } = createHarness();
      let resolveAddData;
      const attachment = createAttachment();

      viewport.renderPathResolver = createResolver(
        jest.fn(
          () =>
            new Promise((resolve) => {
              resolveAddData = resolve;
            })
        )
      );

      const pending = viewport.addLoadedData(
        'ds-1',
        { id: 'ds-1', type: 'image' },
        { renderMode: 'fake' }
      );

      viewport.destroy();
      resolveAddData(attachment);

      await expect(pending).rejects.toThrow('Viewport has been destroyed');
      expect(attachment.removeData).toHaveBeenCalledTimes(1);
    });

    it('replaces the previous attachment when the same display set is remounted', async () => {
      const { viewport } = createHarness();

      const first = await mountDisplaySet(viewport, 'ds-1');
      const second = await mountDisplaySet(viewport, 'ds-1');

      expect(first.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.bindings.get('ds-1').removeData).toBe(second.removeData);
    });

    it('demotes existing bindings to overlay when a new source binding mounts', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1', { role: 'source' });
      await mountDisplaySet(viewport, 'ds-2', { role: 'overlay' });
      await mountDisplaySet(viewport, 'ds-3', { role: 'source' });

      const sets = viewport.getDisplaySets();
      const roleOf = (id) =>
        sets.find((s) => s.displaySetId === id).options.role;

      expect(roleOf('ds-1')).toBe('overlay');
      expect(roleOf('ds-2')).toBe('overlay');
      expect(roleOf('ds-3')).toBe('source');
    });

    it('rejects addDisplaySet calls after the viewport has been destroyed', async () => {
      const { viewport } = createHarness();

      viewport.destroy();

      await expect(
        viewport.addDisplaySet('ds-1', { renderMode: 'fake' })
      ).rejects.toThrow('Viewport has been destroyed');
    });
  });

  describe('removeData', () => {
    it('removes the binding, stored presentation, and debug entry, then renders', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');
      viewport.setDisplaySetPresentation('ds-1', { opacity: 0.4 });
      const attachment = viewport.bindings.get('ds-1');
      const renderCountBefore = viewport.renderCount;

      viewport.removeData('ds-1');

      expect(attachment.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.getDisplaySets()).toEqual([]);
      expect(viewport.getDisplaySetPresentation('ds-1')).toBeUndefined();
      expect(viewport._debug.renderModes['ds-1']).toBeUndefined();
      expect(viewport.renderCount).toBeGreaterThan(renderCountBefore);
    });

    it('is a no-op for an unknown display set id', () => {
      const { viewport } = createHarness();
      const renderCountBefore = viewport.renderCount;

      expect(() => viewport.removeData('does-not-exist')).not.toThrow();
      expect(viewport.renderCount).toBe(renderCountBefore);
    });

    it('does not trigger a render when the viewport has already been marked destroyed', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');
      const attachment = viewport.bindings.get('ds-1');

      viewport.isDestroyed = true;
      const renderCountBefore = viewport.renderCount;

      viewport.removeData('ds-1');

      expect(attachment.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.renderCount).toBe(renderCountBefore);
    });
  });

  describe('setDisplaySetPresentation / getDisplaySetPresentation', () => {
    it('targets the first mounted binding when called with props only', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1', { role: 'source' });
      await mountDisplaySet(viewport, 'ds-2', { role: 'overlay' });

      viewport.setDisplaySetPresentation({ opacity: 0.3 });

      expect(viewport.getDisplaySetPresentation('ds-1')).toEqual({
        opacity: 0.3,
      });
      expect(viewport.getDisplaySetPresentation('ds-2')).toBeUndefined();
    });

    it('targets an explicit display set id when provided', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1', { role: 'source' });
      await mountDisplaySet(viewport, 'ds-2', { role: 'overlay' });

      viewport.setDisplaySetPresentation('ds-2', { opacity: 0.7 });

      expect(viewport.getDisplaySetPresentation('ds-1')).toBeUndefined();
      expect(viewport.getDisplaySetPresentation('ds-2')).toEqual({
        opacity: 0.7,
      });
    });

    it('merges new keys with previously stored keys', () => {
      const { viewport } = createHarness();

      viewport.setDisplaySetPresentation('ds-1', {
        opacity: 0.5,
        visible: true,
      });
      viewport.setDisplaySetPresentation('ds-1', { opacity: 0.8 });

      expect(viewport.getDisplaySetPresentation('ds-1')).toEqual({
        opacity: 0.8,
        visible: true,
      });
    });

    it('is a no-op when called with props only and nothing is mounted', () => {
      const { viewport } = createHarness();
      const renderCountBefore = viewport.renderCount;

      expect(() =>
        viewport.setDisplaySetPresentation({ opacity: 0.5 })
      ).not.toThrow();
      expect(viewport.renderCount).toBe(renderCountBefore);
    });

    it('returns stored presentation for a display set that was never mounted', () => {
      const { viewport } = createHarness();

      viewport.setDisplaySetPresentation('never-mounted', { opacity: 0.1 });

      expect(viewport.getDisplaySetPresentation('never-mounted')).toEqual({
        opacity: 0.1,
      });
    });
  });

  describe('notifyDataPresentationModified hook', () => {
    it('is only invoked when the target display set is mounted', async () => {
      const { viewport } = createHarness();

      viewport.setDisplaySetPresentation('unmounted-ds', { opacity: 0.2 });
      expect(viewport.notifyDataPresentationModifiedSpy).not.toHaveBeenCalled();

      await mountDisplaySet(viewport, 'ds-1');
      viewport.setDisplaySetPresentation('ds-1', { opacity: 0.9 });

      expect(viewport.notifyDataPresentationModifiedSpy).toHaveBeenCalledWith(
        'ds-1',
        { opacity: 0.9 }
      );
    });
  });

  describe('setViewState / updateViewState', () => {
    it('merges the patch into the current view state', () => {
      const { viewport } = createHarness({
        viewState: { zoom: 1, pan: [0, 0] },
      });

      viewport.setViewState({ zoom: 2 });

      expect(viewport.getViewState()).toEqual({ zoom: 2, pan: [0, 0] });
    });

    it('runs the patch through the normalizeViewState hook', () => {
      const { viewport } = createHarness({ viewState: { zoom: 1 } });
      viewport._normalizeViewState = (vs) => ({
        ...vs,
        zoom: Math.min(vs.zoom, 5),
      });

      viewport.setViewState({ zoom: 10 });

      expect(viewport.normalizeViewStateSpy).toHaveBeenCalledWith({ zoom: 10 });
      expect(viewport.getViewState().zoom).toBe(5);
    });

    it('propagates the new view state to every binding and schedules a render', async () => {
      const { viewport } = createHarness({ viewState: { zoom: 1 } });

      await mountDisplaySet(viewport, 'ds-1');
      await mountDisplaySet(viewport, 'ds-2');
      const first = viewport.bindings.get('ds-1');
      const second = viewport.bindings.get('ds-2');
      first.applyViewState.mockClear();
      second.applyViewState.mockClear();
      const renderCountBefore = viewport.renderCount;

      viewport.setViewState({ zoom: 3 });

      expect(first.applyViewState).toHaveBeenCalledWith({ zoom: 3 });
      expect(second.applyViewState).toHaveBeenCalledWith({ zoom: 3 });
      expect(viewport.renderCount).toBeGreaterThan(renderCountBefore);
    });

    it('fires CAMERA_MODIFIED using the resolved-view camera when one is available', () => {
      const { element, viewport } = createHarness({ viewState: { zoom: 1 } });
      viewport._resolvedView = {
        toICamera: () => ({ zoom: viewport.getViewState().zoom }),
        getFrameOfReferenceUID: () => '1.2.3',
        canvasToWorld: jest.fn(),
        worldToCanvas: jest.fn(),
      };

      const events = [];
      element.addEventListener(Events.CAMERA_MODIFIED, (evt) => {
        events.push(evt.detail);
      });

      viewport.setViewState({ zoom: 3 });

      expect(events).toHaveLength(1);
      expect(events[0].previousCamera).toEqual({ zoom: 1 });
      expect(events[0].camera).toEqual({ zoom: 3 });
      expect(events[0].viewportId).toBe(viewport.id);
    });

    it('falls back to the raw view state for CAMERA_MODIFIED payloads when there is no resolved view', () => {
      const { element, viewport } = createHarness({ viewState: { zoom: 1 } });

      const events = [];
      element.addEventListener(Events.CAMERA_MODIFIED, (evt) => {
        events.push(evt.detail);
      });

      viewport.setViewState({ zoom: 4 });

      expect(events).toHaveLength(1);
      expect(events[0].previousCamera).toEqual({ zoom: 1 });
      expect(events[0].camera).toEqual({ zoom: 4 });
    });

    it('updateViewState accepts a function updater', () => {
      const { viewport } = createHarness({ viewState: { zoom: 1 } });

      viewport.updateViewState((vs) => ({ zoom: (vs.zoom ?? 0) + 1 }));

      expect(viewport.getViewState().zoom).toBe(2);
    });

    it('updateViewState is a no-op when the updater returns undefined or null', () => {
      const { viewport } = createHarness({ viewState: { zoom: 1 } });
      const renderCountBefore = viewport.renderCount;

      viewport.updateViewState(() => undefined);
      viewport.updateViewState(() => null);

      expect(viewport.getViewState()).toEqual({ zoom: 1 });
      expect(viewport.renderCount).toBe(renderCountBefore);
    });

    it('setViewState is a no-op after the viewport has been destroyed', () => {
      const { element, viewport } = createHarness({ viewState: { zoom: 1 } });

      viewport.destroy();
      const renderCountBefore = viewport.renderCount;
      const events = [];
      element.addEventListener(Events.CAMERA_MODIFIED, (evt) => {
        events.push(evt.detail);
      });

      viewport.setViewState({ zoom: 99 });

      expect(viewport.getViewState()).toEqual({ zoom: 1 });
      expect(viewport.renderCount).toBe(renderCountBefore);
      expect(events).toHaveLength(0);
    });
  });

  describe('destroy / dispose', () => {
    it('tears down all bindings, clears presentation state, removes element attributes, and calls onDestroy once', async () => {
      const { element, viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');
      await mountDisplaySet(viewport, 'ds-2');
      viewport.setDisplaySetPresentation('ds-1', { opacity: 0.4 });

      const first = viewport.bindings.get('ds-1');
      const second = viewport.bindings.get('ds-2');

      viewport.destroy();

      expect(first.removeData).toHaveBeenCalledTimes(1);
      expect(second.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.getDisplaySets()).toEqual([]);
      expect(viewport.getDisplaySetPresentation('ds-1')).toBeUndefined();
      expect(Object.keys(viewport._debug.renderModes)).toHaveLength(0);
      expect(element.hasAttribute('data-viewport-uid')).toBe(false);
      expect(element.hasAttribute('data-rendering-engine-uid')).toBe(false);
      expect(viewport.onDestroySpy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on a second call', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');
      const attachment = viewport.bindings.get('ds-1');

      viewport.destroy();
      viewport.destroy();

      expect(attachment.removeData).toHaveBeenCalledTimes(1);
      expect(viewport.onDestroySpy).toHaveBeenCalledTimes(1);
    });

    it('dispose aliases destroy', () => {
      const { viewport } = createHarness();

      viewport.dispose();

      expect(viewport.isDestroyed).toBe(true);
      expect(viewport.onDestroySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDisplaySets / getCurrentMode', () => {
    it('reports empty content mode with no bindings and unknown once a source binding mounts', async () => {
      const { viewport } = createHarness();

      expect(viewport.getCurrentMode()).toBe('empty');

      await mountDisplaySet(viewport, 'ds-1', { role: 'source' });

      expect(viewport.getCurrentMode()).toBe('unknown');
    });

    it('reflects mounted bindings in mount order with role metadata', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1', { role: 'source' });
      await mountDisplaySet(viewport, 'ds-2', { role: 'overlay' });

      expect(viewport.getDisplaySets()).toEqual([
        { displaySetId: 'ds-1', options: { role: 'source' } },
        { displaySetId: 'ds-2', options: { role: 'overlay' } },
      ]);
    });
  });

  describe('view reference helpers', () => {
    it('falls back to a viewport-local frame of reference id when there is no resolved view', () => {
      const { viewport } = createHarness();

      expect(viewport.getFrameOfReferenceUID()).toBe(
        `${viewport.type}-viewport-${viewport.id}`
      );
      expect(viewport.getViewReferenceId()).toBe(
        `frameOfReference:${viewport.type}-viewport-${viewport.id}`
      );
    });

    it('uses the resolved view frame of reference when one is available', () => {
      const { viewport } = createHarness();
      viewport._resolvedView = {
        getFrameOfReferenceUID: () => 'resolved-for',
        toICamera: () => ({}),
        canvasToWorld: jest.fn(),
        worldToCanvas: jest.fn(),
      };

      expect(viewport.getFrameOfReferenceUID()).toBe('resolved-for');
    });

    it('includes the current binding data id in getViewReference', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');

      expect(viewport.getViewReference().dataId).toBe('ds-1');
    });

    it('isReferenceViewable matches on frame of reference and data id from a mounted binding', async () => {
      const { viewport } = createHarness();
      const attachment = createAttachment({
        getFrameOfReferenceUID: () => 'for-match',
      });

      await mountDisplaySet(viewport, 'ds-1', {}, attachment);

      expect(
        viewport.isReferenceViewable({
          FrameOfReferenceUID: 'for-match',
          dataId: 'ds-1',
        })
      ).toBe(true);
      expect(
        viewport.isReferenceViewable({
          FrameOfReferenceUID: 'no-match',
          dataId: 'ds-1',
        })
      ).toBe(false);
    });
  });

  describe('coordinate transforms', () => {
    it('throws when converting canvas/world coordinates without a resolved view', () => {
      const { viewport } = createHarness();

      expect(() => viewport.canvasToWorld([0, 0])).toThrow(
        /no data is mounted/
      );
      expect(() => viewport.worldToCanvas([0, 0, 0])).toThrow(
        /no data is mounted/
      );
    });

    it('delegates canvas/world coordinate conversion to the resolved view', () => {
      const { viewport } = createHarness();
      viewport._resolvedView = {
        canvasToWorld: jest.fn(() => [1, 2, 3]),
        worldToCanvas: jest.fn(() => [4, 5]),
        getFrameOfReferenceUID: () => '1.2.3',
        toICamera: () => ({}),
      };

      expect(viewport.canvasToWorld([0, 0])).toEqual([1, 2, 3]);
      expect(viewport.worldToCanvas([1, 2, 3])).toEqual([4, 5]);
    });

    it('defaults getAspectRatio to [1, 1]', () => {
      const { viewport } = createHarness();

      expect(viewport.getAspectRatio()).toEqual([1, 1]);
    });
  });

  describe('render-status transitions', () => {
    it('setRendered does not mark the viewport rendered while NO_DATA or LOADING', () => {
      const { viewport } = createHarness();

      viewport.setRendered();
      expect(viewport.viewportStatus).toBe(ViewportStatus.NO_DATA);

      viewport.viewportStatus = ViewportStatus.LOADING;
      viewport.setRendered();
      expect(viewport.viewportStatus).toBe(ViewportStatus.LOADING);
    });

    it('setRendered marks the viewport rendered from other statuses', () => {
      const { viewport } = createHarness();

      viewport.viewportStatus = ViewportStatus.PRE_RENDER;
      viewport.setRendered();

      expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
    });

    it('setNeedsRender marks the viewport pending regardless of previous status', () => {
      const { viewport } = createHarness();

      viewport.viewportStatus = ViewportStatus.RENDERED;
      viewport.setNeedsRender();

      expect(viewport.viewportStatus).toBe(ViewportStatus.NEEDS_RENDER);
    });
  });

  describe('resize', () => {
    it('resizes each binding and re-applies the current view state', async () => {
      const { viewport } = createHarness({ viewState: { zoom: 2 } });

      await mountDisplaySet(viewport, 'ds-1');
      const attachment = viewport.bindings.get('ds-1');
      attachment.applyViewState.mockClear();

      viewport.resize();

      expect(attachment.resize).toHaveBeenCalledTimes(1);
      expect(attachment.applyViewState).toHaveBeenCalledWith({ zoom: 2 });
    });

    it('does not resize bindings once the viewport has been destroyed', async () => {
      const { viewport } = createHarness();

      await mountDisplaySet(viewport, 'ds-1');
      const attachment = viewport.bindings.get('ds-1');

      viewport.destroy();
      attachment.resize.mockClear();

      viewport.resize();

      expect(attachment.resize).not.toHaveBeenCalled();
    });

    it('resizeForRenderingEngine resets view state only when keepCamera is false', () => {
      const { viewport } = createHarness();
      const resetSpy = jest.spyOn(viewport, 'resetViewState');

      viewport.resizeForRenderingEngine();
      expect(resetSpy).not.toHaveBeenCalled();

      viewport.resizeForRenderingEngine({ keepCamera: false });
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });

    it('resizeForRenderingEngine is a no-op after destroy', () => {
      const { viewport } = createHarness();

      viewport.destroy();
      const resetSpy = jest.spyOn(viewport, 'resetViewState');

      viewport.resizeForRenderingEngine({ keepCamera: false });

      expect(resetSpy).not.toHaveBeenCalled();
    });
  });
});

describe('genericViewportDisplaySetAccess', () => {
  afterEach(() => {
    genericViewportDisplaySetMetadataProvider.clear();
  });

  it('returns undefined for every accessor when nothing is registered', () => {
    expect(getGenericViewportRegisteredDisplaySet('missing')).toBeUndefined();
    expect(getGenericViewportImageDisplaySet('missing')).toBeUndefined();
    expect(getGenericViewportPlanarDisplaySet('missing')).toBeUndefined();
    expect(getGenericViewportWSIDisplaySet('missing')).toBeUndefined();
  });

  it('normalizes a bare imageId array into an image/planar display set', () => {
    genericViewportDisplaySetMetadataProvider.add('ds-array', [
      'image:1',
      'image:2',
    ]);

    expect(getGenericViewportImageDisplaySet('ds-array')).toEqual({
      imageIds: ['image:1', 'image:2'],
    });
    expect(getGenericViewportPlanarDisplaySet('ds-array')).toEqual({
      imageIds: ['image:1', 'image:2'],
    });
  });

  it('passes through a registered planar display set object unchanged', () => {
    const registered = {
      imageIds: ['image:1'],
      kind: 'planar',
      volumeId: 'vol-1',
    };
    genericViewportDisplaySetMetadataProvider.add('ds-planar', registered);

    expect(getGenericViewportImageDisplaySet('ds-planar')).toBe(registered);
    expect(getGenericViewportPlanarDisplaySet('ds-planar')).toBe(registered);
  });

  it('excludes non-planar kinds from getGenericViewportPlanarDisplaySet', () => {
    const registered = {
      imageIds: ['image:1'],
      kind: 'wsi',
      options: { webClient: { getDICOMwebMetadata: () => {} } },
    };
    genericViewportDisplaySetMetadataProvider.add('ds-non-planar', registered);

    expect(getGenericViewportImageDisplaySet('ds-non-planar')).toBe(registered);
    expect(getGenericViewportPlanarDisplaySet('ds-non-planar')).toBeUndefined();
  });

  it('recognizes a canonically-shaped WSI display set', () => {
    const webClient = { getDICOMwebMetadata: () => {} };
    const registered = {
      kind: 'wsi',
      imageIds: ['wsi:1'],
      options: { webClient, miniNavigationOverlay: true },
    };
    genericViewportDisplaySetMetadataProvider.add('ds-wsi', registered);

    expect(getGenericViewportWSIDisplaySet('ds-wsi')).toEqual(registered);
  });

  it('normalizes a loosely-shaped WSI-like record into the canonical WSI shape', () => {
    const webClient = { getDICOMwebMetadata: () => {} };
    genericViewportDisplaySetMetadataProvider.add('ds-wsi-loose', {
      imageIds: ['wsi:1'],
      options: { webClient },
    });

    expect(getGenericViewportWSIDisplaySet('ds-wsi-loose')).toEqual({
      imageIds: ['wsi:1'],
      kind: 'wsi',
      options: { miniNavigationOverlay: undefined, webClient },
    });
  });

  it('resolves the source data id for strings, arrays, and alias display sets', () => {
    genericViewportDisplaySetMetadataProvider.add('ds-string', 'source-id-1');
    genericViewportDisplaySetMetadataProvider.add('ds-array-alias', [
      'first-id',
      'second-id',
    ]);
    genericViewportDisplaySetMetadataProvider.add('ds-video', {
      kind: 'video',
      sourceDataId: 'video-source-id',
    });

    expect(getGenericViewportSourceDataId('ds-string')).toBe('source-id-1');
    expect(getGenericViewportSourceDataId('ds-array-alias')).toBe('first-id');
    expect(getGenericViewportSourceDataId('ds-video')).toBe('video-source-id');
    expect(getGenericViewportSourceDataId('ds-unregistered')).toBe(
      'ds-unregistered'
    );
  });

  it('type guards classify shapes correctly', () => {
    expect(isGenericViewportImageDisplaySet({ imageIds: ['a'] })).toBe(true);
    expect(isGenericViewportImageDisplaySet({ imageIds: 'a' })).toBe(false);
    expect(
      isGenericViewportWSIDisplaySet({
        kind: 'wsi',
        imageIds: ['a'],
        options: { webClient: { getDICOMwebMetadata: () => {} } },
      })
    ).toBe(true);
    expect(
      isGenericViewportWSIDisplaySet({ kind: 'video', imageIds: ['a'] })
    ).toBe(false);
    expect(
      isGenericViewportSourceAliasDisplaySet({ kind: 'ecg', sourceDataId: 'x' })
    ).toBe(true);
    expect(
      isGenericViewportSourceAliasDisplaySet({ kind: 'wsi', sourceDataId: 'x' })
    ).toBe(false);
  });
});
