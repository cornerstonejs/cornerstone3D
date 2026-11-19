import { describe, it, expect, jest } from '@jest/globals';
import { RenderModesPanel } from '../src/RenderingEngine/helpers/stats/RenderModesPanel';
import {
  collectBindingFacts,
  getDeviceLimits,
  summarizeTextureMemory,
} from '../src/RenderingEngine/helpers/stats/collectBindingFacts';
import { getImageMapperTextureFacts } from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper';

jest.mock(
  '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper',
  () => ({
    getImageMapperTextureFacts: jest.fn(),
  })
);

function sampledRendering(ArrayType) {
  const data = new ArrayType(128 * 135);
  const input = {
    getDimensions: () => [128, 135, 1],
    getPointData: () => ({
      getScalars: () => ({
        getDataType: () => ArrayType.name,
        getNumberOfComponents: () => 1,
        getData: () => data,
      }),
    }),
  };
  const mapper = { getInputData: () => input };

  return {
    renderMode: 'vtkSampledSlice',
    mapper,
    actor: { getMapper: () => mapper },
  };
}

function sliceTextureOf(rendering, facts) {
  getImageMapperTextureFacts.mockReturnValue(facts);

  const viewport = {
    getDebugBindings: () => [{ displaySetId: 'pt', rendering }],
  };

  return collectBindingFacts(viewport, () => 0).get('pt').gpuTextures[0];
}

describe('device facts in the debug panel', () => {
  it('names the float filtering limit of a device in the summary', () => {
    expect(getDeviceLimits({ webgl: true, floatLinear: false })).toEqual([
      'float textures: no linear filtering',
    ]);
    expect(getDeviceLimits({ webgl: true, floatLinear: true })).toEqual([]);
    expect(getDeviceLimits({ webgl: false, floatLinear: false })).toEqual([]);
    expect(
      summarizeTextureMemory([], 0, { webgl: true, floatLinear: false })
        .deviceLimits
    ).toEqual(['float textures: no linear filtering']);
    expect(
      summarizeTextureMemory([], 0, { webgl: true, floatLinear: true })
    ).not.toHaveProperty('deviceLimits');
    expect(summarizeTextureMemory([], 0)).not.toHaveProperty('deviceLimits');
  });

  it('shows a half float slice texture and a nearest float slice texture on the row', () => {
    const half = sliceTextureOf(sampledRendering(Float32Array), {
      textureFormat: 'R16F',
      filter: 'linear',
      nearestForFloat: false,
    });
    const nearest = sliceTextureOf(sampledRendering(Float32Array), {
      textureFormat: 'R32F',
      filter: 'nearest',
      nearestForFloat: true,
    });

    expect(half).toMatchObject({ textureFormat: 'R16F', filter: 'linear' });
    expect(nearest).toMatchObject({ textureFormat: 'R32F', filter: 'nearest' });
  });

  it('says nothing more for a default texture', () => {
    [
      { textureFormat: 'R16_SNORM', filter: 'linear', nearestForFloat: false },
      { textureFormat: 'R32F', filter: 'linear', nearestForFloat: false },
      { textureFormat: 'R16_SNORM', filter: 'nearest', nearestForFloat: false },
      undefined,
    ].forEach((facts) => {
      const texture = sliceTextureOf(sampledRendering(Int16Array), facts);

      expect(texture).not.toHaveProperty('textureFormat');
      expect(texture).not.toHaveProperty('filter');
    });
  });

  it('writes the texture and the limit in the panel', () => {
    const panel = new RenderModesPanel();
    const texture = sliceTextureOf(sampledRendering(Float32Array), {
      textureFormat: 'R16F',
      filter: 'linear',
      nearestForFloat: false,
    });

    panel.setContent(
      [
        {
          renderingEngineId: 'engine',
          viewportId: 'FUSION',
          viewportType: 'planar',
          bindings: [
            {
              dataId: 'pt',
              role: 'overlay',
              renderMode: 'vtkSampledSlice',
              gpuTextures: [texture],
            },
          ],
        },
      ],
      summarizeTextureMemory([], 0, { webgl: true, floatLinear: false })
    );

    expect(panel.dom.textContent).toContain('held as R16F linear');
    expect(panel.dom.textContent).toContain(
      'float textures: no linear filtering'
    );
  });
});
