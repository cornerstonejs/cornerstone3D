import { describe, it, expect, jest } from '@jest/globals';
import { beginPlanarCanvasPass } from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceCanvas';

/** A canvas target that records the fill of each pass. */
function createTarget(background) {
  const fills = [];
  const context = {
    fillStyle: '',
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(() => {
      fills.push(context.fillStyle);
    }),
  };

  return {
    fills,
    target: {
      canvas: { width: 8, height: 4 },
      composition: { clearedRenderPassId: -1, renderPassId: 0 },
      context,
      getBackground: background === 'none' ? undefined : () => background,
    },
  };
}

describe('beginPlanarCanvasPass', () => {
  it('clears to black for a viewport without a background colour', () => {
    for (const background of ['none', undefined, []]) {
      const { fills, target } = createTarget(background);

      beginPlanarCanvasPass(target);

      expect(fills).toEqual(['#000']);
    }
  });

  it('clears to the background colour of the viewport', () => {
    const { fills, target } = createTarget([0, 0.2, 1]);

    beginPlanarCanvasPass(target);

    expect(fills).toEqual(['rgb(0, 51, 255)']);
    expect(target.context.fillRect).toHaveBeenCalledWith(0, 0, 8, 4);
  });

  it('keeps each channel between 0 and 255', () => {
    const { fills, target } = createTarget([-1, 2, NaN]);

    beginPlanarCanvasPass(target);

    expect(fills).toEqual(['rgb(0, 255, 0)']);
  });

  it('clears once per render pass', () => {
    const { fills, target } = createTarget([1, 0, 0]);

    beginPlanarCanvasPass(target);
    beginPlanarCanvasPass(target);
    target.composition.renderPassId += 1;
    beginPlanarCanvasPass(target);

    expect(fills).toHaveLength(2);
  });
});
