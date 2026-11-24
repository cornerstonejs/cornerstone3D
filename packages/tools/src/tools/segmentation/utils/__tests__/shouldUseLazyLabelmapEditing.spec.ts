import { getConfig, setConfig } from '../../../../config';
import {
  isCPUViewport,
  shouldUseLazyLabelmapEditing,
} from '../shouldUseLazyLabelmapEditing';

/** A planar viewport whose render plan has one source layer. */
function createViewport(layer?: { slice: string; draw: string }) {
  return {
    getRenderPlan: () =>
      layer ? [{ displaySetId: 'ct', role: 'source', ...layer }] : [],
  };
}

describe('shouldUseLazyLabelmapEditing', () => {
  const originalConfig = getConfig();

  afterEach(() => {
    setConfig(originalConfig);
  });

  it('enables lazy editing for CPU image labelmap viewports', () => {
    setConfig({} as never);

    expect(
      shouldUseLazyLabelmapEditing(
        createViewport({ slice: 'frame', draw: 'cpu' }) as never
      )
    ).toBe(true);
  });

  it('enables lazy editing for CPU volume labelmap viewports', () => {
    setConfig({} as never);

    expect(
      shouldUseLazyLabelmapEditing(
        createViewport({ slice: 'cpu', draw: 'cpu' }) as never
      )
    ).toBe(true);
  });

  it('preserves overwrite-mode lazy editing for non-CPU viewports', () => {
    setConfig({
      segmentation: {
        overwriteMode: 'none',
      },
    } as never);

    expect(
      shouldUseLazyLabelmapEditing(
        createViewport({ slice: 'frame', draw: 'gpu' }) as never
      )
    ).toBe(true);
  });

  it('detects a viewport whose render plan draws the source on the CPU', () => {
    setConfig({} as never);

    expect(
      isCPUViewport({
        getRenderPlan: () => [
          { displaySetId: 'ct', role: 'source', draw: 'cpu' },
        ],
      } as never)
    ).toBe(true);
  });

  it('reads the source layer of the render plan, not an overlay layer', () => {
    setConfig({} as never);

    expect(
      isCPUViewport({
        ...createViewport({ slice: 'frame', draw: 'gpu' }),
        getRenderPlan: () => [
          { displaySetId: 'ct', role: 'source', draw: 'gpu' },
          { displaySetId: 'pt', role: 'overlay', draw: 'cpu' },
        ],
      } as never)
    ).toBe(false);
  });

  it('does not count the members of the legacy CPU fallback stack viewport', () => {
    setConfig({} as never);

    expect(
      isCPUViewport({
        ...createViewport({ slice: 'frame', draw: 'gpu' }),
        _cpuFallbackEnabledElement: {},
        useCPURendering: true,
        getRenderPlan: () => [
          { displaySetId: 'ct', role: 'source', draw: 'gpu' },
        ],
      } as never)
    ).toBe(false);
  });
});
