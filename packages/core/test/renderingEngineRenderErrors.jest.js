import BaseRenderingEngine from '../src/RenderingEngine/BaseRenderingEngine';
import ViewportStatus from '../src/enums/ViewportStatus';

const { _renderFlaggedViewport } = BaseRenderingEngine.prototype;

function createEngine(viewportIds) {
  return { _needsRender: new Set(viewportIds) };
}

function createViewport(id) {
  return {
    id,
    viewportStatus: ViewportStatus.NEEDS_RENDER,
    setRendered() {
      this.viewportStatus = ViewportStatus.RENDERED;
    },
  };
}

describe('BaseRenderingEngine._renderFlaggedViewport', () => {
  it('marks a viewport whose render throws as RENDER_ERROR and removes it from the queue', () => {
    const engine = createEngine(['a']);
    const viewport = createViewport('a');

    const eventDetail = _renderFlaggedViewport.call(engine, viewport, () => {
      throw new Error('render failed');
    });

    expect(eventDetail).toBeUndefined();
    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDER_ERROR);
    expect(engine._needsRender.has('a')).toBe(false);
  });

  it('clears RENDER_ERROR on the next successful render', () => {
    const engine = createEngine(['a']);
    const viewport = createViewport('a');
    viewport.viewportStatus = ViewportStatus.RENDER_ERROR;
    const detail = { viewportId: 'a' };

    const eventDetail = _renderFlaggedViewport.call(
      engine,
      viewport,
      () => detail
    );

    expect(eventDetail).toBe(detail);
    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
    expect(engine._needsRender.has('a')).toBe(false);
  });
});
