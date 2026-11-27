jest.mock(
  '../stateManagement/segmentation/SegmentationRenderingEngine',
  () => ({ triggerSegmentationRender: jest.fn() })
);

import { Enums } from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../stateManagement/segmentation/SegmentationRenderingEngine';
import CrosshairsTool from './CrosshairsTool';

const { COMPOSITE, MAXIMUM_INTENSITY_BLEND, LABELMAP_EDGE_PROJECTION_BLEND } =
  Enums.BlendModes;

/** A volume viewport holding one actor per blend mode given. */
function createViewport(...blendModes: number[]) {
  return {
    id: 'viewport',
    getActors: () =>
      blendModes.map((blendMode, index) => ({
        uid: `actor${index}`,
        actor: { getMapper: () => ({ getBlendMode: () => blendMode }) },
      })),
    setBlendMode: jest.fn(),
    setSlabThickness: jest.fn(),
  };
}

function setSlabThickness(
  viewport: ReturnType<typeof createViewport>,
  slabThickness: number,
  filterActorUIDsToSetSlabThickness: string[] = []
) {
  const tool = {
    configuration: {
      filterActorUIDsToSetSlabThickness,
      slabThicknessBlendMode: MAXIMUM_INTENSITY_BLEND,
    },
  };

  CrosshairsTool.prototype.setSlabThickness.call(tool, viewport, slabThickness);
}

describe('CrosshairsTool.setSlabThickness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('styles the labelmaps again when it takes a MIP out of edge projection', () => {
    const viewport = createViewport(LABELMAP_EDGE_PROJECTION_BLEND);

    setSlabThickness(viewport, 10);

    expect(viewport.setBlendMode).toHaveBeenCalledWith(
      MAXIMUM_INTENSITY_BLEND,
      undefined,
      false
    );
    expect(triggerSegmentationRender).toHaveBeenCalledWith('viewport');
  });

  it('styles them again when an actor that is not the first changes mode', () => {
    const viewport = createViewport(
      MAXIMUM_INTENSITY_BLEND,
      LABELMAP_EDGE_PROJECTION_BLEND
    );

    setSlabThickness(viewport, 10);

    expect(triggerSegmentationRender).toHaveBeenCalledWith('viewport');
  });

  it('styles them again when the minimum thickness makes the actors composite', () => {
    const viewport = createViewport(MAXIMUM_INTENSITY_BLEND);

    setSlabThickness(viewport, 0.05);

    expect(viewport.setBlendMode).toHaveBeenCalledWith(
      COMPOSITE,
      undefined,
      false
    );
    expect(triggerSegmentationRender).toHaveBeenCalledWith('viewport');
  });

  it('leaves them while the drag keeps the blend mode', () => {
    const viewport = createViewport(MAXIMUM_INTENSITY_BLEND);

    setSlabThickness(viewport, 10);
    setSlabThickness(viewport, 20);

    expect(viewport.setSlabThickness).toHaveBeenCalledTimes(2);
    expect(triggerSegmentationRender).not.toHaveBeenCalled();
  });

  it('looks only at the actors the slab is set on', () => {
    const viewport = createViewport(
      MAXIMUM_INTENSITY_BLEND,
      LABELMAP_EDGE_PROJECTION_BLEND
    );

    setSlabThickness(viewport, 10, ['actor0']);

    expect(viewport.setBlendMode).toHaveBeenCalledWith(
      MAXIMUM_INTENSITY_BLEND,
      ['actor0'],
      false
    );
    expect(triggerSegmentationRender).not.toHaveBeenCalled();
  });
});
