import { describe, it, expect, beforeEach } from '@jest/globals';
import ImageVolume, {
  FULL_RESOLUTION_TEXTURE_SET,
} from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';

// The named texture sets on `ImageVolume`, which is MR-API-IV-2, MR-API-IV-3
// and MR-API-IV-6 to MR-API-IV-8 of cornerstone3D issue #2921.
//
// NONE OF THESE TESTS NEEDS A GPU. A texture object costs no GPU memory; the
// allocation happens when a mapper first renders the texture, and commit 7 of
// this work puts the check of the limits at that allocation.

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dimensions = [4, 4, 4];
const spacing = [1, 1, 1];
const origin = [0, 0, 0];

function makeRamp([width, height, depth]) {
  const scalarData = new Uint16Array(width * height * depth);

  for (let index = 0; index < scalarData.length; index++) {
    scalarData[index] = index;
  }

  return VoxelManager.createScalarVolumeVoxelManager({
    dimensions: [width, height, depth],
    scalarData,
    numberOfComponents: 1,
  });
}

function makeVolume({ volumeId = 'texture-volume' } = {}) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `image:${volumeId}:${k}`
  );

  return new ImageVolume({
    volumeId,
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions,
    spacing,
    origin,
    direction: identityDirection,
    imageIds,
    dataType: 'Uint16Array',
    numberOfComponents: 1,
    voxelManager: makeRamp(dimensions),
  });
}

/** The grid that halves the two in-plane axes of the volume. */
function reducedGrid() {
  return {
    dimensions: [2, 2, 4],
    spacing: [2, 2, 1],
    origin: [0.5, 0.5, 0],
    direction: identityDirection,
  };
}

describe('ImageVolume — the constructor builds no texture', () => {
  it('leaves vtkOpenGLTexture unassigned', () => {
    const volume = makeVolume();

    expect(volume.vtkOpenGLTexture).toBeUndefined();
  });

  it('builds the full-resolution texture when a caller claims it, and names it', () => {
    const volume = makeVolume();

    const texture = volume.getFullResolutionTexture();

    expect(texture).toBeDefined();
    expect(volume.vtkOpenGLTexture).toBe(texture);
    expect(volume.textureSets.map((set) => set.name)).toEqual([
      FULL_RESOLUTION_TEXTURE_SET,
    ]);

    // A second call gives the one texture of that set, and it builds nothing.
    expect(volume.getFullResolutionTexture()).toBe(texture);
    expect(volume.getTextureSet(FULL_RESOLUTION_TEXTURE_SET).size).toBe(1);
  });

  it('leaves vtkOpenGLTexture unassigned when a render path claims a reduced grid', () => {
    const volume = makeVolume();

    const set = volume.provisionTextureSet({
      name: 'reduced-2x2x1/full-extent',
      grids: [reducedGrid()],
    });

    expect(set.members()[0].texture).toBeDefined();
    expect(volume.vtkOpenGLTexture).toBeUndefined();
    expect(volume.textureSets.length).toBe(1);
  });

  it('gives one set to two render paths, and counts the holders', () => {
    const volume = makeVolume();
    const name = 'reduced-2x2x1/full-extent';
    const options = { name, grids: [reducedGrid()] };

    const first = volume.provisionTextureSet(options);
    const second = volume.provisionTextureSet(options);

    expect(second).toBe(first);

    volume.claimTextureSet(name);
    volume.claimTextureSet(name);

    expect(first.references).toBe(2);

    volume.releaseTextureSet(name);

    expect(first.references).toBe(1);
  });
});

describe('ImageVolume — the marks of a frame', () => {
  it('builds no pool when the volume holds no texture', () => {
    const volume = makeVolume();

    volume.markFrameDirty(1);
    volume.invalidate();
    volume.modified();

    expect(volume.vtkOpenGLTexture).toBeUndefined();
  });

  it('marks the frame in every texture whose grid covers it', () => {
    const volume = makeVolume();

    volume.getFullResolutionTexture();

    const primary = volume
      .getTextureSet(FULL_RESOLUTION_TEXTURE_SET)
      .members()[0];
    const derived = volume
      .provisionTextureSet({ name: 'reduced', grids: [reducedGrid()] })
      .members()[0];

    primary.dirty = [];
    derived.dirty = [];

    volume.markFrameDirty(2);

    expect(primary.dirty).toEqual([
      [
        [0, 3],
        [0, 3],
        [2, 2],
      ],
    ]);
    expect(derived.dirty).toEqual([
      [
        [0, 1],
        [0, 1],
        [2, 2],
      ],
    ]);
    expect(primary.texture.getUpdatedFrames()[2]).toBe(true);
    expect(derived.texture.getUpdatedFrames()[2]).toBe(true);
  });

  it('marks every voxel of every texture when a caller invalidates the volume', () => {
    const volume = makeVolume();

    volume.getFullResolutionTexture();

    const primary = volume
      .getTextureSet(FULL_RESOLUTION_TEXTURE_SET)
      .members()[0];
    const derived = volume
      .provisionTextureSet({ name: 'reduced', grids: [reducedGrid()] })
      .members()[0];

    primary.dirty = [];
    derived.dirty = [];

    volume.invalidate();

    expect(primary.dirty).toEqual([
      [
        [0, 3],
        [0, 3],
        [0, 3],
      ],
    ]);
    expect(derived.dirty).toEqual([
      [
        [0, 1],
        [0, 1],
        [0, 3],
      ],
    ]);
  });
});

describe('ImageVolume — the global budget', () => {
  it('holds no budget until a caller states one', () => {
    const volume = makeVolume();

    expect(ImageVolume.textureBudget).toBe(0);
    expect(volume.getFullResolutionTexture()).toBeDefined();
    expect(ImageVolume.textureBytesUsed).toBe(4 * 4 * 4 * 4);
  });

  it('counts the textures of every volume together', () => {
    makeVolume({ volumeId: 'a' }).getFullResolutionTexture();
    makeVolume({ volumeId: 'b' }).getFullResolutionTexture();

    expect(ImageVolume.textureBytesUsed).toBe(2 * 4 * 4 * 4 * 4);
  });

  it('refuses a set that the budget cannot hold, and builds no texture', () => {
    const volume = makeVolume();

    ImageVolume.setTextureBudget(16);

    expect(volume.getFullResolutionTexture()).toBeUndefined();
    expect(volume.vtkOpenGLTexture).toBeUndefined();
    expect(volume.textureSets.length).toBe(0);
  });
});
