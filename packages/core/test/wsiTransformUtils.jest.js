import { mat4 } from 'gl-matrix';
import {
  computeWSITransforms,
  worldToIndexWSIMetadata,
  indexToWorldWSIMetadata,
  buildWSIImageData,
  buildWSIColorTransform,
  canvasToIndexForWSI,
  indexToCanvasForWSI,
} from '../src/RenderingEngine/GenericViewport/WSI/wsiTransformUtils';

// Identity-oriented WSI: row cosines [1,0,0], column cosines [0,1,0],
// scan-axis normal (cross product) [0,0,1]. Origin offset from slide corner
// and non-uniform pixel spacing to make round-trips non-trivial.
function makeIdentityMetadata(overrides = {}) {
  return {
    bitsAllocated: 8,
    numberOfComponents: 3,
    origin: [10, 20, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    dimensions: [2000, 1000, 1],
    spacing: [0.25, 0.5, 1],
    hasPixelSpacing: true,
    numVoxels: 2000 * 1000,
    imagePlaneModule: {},
    ...overrides,
  };
}

// A WSI rotated 90 degrees about the scan axis: row cosines [0,1,0], column
// cosines [-1,0,0], scan-axis normal = row x col = [0,0,1].
function makeRotatedMetadata(overrides = {}) {
  return {
    bitsAllocated: 8,
    numberOfComponents: 3,
    origin: [5, 5, 0],
    direction: [0, 1, 0, -1, 0, 0, 0, 0, 1],
    dimensions: [800, 400, 1],
    spacing: [0.5, 0.5, 1],
    hasPixelSpacing: true,
    numVoxels: 800 * 400,
    imagePlaneModule: {},
    ...overrides,
  };
}

describe('wsiTransformUtils', () => {
  describe('computeWSITransforms', () => {
    it('returns undefined when metadata is undefined', () => {
      expect(computeWSITransforms(undefined)).toBeUndefined();
    });

    it('builds indexToWorld/worldToIndex matrices that compose to identity', () => {
      const metadata = makeIdentityMetadata();
      const transforms = computeWSITransforms(metadata);

      expect(transforms).toBeDefined();

      const composed = mat4.create();
      mat4.multiply(
        composed,
        transforms.worldToIndexMatrix,
        transforms.indexToWorld
      );

      // indexToWorld followed by worldToIndex should be the identity matrix.
      for (let i = 0; i < 16; i++) {
        const expected = i % 5 === 0 ? 1 : 0; // identity has 1s on the diagonal (0,5,10,15)
        expect(composed[i]).toBeCloseTo(expected, 6);
      }
    });

    it('encodes origin as translation and spacing as scale for the identity-oriented metadata', () => {
      const metadata = makeIdentityMetadata();
      const transforms = computeWSITransforms(metadata);
      const m = transforms.indexToWorld;

      // Column-major mat4: translation lives in m[12..14].
      expect(m[12]).toBeCloseTo(metadata.origin[0], 6);
      expect(m[13]).toBeCloseTo(metadata.origin[1], 6);
      expect(m[14]).toBeCloseTo(metadata.origin[2], 6);
      // Diagonal scale terms equal the spacing for an identity direction.
      expect(m[0]).toBeCloseTo(metadata.spacing[0], 6);
      expect(m[5]).toBeCloseTo(metadata.spacing[1], 6);
      expect(m[10]).toBeCloseTo(metadata.spacing[2], 6);
    });
  });

  describe('worldToIndexWSIMetadata / indexToWorldWSIMetadata', () => {
    it('returns [0,0,0] when metadata is undefined', () => {
      expect(worldToIndexWSIMetadata(undefined, [1, 2, 3])).toEqual([0, 0, 0]);
      expect(indexToWorldWSIMetadata(undefined, [1, 2, 3])).toEqual([0, 0, 0]);
    });

    it('maps index (0,0,0) to the metadata origin for identity orientation', () => {
      const metadata = makeIdentityMetadata();

      expect(indexToWorldWSIMetadata(metadata, [0, 0, 0])).toEqual(
        metadata.origin
      );
    });

    it('applies spacing per index unit for identity orientation', () => {
      const metadata = makeIdentityMetadata();
      // index [4, 10, 0] -> world = origin + [4*0.25, 10*0.5, 0*1]
      const world = indexToWorldWSIMetadata(metadata, [4, 10, 0]);

      expect(world[0]).toBeCloseTo(10 + 4 * 0.25, 6);
      expect(world[1]).toBeCloseTo(20 + 10 * 0.5, 6);
      expect(world[2]).toBeCloseTo(0, 6);
    });

    it('round-trips world -> index -> world for identity orientation', () => {
      const metadata = makeIdentityMetadata();
      const worldPoint = [123.5, 456.75, 0];
      const indexPoint = worldToIndexWSIMetadata(metadata, worldPoint);
      const roundTripped = indexToWorldWSIMetadata(metadata, indexPoint);

      expect(roundTripped[0]).toBeCloseTo(worldPoint[0], 6);
      expect(roundTripped[1]).toBeCloseTo(worldPoint[1], 6);
      expect(roundTripped[2]).toBeCloseTo(worldPoint[2], 6);
    });

    it('round-trips index -> world -> index for a rotated WSI orientation', () => {
      const metadata = makeRotatedMetadata();
      const indexPoint = [40, 100, 0];
      const worldPoint = indexToWorldWSIMetadata(metadata, indexPoint);
      const roundTripped = worldToIndexWSIMetadata(metadata, worldPoint);

      expect(roundTripped[0]).toBeCloseTo(indexPoint[0], 6);
      expect(roundTripped[1]).toBeCloseTo(indexPoint[1], 6);
      expect(roundTripped[2]).toBeCloseTo(indexPoint[2], 6);
    });

    it('applies the rotated direction so index x moves along world y', () => {
      const metadata = makeRotatedMetadata();
      // direction row-cosine = [0,1,0]: moving one unit along index-x should
      // move spacing[0] units along world-y (not world-x), starting at origin.
      const world = indexToWorldWSIMetadata(metadata, [1, 0, 0]);

      expect(world[0]).toBeCloseTo(metadata.origin[0], 6);
      expect(world[1]).toBeCloseTo(metadata.origin[1] + metadata.spacing[0], 6);
      expect(world[2]).toBeCloseTo(metadata.origin[2], 6);
    });
  });

  describe('buildWSIImageData', () => {
    it('returns null when metadata is undefined', () => {
      expect(buildWSIImageData({ metadata: undefined })).toBeNull();
    });

    it('maps metadata fields onto the CPU image data shape, defaulting modality to SM', () => {
      const metadata = makeIdentityMetadata();
      const imageData = buildWSIImageData({ metadata });

      expect(imageData.dimensions).toBe(metadata.dimensions);
      expect(imageData.spacing).toBe(metadata.spacing);
      expect(imageData.numberOfComponents).toBe(3);
      expect(imageData.origin).toBe(metadata.origin);
      expect(imageData.direction).toBe(metadata.direction);
      expect(imageData.metadata).toEqual({
        Modality: 'SM',
        FrameOfReferenceUID: '',
      });
      expect(imageData.hasPixelSpacing).toBe(true);
      expect(imageData.preScale).toEqual({ scaled: false });
      expect(imageData.scalarData).toBeNull();
    });

    it('honors an explicit modality and frameOfReferenceUID', () => {
      const metadata = makeIdentityMetadata();
      const imageData = buildWSIImageData({
        metadata,
        modality: 'XC',
        frameOfReferenceUID: 'frame-123',
      });

      expect(imageData.metadata).toEqual({
        Modality: 'XC',
        FrameOfReferenceUID: 'frame-123',
      });
    });

    it('falls back to an empty FrameOfReferenceUID when it is null', () => {
      const metadata = makeIdentityMetadata();
      const imageData = buildWSIImageData({
        metadata,
        frameOfReferenceUID: null,
      });

      expect(imageData.metadata.FrameOfReferenceUID).toBe('');
    });

    it('wires the embedded imageData helper functions to the transform utilities', () => {
      const metadata = makeIdentityMetadata();
      const imageData = buildWSIImageData({ metadata });

      expect(imageData.imageData.getDimensions()).toBe(metadata.dimensions);
      expect(imageData.imageData.getSpacing()).toBe(metadata.spacing);
      expect(imageData.imageData.getRange()).toEqual([0, 255]);
      expect(imageData.imageData.getDirection()).toBe(metadata.direction);
      expect(imageData.imageData.getScalarData()).toBeNull();

      const worldPoint = [15, 25, 0];
      const indexPoint = imageData.imageData.worldToIndex(worldPoint);
      const roundTripped = imageData.imageData.indexToWorld(indexPoint);

      expect(roundTripped[0]).toBeCloseTo(worldPoint[0], 6);
      expect(roundTripped[1]).toBeCloseTo(worldPoint[1], 6);
    });
  });

  describe('buildWSIColorTransform', () => {
    it('returns undefined when neither voiRange nor averageWhite is provided', () => {
      expect(buildWSIColorTransform(undefined, undefined)).toBeUndefined();
    });

    it('produces an SVG data-URL color matrix filter when voiRange is provided', () => {
      const result = buildWSIColorTransform({ lower: 0, upper: 255 });

      expect(result).toEqual(
        expect.stringContaining("url('data:image/svg+xml,")
      );
      expect(result).toEqual(expect.stringContaining('feColorMatrix'));
    });

    it('defaults lower/upper to 0/255 (identity window) when voiRange fields are missing', () => {
      // wlScale = (255-0+1)/255 = 1.0039..., wlDelta = 0
      const withEmptyRange = buildWSIColorTransform({});
      const wlScale = (255 - 0 + 1) / 255;

      expect(withEmptyRange).toEqual(
        expect.stringContaining(`${1 * wlScale} 0 0 0 0`)
      );
    });

    it('scales each color channel by maxWhite/channel when averageWhite is provided', () => {
      // white = [255, 200, 100], maxWhite = 255
      // scaleWhite = [1, 255/200, 2.55]
      // voiRange defaults to lower=0, upper=255 -> wlScale = 256/255, wlDelta = 0
      const result = buildWSIColorTransform(undefined, [255, 200, 100]);
      const wlScale = (255 - 0 + 1) / 255;
      const scaleWhiteG = (255 / 200) * wlScale;
      const scaleWhiteB = (255 / 100) * wlScale;

      expect(result).toEqual(expect.stringContaining(`${1 * wlScale} 0 0 0 0`));
      expect(result).toEqual(expect.stringContaining(`0 ${scaleWhiteG} 0 0 0`));
      expect(result).toEqual(expect.stringContaining(`0 0 ${scaleWhiteB} 0 0`));
    });

    it('applies a non-zero window lower bound as a wlDelta offset', () => {
      // lower=51, upper=255 -> wlDelta = 51/255 = 0.2
      const result = buildWSIColorTransform({ lower: 51, upper: 255 });

      expect(result).toEqual(expect.stringContaining(' 0.2 '));
    });
  });

  describe('canvasToIndexForWSI / indexToCanvasForWSI', () => {
    function makeView({
      resolution = 1,
      rotation = 0,
      center = [100, 50],
    } = {}) {
      return {
        getResolution: () => resolution,
        getRotation: () => rotation,
        getCenter: () => center,
      };
    }

    const originalDPR = window.devicePixelRatio;

    afterEach(() => {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: originalDPR,
      });
    });

    it('maps the canvas center to the view center with no rotation (devicePixelRatio 1)', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: 1,
      });
      const view = makeView({ resolution: 1, center: [100, 50] });

      const indexPos = canvasToIndexForWSI({
        canvasPos: [100, 100], // half of a 200x200 canvas
        canvasWidth: 200,
        canvasHeight: 200,
        view,
      });

      expect(indexPos[0]).toBeCloseTo(100, 6);
      expect(indexPos[1]).toBeCloseTo(50, 6);
      expect(indexPos[2]).toBe(0);
    });

    it('round-trips canvas -> index -> canvas for an off-center point with resolution and rotation', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: 1,
      });
      const view = makeView({ resolution: 2, rotation: 0.4, center: [30, 70] });
      const canvasWidth = 300;
      const canvasHeight = 150;
      const originalCanvasPos = [220, 40];

      const indexPos = canvasToIndexForWSI({
        canvasPos: originalCanvasPos,
        canvasWidth,
        canvasHeight,
        view,
      });
      const roundTrippedCanvasPos = indexToCanvasForWSI({
        indexPos,
        canvasWidth,
        canvasHeight,
        view,
      });

      expect(roundTrippedCanvasPos[0]).toBeCloseTo(originalCanvasPos[0], 6);
      expect(roundTrippedCanvasPos[1]).toBeCloseTo(originalCanvasPos[1], 6);
    });

    it('maps index (view center) back to the canvas center regardless of rotation', () => {
      const view = makeView({
        resolution: 1.5,
        rotation: 1.1,
        center: [10, -5],
      });
      const canvasWidth = 400;
      const canvasHeight = 200;

      const canvasPos = indexToCanvasForWSI({
        indexPos: [10, -5, 0],
        canvasWidth,
        canvasHeight,
        view,
      });

      expect(canvasPos[0]).toBeCloseTo(canvasWidth / 2, 6);
      expect(canvasPos[1]).toBeCloseTo(canvasHeight / 2, 6);
    });

    it('scales index displacement inversely with resolution: doubling resolution halves canvas displacement', () => {
      const lowRes = makeView({ resolution: 1, center: [0, 0] });
      const highRes = makeView({ resolution: 2, center: [0, 0] });
      const canvasWidth = 200;
      const canvasHeight = 200;

      const lowResCanvasPos = indexToCanvasForWSI({
        indexPos: [50, 0, 0],
        canvasWidth,
        canvasHeight,
        view: lowRes,
      });
      const highResCanvasPos = indexToCanvasForWSI({
        indexPos: [50, 0, 0],
        canvasWidth,
        canvasHeight,
        view: highRes,
      });

      const lowResDisplacement = lowResCanvasPos[0] - canvasWidth / 2;
      const highResDisplacement = highResCanvasPos[0] - canvasWidth / 2;

      expect(highResDisplacement).toBeCloseTo(lowResDisplacement / 2, 6);
    });

    it('flips the y axis: increasing index-y decreases canvas-y', () => {
      const view = makeView({ resolution: 1, center: [0, 0] });
      const canvasWidth = 200;
      const canvasHeight = 200;

      const canvasPos = indexToCanvasForWSI({
        indexPos: [0, 10, 0],
        canvasWidth,
        canvasHeight,
        view,
      });

      expect(canvasPos[1]).toBeLessThan(canvasHeight / 2);
    });

    it('divides the whole transformed point by an explicit devicePixelRatio argument rather than window.devicePixelRatio', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: 3, // should be ignored because an explicit value is passed
      });
      const view = makeView({ resolution: 1, center: [0, 0] });
      const canvasWidth = 200;
      const canvasHeight = 200;

      const canvasPosDpr1 = indexToCanvasForWSI({
        indexPos: [20, 0, 0],
        canvasWidth,
        canvasHeight,
        view,
        devicePixelRatio: 1,
      });
      const canvasPosDpr2 = indexToCanvasForWSI({
        indexPos: [20, 0, 0],
        canvasWidth,
        canvasHeight,
        view,
        devicePixelRatio: 2,
      });

      // getWSICanvasTransform builds its translation from the raw canvasWidth/
      // canvasHeight (independent of devicePixelRatio); indexToCanvasForWSI then
      // divides the entire resulting point -- center offset included -- by
      // devicePixelRatio. So the whole point scales by 1/dpr, not just the
      // displacement from the canvas center.
      expect(canvasPosDpr2[0]).toBeCloseTo(canvasPosDpr1[0] / 2, 6);
      expect(canvasPosDpr2[1]).toBeCloseTo(canvasPosDpr1[1] / 2, 6);
    });
  });
});
