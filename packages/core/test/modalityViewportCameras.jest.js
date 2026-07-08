import {
  createDefaultVideoViewState,
  normalizeVideoViewState,
  resolveVideoCanvasMapping,
  getPanForVideoCanvasMapping,
  getAnchorWorldForPan as getAnchorWorldForVideoPan,
} from '../src/RenderingEngine/GenericViewport/Video/videoViewportCamera';
import {
  createDefaultECGViewState,
  normalizeECGViewState,
  resolveECGCanvasMapping,
  getPanForECGCanvasMapping,
  getAnchorWorldForPan as getAnchorWorldForECGPan,
  getAnchorWorldForCanvasPoint,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgViewportCamera';
import {
  cloneVolume3DCamera,
  getVolume3DProjectionScale,
  getVolume3DProjectionPosition,
} from '../src/RenderingEngine/GenericViewport/Volume3D/volume3DProjectionCamera';

describe('videoViewportCamera', () => {
  describe('createDefaultVideoViewState', () => {
    it('returns the canonical default state', () => {
      expect(createDefaultVideoViewState()).toEqual({
        currentTimeSeconds: 0,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });
    });
  });

  describe('normalizeVideoViewState', () => {
    it('clamps negative currentTimeSeconds to zero', () => {
      const result = normalizeVideoViewState({
        currentTimeSeconds: -5,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.currentTimeSeconds).toBe(0);
    });

    it('leaves currentTimeSeconds untouched when omitted', () => {
      const result = normalizeVideoViewState({
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.currentTimeSeconds).toBeUndefined();
    });

    it('clamps scale to the 0.001 floor', () => {
      const result = normalizeVideoViewState({
        currentTimeSeconds: 1,
        anchorCanvas: [0.5, 0.5],
        scale: 0,
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.scale).toBe(0.001);
    });

    it('defaults scale to 1 when scale is undefined', () => {
      const result = normalizeVideoViewState({
        currentTimeSeconds: 1,
        anchorCanvas: [0.5, 0.5],
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.scale).toBe(1);
    });

    it('defaults anchorCanvas and rotation when missing, and forces scaleMode to fit', () => {
      const result = normalizeVideoViewState({
        currentTimeSeconds: 1,
        scale: 2,
        scaleMode: 'absolute',
        rotation: undefined,
      });

      expect(result.anchorCanvas).toEqual([0.5, 0.5]);
      expect(result.rotation).toBe(0);
      expect(result.scaleMode).toBe('fit');
    });

    it('clones anchorCanvas rather than aliasing the input array', () => {
      const anchorCanvas = [0.25, 0.75];
      const result = normalizeVideoViewState({
        currentTimeSeconds: 0,
        anchorCanvas,
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.anchorCanvas).toEqual(anchorCanvas);
      expect(result.anchorCanvas).not.toBe(anchorCanvas);
    });

    it('omits anchorWorld when not provided on the input camera', () => {
      const result = normalizeVideoViewState({
        currentTimeSeconds: 0,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });

      expect(result.anchorWorld).toBeUndefined();
    });

    it('clones anchorWorld when provided, rather than aliasing it', () => {
      const anchorWorld = [12, 34];
      const result = normalizeVideoViewState({
        currentTimeSeconds: 0,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
        anchorWorld,
      });

      expect(result.anchorWorld).toEqual(anchorWorld);
      expect(result.anchorWorld).not.toBe(anchorWorld);
    });
  });

  describe('resolveVideoCanvasMapping', () => {
    it('returns undefined when any dimension is zero or missing', () => {
      expect(
        resolveVideoCanvasMapping({
          containerWidth: 0,
          containerHeight: 100,
          intrinsicWidth: 100,
          intrinsicHeight: 100,
        })
      ).toBeUndefined();
      expect(
        resolveVideoCanvasMapping({
          containerWidth: 100,
          containerHeight: 100,
          intrinsicWidth: 100,
          intrinsicHeight: 0,
        })
      ).toBeUndefined();
    });

    it('letterboxes a wide 1920x1080 video into a 512x512 square canvas (contain/fit)', () => {
      // containScale = min(512/1920, 512/1080) = min(0.26667, 0.474) = 0.26667
      // width = 1920 * 0.26667 = 512, height = 1080 * 0.26667 = 288
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
      });

      expect(mapping.width).toBeCloseTo(512, 5);
      expect(mapping.height).toBeCloseTo(288, 5);
      // default anchorCanvas [0.5,0.5] with default anchorWorld = intrinsic center
      // worldToCanvasRatio = 512 / 1920 = 0.26667
      expect(mapping.worldToCanvasRatio).toBeCloseTo(512 / 1920, 5);
      // left = 512*0.5 - (1920/2)*ratio = 256 - 256 = 0
      expect(mapping.left).toBeCloseTo(0, 5);
      // top = 512*0.5 - (1080/2)*ratio = 256 - 144 = 112 (letterbox band)
      expect(mapping.top).toBeCloseTo(112, 5);
    });

    it('crops (cover) the same video to fill the square canvas with no letterboxing', () => {
      // coverScale = max(512/1920, 512/1080) = 512/1080 = 0.474
      // width = 1920 * 0.474 = 910.2, height = 1080*0.474 = 512
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'cover',
      });

      expect(mapping.height).toBeCloseTo(512, 5);
      expect(mapping.width).toBeCloseTo((512 / 1080) * 1920, 5);
      // top offset should be 0 (height matches container exactly)
      expect(mapping.top).toBeCloseTo(0, 5);
      // left should be negative (cropped left/right)
      expect(mapping.left).toBeLessThan(0);
    });

    it('fills the canvas exactly regardless of aspect ratio for objectFit "fill"', () => {
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'fill',
      });

      expect(mapping.width).toBeCloseTo(512, 5);
      expect(mapping.height).toBeCloseTo(512, 5);
    });

    it('uses intrinsic size unscaled for objectFit "none"', () => {
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'none',
      });

      expect(mapping.width).toBeCloseTo(1920, 5);
      expect(mapping.height).toBeCloseTo(1080, 5);
    });

    it('scale-down behaves like contain when intrinsic is larger than container', () => {
      const scaleDown = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'scale-down',
      });
      const contain = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
      });

      expect(scaleDown.width).toBeCloseTo(contain.width, 5);
      expect(scaleDown.height).toBeCloseTo(contain.height, 5);
    });

    it('scale-down behaves like "none" when intrinsic is smaller than container', () => {
      // containScale = min(512/100, 512/50) = 5.12 > 1, so scaleDown clamps to 1
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 100,
        intrinsicHeight: 50,
        objectFit: 'scale-down',
      });

      expect(mapping.width).toBeCloseTo(100, 5);
      expect(mapping.height).toBeCloseTo(50, 5);
    });

    it('applies camera.scale as an additional zoom multiplier on top of objectFit', () => {
      const unzoomed = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
      });
      const zoomed = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
        camera: {
          anchorCanvas: [0.5, 0.5],
          scale: 2,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(zoomed.width).toBeCloseTo(unzoomed.width * 2, 5);
      expect(zoomed.height).toBeCloseTo(unzoomed.height * 2, 5);
    });

    it('floors camera.scale at 0.001 to avoid a zero-size mapping', () => {
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        camera: {
          anchorCanvas: [0.5, 0.5],
          scale: -10,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(mapping.width).toBeGreaterThan(0);
      expect(mapping.height).toBeGreaterThan(0);
    });

    it('uses camera.anchorWorld when provided instead of the intrinsic center', () => {
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
        camera: {
          anchorCanvas: [0.5, 0.5],
          anchorWorld: [0, 0],
          scale: 1,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(mapping.anchorWorld).toEqual([0, 0]);
      // left = 512*0.5 - 0*ratio = 256
      expect(mapping.left).toBeCloseTo(256, 5);
      expect(mapping.top).toBeCloseTo(256, 5);
    });
  });

  describe('getPanForVideoCanvasMapping / getAnchorWorldForPan round trip', () => {
    it('round-trips pan -> anchorWorld -> mapping -> pan for an off-center anchor', () => {
      const mapping = resolveVideoCanvasMapping({
        containerWidth: 512,
        containerHeight: 512,
        intrinsicWidth: 1920,
        intrinsicHeight: 1080,
        objectFit: 'contain',
        camera: {
          anchorCanvas: [0.5, 0.5],
          anchorWorld: [960, 540],
          scale: 1,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      const pan = getPanForVideoCanvasMapping(mapping);
      const recoveredAnchorWorld = getAnchorWorldForVideoPan(pan, mapping);

      expect(recoveredAnchorWorld[0]).toBeCloseTo(mapping.anchorWorld[0], 5);
      expect(recoveredAnchorWorld[1]).toBeCloseTo(mapping.anchorWorld[1], 5);
    });

    it('keeps the anchor canvas point stationary when zooming about that anchor', () => {
      // Simulate a zoom-about-anchor: set anchorWorld to the world point under a
      // fixed canvas point, then re-resolve mapping at a different scale; the
      // canvas position of that world point should not move.
      const containerWidth = 512;
      const containerHeight = 512;
      const intrinsicWidth = 1920;
      const intrinsicHeight = 1080;
      const anchorCanvasPoint = [300, 200];

      const initialMapping = resolveVideoCanvasMapping({
        containerWidth,
        containerHeight,
        intrinsicWidth,
        intrinsicHeight,
        objectFit: 'contain',
        camera: {
          anchorCanvas: [0.5, 0.5],
          scale: 1,
          scaleMode: 'fit',
          rotation: 0,
        },
      });
      const anchorWorld = [
        (anchorCanvasPoint[0] - initialMapping.left) /
          initialMapping.worldToCanvasRatio,
        (anchorCanvasPoint[1] - initialMapping.top) /
          initialMapping.worldToCanvasRatio,
      ];

      const zoomedMapping = resolveVideoCanvasMapping({
        containerWidth,
        containerHeight,
        intrinsicWidth,
        intrinsicHeight,
        objectFit: 'contain',
        camera: {
          anchorCanvas: [
            anchorCanvasPoint[0] / containerWidth,
            anchorCanvasPoint[1] / containerHeight,
          ],
          anchorWorld,
          scale: 3,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      const canvasX =
        zoomedMapping.left + anchorWorld[0] * zoomedMapping.worldToCanvasRatio;
      const canvasY =
        zoomedMapping.top + anchorWorld[1] * zoomedMapping.worldToCanvasRatio;

      expect(canvasX).toBeCloseTo(anchorCanvasPoint[0], 5);
      expect(canvasY).toBeCloseTo(anchorCanvasPoint[1], 5);
    });
  });
});

describe('ecgViewportCamera', () => {
  const timeRange = [0, 2000];
  const valueRange = [-1, 1];

  describe('createDefaultECGViewState', () => {
    it('builds the default state from the supplied ranges, cloning the input arrays', () => {
      const result = createDefaultECGViewState({ timeRange, valueRange });

      expect(result).toEqual({
        timeRange: [0, 2000],
        valueRange: [-1, 1],
        scrollOffset: 0,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
      });
      expect(result.timeRange).not.toBe(timeRange);
      expect(result.valueRange).not.toBe(valueRange);
    });
  });

  describe('normalizeECGViewState', () => {
    function baseCamera(overrides = {}) {
      return {
        timeRange: [0, 2000],
        valueRange: [-1, 1],
        scrollOffset: 0,
        anchorCanvas: [0.5, 0.5],
        scale: 1,
        scaleMode: 'fit',
        rotation: 0,
        ...overrides,
      };
    }

    it('clones timeRange and valueRange rather than aliasing them', () => {
      const camera = baseCamera();
      const result = normalizeECGViewState(camera);

      expect(result.timeRange).toEqual(camera.timeRange);
      expect(result.timeRange).not.toBe(camera.timeRange);
      expect(result.valueRange).toEqual(camera.valueRange);
      expect(result.valueRange).not.toBe(camera.valueRange);
    });

    it('preserves scrollOffset when defined, including zero', () => {
      const result = normalizeECGViewState(baseCamera({ scrollOffset: 0 }));
      expect(result.scrollOffset).toBe(0);

      const result2 = normalizeECGViewState(baseCamera({ scrollOffset: 42 }));
      expect(result2.scrollOffset).toBe(42);
    });

    it('omits scrollOffset when undefined on the input', () => {
      const camera = baseCamera();
      delete camera.scrollOffset;

      const result = normalizeECGViewState(camera);

      expect(result.scrollOffset).toBeUndefined();
    });

    it('clamps scale to the 0.001 floor and forces scaleMode to fit / rotation to 0', () => {
      const result = normalizeECGViewState(
        baseCamera({ scale: 0, scaleMode: 'absolute', rotation: 45 })
      );

      expect(result.scale).toBe(0.001);
      expect(result.scaleMode).toBe('fit');
      expect(result.rotation).toBe(0);
    });

    it('defaults anchorCanvas when missing', () => {
      const camera = baseCamera();
      delete camera.anchorCanvas;

      const result = normalizeECGViewState(camera);

      expect(result.anchorCanvas).toEqual([0.5, 0.5]);
    });

    it('omits anchorWorld when absent, and clones it when present', () => {
      const withoutAnchor = normalizeECGViewState(baseCamera());
      expect(withoutAnchor.anchorWorld).toBeUndefined();

      const anchorWorld = [10, 20];
      const withAnchor = normalizeECGViewState(baseCamera({ anchorWorld }));
      expect(withAnchor.anchorWorld).toEqual(anchorWorld);
      expect(withAnchor.anchorWorld).not.toBe(anchorWorld);
    });
  });

  describe('resolveECGCanvasMapping', () => {
    function makeCanvas(clientWidth, clientHeight) {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', {
        configurable: true,
        value: clientWidth,
      });
      Object.defineProperty(canvas, 'clientHeight', {
        configurable: true,
        value: clientHeight,
      });
      return canvas;
    }

    const metrics = {
      ecgWidth: 2000,
      ecgHeight: 400,
      channelScale: 10,
      worldToCanvasRatio: 0.1,
      xOffsetCanvas: 0,
      yOffsetCanvas: 0,
    };

    it('centers the signal in the canvas when no camera pan/zoom is supplied', () => {
      // drawWidth = 2000*0.1 = 200, drawHeight = 400*0.1 = 40
      // canvas is 300x100 -> centeredXOffset = (300-200)/2 = 50
      // centeredYOffset = (100-40)/2 = 30
      const canvas = makeCanvas(300, 100);
      const mapping = resolveECGCanvasMapping({ metrics, canvas });

      expect(mapping.centeredXOffset).toBeCloseTo(50, 5);
      expect(mapping.centeredYOffset).toBeCloseTo(30, 5);
      expect(mapping.effectiveRatio).toBeCloseTo(0.1, 5);
      // default anchorWorld = ecg center [1000, 200]; anchorCanvas [0.5,0.5]
      // xOffset = 300*0.5 - 1000*0.1 = 150 - 100 = 50 (matches centeredXOffset)
      expect(mapping.xOffset).toBeCloseTo(50, 5);
      expect(mapping.yOffset).toBeCloseTo(30, 5);
    });

    it('scales effectiveRatio by camera.scale and floors it at 0.001', () => {
      const canvas = makeCanvas(300, 100);
      const zoomed = resolveECGCanvasMapping({
        metrics,
        canvas,
        camera: {
          timeRange,
          valueRange,
          anchorCanvas: [0.5, 0.5],
          scale: 2,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(zoomed.effectiveRatio).toBeCloseTo(0.2, 5);

      const negativeScale = resolveECGCanvasMapping({
        metrics,
        canvas,
        camera: {
          timeRange,
          valueRange,
          anchorCanvas: [0.5, 0.5],
          scale: -5,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(negativeScale.effectiveRatio).toBeCloseTo(0.1 * 0.001, 8);
    });

    it('uses camera.anchorWorld to offset the mapping away from center', () => {
      const canvas = makeCanvas(300, 100);
      const mapping = resolveECGCanvasMapping({
        metrics,
        canvas,
        camera: {
          timeRange,
          valueRange,
          anchorCanvas: [0.5, 0.5],
          anchorWorld: [0, 0],
          scale: 1,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      expect(mapping.anchorWorld).toEqual([0, 0]);
      // xOffset = 300*0.5 - 0*0.1 = 150
      expect(mapping.xOffset).toBeCloseTo(150, 5);
      expect(mapping.yOffset).toBeCloseTo(50, 5);
    });
  });

  describe('getPanForECGCanvasMapping / getAnchorWorldForPan round trip', () => {
    it('reports zero pan for the centered default mapping', () => {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(canvas, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      const metrics = {
        ecgWidth: 2000,
        ecgHeight: 400,
        channelScale: 10,
        worldToCanvasRatio: 0.1,
        xOffsetCanvas: 0,
        yOffsetCanvas: 0,
      };
      const mapping = resolveECGCanvasMapping({ metrics, canvas });
      const pan = getPanForECGCanvasMapping(mapping);

      expect(pan[0]).toBeCloseTo(0, 5);
      expect(pan[1]).toBeCloseTo(0, 5);
    });

    it('round-trips pan -> anchorWorld -> mapping -> pan for a non-trivial anchor', () => {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(canvas, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      const metrics = {
        ecgWidth: 2000,
        ecgHeight: 400,
        channelScale: 10,
        worldToCanvasRatio: 0.1,
        xOffsetCanvas: 0,
        yOffsetCanvas: 0,
      };
      const mapping = resolveECGCanvasMapping({
        metrics,
        canvas,
        camera: {
          timeRange,
          valueRange,
          anchorCanvas: [0.5, 0.5],
          anchorWorld: [500, -0.3],
          scale: 1.5,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      const pan = getPanForECGCanvasMapping(mapping);
      const recoveredAnchorWorld = getAnchorWorldForECGPan(pan, mapping);

      expect(recoveredAnchorWorld[0]).toBeCloseTo(mapping.anchorWorld[0], 5);
      expect(recoveredAnchorWorld[1]).toBeCloseTo(mapping.anchorWorld[1], 5);
    });
  });

  describe('getAnchorWorldForCanvasPoint', () => {
    it('inverts the canvas-space offset back into signal-space (sample index, amplitude)', () => {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(canvas, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      const metrics = {
        ecgWidth: 2000,
        ecgHeight: 400,
        channelScale: 10,
        worldToCanvasRatio: 0.1,
        xOffsetCanvas: 0,
        yOffsetCanvas: 0,
      };
      const mapping = resolveECGCanvasMapping({ metrics, canvas });

      // canvas point at (xOffset + 100*ratio, yOffset + 20*ratio) should map back
      // to signal coordinate [100, 20]
      const canvasPoint = [
        mapping.xOffset + 100 * mapping.effectiveRatio,
        mapping.yOffset + 20 * mapping.effectiveRatio,
      ];
      const anchorWorld = getAnchorWorldForCanvasPoint(canvasPoint, mapping);

      expect(anchorWorld[0]).toBeCloseTo(100, 5);
      expect(anchorWorld[1]).toBeCloseTo(20, 5);
    });

    it('is the inverse of the forward canvas transform used by ECGResolvedView.worldToCanvas', () => {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'clientWidth', {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(canvas, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      const metrics = {
        ecgWidth: 2000,
        ecgHeight: 400,
        channelScale: 10,
        worldToCanvasRatio: 0.1,
        xOffsetCanvas: 0,
        yOffsetCanvas: 0,
      };
      const mapping = resolveECGCanvasMapping({
        metrics,
        canvas,
        camera: {
          timeRange,
          valueRange,
          anchorCanvas: [0.5, 0.5],
          scale: 2,
          scaleMode: 'fit',
          rotation: 0,
        },
      });

      const originalCanvasPoint = [123, 45];
      const anchorWorld = getAnchorWorldForCanvasPoint(
        originalCanvasPoint,
        mapping
      );
      // Forward transform (mirrors resolveECGCanvasMapping's own xOffset/yOffset
      // derivation): canvas = world*effectiveRatio + offset, but offset here is
      // computed from mapping.xOffset/yOffset directly since anchorWorld
      // corresponds to this exact mapping's xOffset/yOffset origin.
      const reprojectedX =
        anchorWorld[0] * mapping.effectiveRatio + mapping.xOffset;
      const reprojectedY =
        anchorWorld[1] * mapping.effectiveRatio + mapping.yOffset;

      expect(reprojectedX).toBeCloseTo(originalCanvasPoint[0], 5);
      expect(reprojectedY).toBeCloseTo(originalCanvasPoint[1], 5);
    });
  });
});

describe('volume3DProjectionCamera', () => {
  function makeCamera(overrides = {}) {
    return {
      clippingRange: [0.1, 1000],
      focalPoint: [1, 2, 3],
      position: [1, 2, 103],
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
      parallelProjection: true,
      parallelScale: 50,
      ...overrides,
    };
  }

  describe('cloneVolume3DCamera', () => {
    it('deep-clones point arrays so mutating the clone does not affect the source', () => {
      const camera = makeCamera();
      const clone = cloneVolume3DCamera(camera);

      expect(clone).toEqual(camera);
      expect(clone.focalPoint).not.toBe(camera.focalPoint);
      expect(clone.position).not.toBe(camera.position);
      expect(clone.viewPlaneNormal).not.toBe(camera.viewPlaneNormal);
      expect(clone.viewUp).not.toBe(camera.viewUp);
      expect(clone.clippingRange).not.toBe(camera.clippingRange);

      clone.focalPoint[0] = 999;
      expect(camera.focalPoint[0]).toBe(1);
    });

    it('passes through undefined point fields as undefined rather than throwing', () => {
      const camera = makeCamera({
        clippingRange: undefined,
        focalPoint: undefined,
        position: undefined,
        viewPlaneNormal: undefined,
        viewUp: undefined,
      });
      const clone = cloneVolume3DCamera(camera);

      expect(clone.clippingRange).toBeUndefined();
      expect(clone.focalPoint).toBeUndefined();
      expect(clone.position).toBeUndefined();
      expect(clone.viewPlaneNormal).toBeUndefined();
      expect(clone.viewUp).toBeUndefined();
    });

    it('preserves non-point scalar fields via spread (e.g. parallelScale, parallelProjection)', () => {
      const camera = makeCamera({
        parallelScale: 77,
        parallelProjection: false,
      });
      const clone = cloneVolume3DCamera(camera);

      expect(clone.parallelScale).toBe(77);
      expect(clone.parallelProjection).toBe(false);
    });
  });

  describe('getVolume3DProjectionScale', () => {
    it('reports physical mm-per-canvas-pixel from parallelScale and canvasHeight', () => {
      // mmPerCanvasPixel = (parallelScale*2) / canvasHeight = (50*2)/200 = 0.5
      const result = getVolume3DProjectionScale({
        camera: makeCamera({ parallelScale: 50 }),
        canvasHeight: 200,
      });

      expect(result).toEqual({ kind: 'physical', mmPerCanvasPixel: 0.5 });
    });

    it('returns undefined when parallelScale is not a number', () => {
      const result = getVolume3DProjectionScale({
        camera: makeCamera({ parallelScale: undefined }),
        canvasHeight: 200,
      });

      expect(result).toBeUndefined();
    });

    it('clamps the divisor at 1 canvas pixel to avoid divide-by-zero for a zero/negative canvasHeight', () => {
      const result = getVolume3DProjectionScale({
        camera: makeCamera({ parallelScale: 10 }),
        canvasHeight: 0,
      });

      // mmPerCanvasPixel = (10*2)/max(0,1) = 20
      expect(result).toEqual({ kind: 'physical', mmPerCanvasPixel: 20 });
    });
  });

  describe('getVolume3DProjectionPosition', () => {
    it('reports a focalPoint position, cloning the point array', () => {
      const camera = makeCamera({ focalPoint: [4, 5, 6] });
      const result = getVolume3DProjectionPosition(camera);

      expect(result).toEqual({ kind: 'focalPoint', worldPoint: [4, 5, 6] });
      expect(result.worldPoint).not.toBe(camera.focalPoint);
    });

    it('returns undefined when the camera has no focalPoint', () => {
      const camera = makeCamera({ focalPoint: undefined });
      const result = getVolume3DProjectionPosition(camera);

      expect(result).toBeUndefined();
    });
  });
});
