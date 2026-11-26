import { describe, it, expect } from '@jest/globals';
import { getPlanarOverlayFrameState } from '../src/RenderingEngine/Viewports/Planar/planarOverlayFrames';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';

const FRAMES = 10;
const SPACING = [1, 1, 2];

/**
 * A volume of 4 by 4 by 10 voxels of 1 by 1 by 2 mm at the origin whose
 * frames hold the given qualities (undefined: no data), as the record of the
 * deliveries of a streaming volume states them.
 */
function createVolume(qualities) {
  return {
    dimensions: [4, 4, FRAMES],
    spacing: SPACING,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageData: {
      indexToWorld: ([i, j, k]) => [
        i * SPACING[0],
        j * SPACING[1],
        k * SPACING[2],
      ],
      worldToIndex: ([x, y, z]) => [
        x / SPACING[0],
        y / SPACING[1],
        z / SPACING[2],
      ],
    },
    getVoxelQuality: ({ region }) => {
      const frames = qualities.slice(region[2][0], region[2][1] + 1);
      const missing = frames.filter((quality) => quality === undefined).length;
      const known = frames.filter((quality) => quality !== undefined);

      return {
        missing,
        status: missing ? ImageQualityStatus.FAR_REPLICATE : Math.min(...known),
      };
    },
  };
}

const FULL = ImageQualityStatus.FULL_RESOLUTION;
const ADJACENT = ImageQualityStatus.ADJACENT_REPLICATE;
const FAR = ImageQualityStatus.FAR_REPLICATE + 1 / 27;
const AXIAL = [0, 0, 1];
const SAGITTAL = [1, 0, 0];

const NONE = 'none';

function qualities(frameQualities) {
  return Array.from({ length: FRAMES }, (_, k) =>
    frameQualities[k] === NONE ? undefined : (frameQualities[k] ?? FULL)
  );
}

describe('getPlanarOverlayFrameState', () => {
  it('draws a plane on a frame of its own data, and nothing on a frame that holds a copy of another frame or no data', () => {
    const camera = { focalPoint: [1, 1, 8], viewPlaneNormal: AXIAL };

    expect(
      getPlanarOverlayFrameState(createVolume(qualities({})), camera)
    ).toBe('ready');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 4: FAR })), camera)
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 4: ADJACENT })),
        camera
      )
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 4: NONE })), camera)
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 4: ImageQualityStatus.SUBRESOLUTION })),
        camera
      )
    ).toBe('ready');
  });

  it('reads the nearest frame alone between two frames while the other one holds a copy, and nothing while the nearest one does', () => {
    const between = { focalPoint: [1, 1, 8.6], viewPlaneNormal: AXIAL };

    expect(
      getPlanarOverlayFrameState(createVolume(qualities({})), between)
    ).toBe('ready');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 5: FAR })), between)
    ).toBe('nearest');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 4: FAR })), between)
    ).toBe('empty');
  });

  it('needs every frame of a slab, and every frame that a sagittal plane crosses', () => {
    const slabCamera = { focalPoint: [1, 1, 8], viewPlaneNormal: AXIAL };
    const sagittal = { focalPoint: [1, 1, 8], viewPlaneNormal: SAGITTAL };

    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 7: FAR })),
        slabCamera,
        6
      )
    ).toBe('ready');
    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 6: FAR })),
        slabCamera,
        6
      )
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 5: FAR })),
        slabCamera,
        6
      )
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(
        createVolume(qualities({ 5: FAR })),
        slabCamera,
        0
      )
    ).toBe('ready');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 9: FAR })), sagittal)
    ).toBe('empty');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({})), sagittal)
    ).toBe('ready');
  });

  it('draws a volume that states no deliveries, and a plane outside the volume', () => {
    const volume = createVolume(qualities({ 4: FAR }));

    delete volume.getVoxelQuality;

    expect(
      getPlanarOverlayFrameState(volume, {
        focalPoint: [1, 1, 8],
        viewPlaneNormal: AXIAL,
      })
    ).toBe('ready');
    expect(
      getPlanarOverlayFrameState(createVolume(qualities({ 4: FAR })), {
        focalPoint: [1, 1, 40],
        viewPlaneNormal: AXIAL,
      })
    ).toBe('ready');
  });
});
