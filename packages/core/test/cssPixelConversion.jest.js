import {
  cssToDevicePixels,
  deviceToCssPixels,
} from '../src/RenderingEngine/helpers/cpuFallback/rendering/cssPixelConversion';

describe('cssPixelConversion', () => {
  const originalDevicePixelRatio = window.devicePixelRatio;

  function setDevicePixelRatio(value) {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value,
      writable: true,
    });
  }

  afterEach(() => {
    setDevicePixelRatio(originalDevicePixelRatio);
  });

  describe('at devicePixelRatio 1', () => {
    // The bug this guards against is invisible at DPR 1, so this case exists
    // to prove the conversion is a no-op there and cannot regress the
    // overwhelmingly common desktop configuration.
    beforeEach(() => setDevicePixelRatio(1));

    it('leaves device pixels unchanged', () => {
      expect(deviceToCssPixels([120, 240])).toEqual([120, 240]);
    });

    it('leaves CSS pixels unchanged', () => {
      expect(cssToDevicePixels([120, 240])).toEqual([120, 240]);
    });
  });

  describe('at a fractional devicePixelRatio', () => {
    beforeEach(() => setDevicePixelRatio(1.5));

    it('scales device pixels down to CSS pixels', () => {
      expect(deviceToCssPixels([150, 300])).toEqual([100, 200]);
    });

    it('scales CSS pixels up to device pixels', () => {
      expect(cssToDevicePixels([100, 200])).toEqual([150, 300]);
    });
  });

  describe('at an integer devicePixelRatio', () => {
    beforeEach(() => setDevicePixelRatio(2));

    it('scales device pixels down to CSS pixels', () => {
      expect(deviceToCssPixels([200, 100])).toEqual([100, 50]);
    });

    it('scales CSS pixels up to device pixels', () => {
      expect(cssToDevicePixels([100, 50])).toEqual([200, 100]);
    });
  });

  it('round-trips a point at any ratio', () => {
    [1, 1.25, 1.5, 2, 3].forEach((ratio) => {
      setDevicePixelRatio(ratio);

      const point = [137, 42];
      const [x, y] = deviceToCssPixels(cssToDevicePixels(point));

      expect(x).toBeCloseTo(point[0], 10);
      expect(y).toBeCloseTo(point[1], 10);
    });
  });

  it('treats a missing devicePixelRatio as 1', () => {
    setDevicePixelRatio(undefined);

    expect(deviceToCssPixels([120, 240])).toEqual([120, 240]);
    expect(cssToDevicePixels([120, 240])).toEqual([120, 240]);
  });
});
