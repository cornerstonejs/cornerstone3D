import { ActorRenderMode } from '@cornerstonejs/core';

import { getConfig, setConfig } from '../../../../config';
import {
  isCPUViewport,
  shouldUseLazyLabelmapEditing,
} from '../shouldUseLazyLabelmapEditing';

function createViewport(renderMode?: unknown) {
  return {
    getDefaultActor: () =>
      renderMode
        ? {
            actorMapper: {
              renderMode,
            },
          }
        : undefined,
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
        createViewport(ActorRenderMode.CPU_IMAGE) as never
      )
    ).toBe(true);
  });

  it('enables lazy editing for CPU volume labelmap viewports', () => {
    setConfig({} as never);

    expect(
      shouldUseLazyLabelmapEditing(
        createViewport(ActorRenderMode.CPU_VOLUME) as never
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
        createViewport(ActorRenderMode.VTK_IMAGE) as never
      )
    ).toBe(true);
  });

  it('detects legacy CPU fallback stack viewports', () => {
    setConfig({} as never);

    expect(
      isCPUViewport({
        _cpuFallbackEnabledElement: {},
      } as never)
    ).toBe(true);
  });
});
