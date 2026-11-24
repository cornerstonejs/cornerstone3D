import {
  getViewportContentMode,
  viewportIsInVolumeMode,
  viewportIsInStackMode,
  viewportSupportsWaveform,
} from '../src/utilities/viewportCapabilities';

const noop = () => undefined;

const viewportWithDisplaySets = {
  setDisplaySets: noop,
  addDisplaySet: noop,
  setDisplaySetAppearance: noop,
  setViewState: noop,
  getViewState: noop,
};

const legacyStackViewport = {
  setStack: noop,
  setProperties: noop,
  getCamera: noop,
  getImageData: noop,
};

const waveformViewport = {
  getWaveformData: noop,
  getImageData: noop,
};

const stackModeViewport = {
  ...viewportWithDisplaySets,
  getCurrentMode: () => 'stack',
};
const volumeModeViewport = {
  ...viewportWithDisplaySets,
  getCurrentMode: () => 'volume',
};
const volume3dModeViewport = {
  ...viewportWithDisplaySets,
  getCurrentMode: () => 'volume3d',
};
const ecgModeViewport = {
  ...viewportWithDisplaySets,
  getCurrentMode: () => 'ecg',
};
const emptyModeViewport = {
  ...viewportWithDisplaySets,
  getCurrentMode: () => 'empty',
};

describe('viewportCapabilities — Generic ("next") viewport guards (CS-5/CS-17)', () => {
  describe('getViewportContentMode', () => {
    it('returns the content-true mode when the viewport can classify it', () => {
      expect(getViewportContentMode(stackModeViewport)).toBe('stack');
      expect(getViewportContentMode(volumeModeViewport)).toBe('volume');
      expect(getViewportContentMode(ecgModeViewport)).toBe('ecg');
      expect(getViewportContentMode(emptyModeViewport)).toBe('empty');
    });

    it('returns undefined when the viewport cannot classify its content', () => {
      expect(getViewportContentMode(legacyStackViewport)).toBeUndefined();
      expect(getViewportContentMode(viewportWithDisplaySets)).toBeUndefined();
    });

    it('gives no mode for a legacy type string without getCurrentMode', () => {
      [
        'stack',
        'orthographic',
        'perspective',
        'volume3d',
        'video',
        'wholeSlide',
        'ecg',
      ].forEach((type) => {
        expect(
          getViewportContentMode({ ...legacyStackViewport, type })
        ).toBeUndefined();
      });
    });

    it('does not give a mode for a next or unknown type without getCurrentMode', () => {
      ['planar', 'volume3d', 'video', 'custom', 'toString'].forEach((type) => {
        expect(
          getViewportContentMode({ ...viewportWithDisplaySets, type })
        ).toBeUndefined();
      });
      expect(getViewportContentMode({ type: 42 })).toBeUndefined();
      expect(getViewportContentMode(null)).toBeUndefined();
    });

    it('lets getCurrentMode win over the type', () => {
      const legacyEcg = { type: 'ecg', getCurrentMode: () => 'empty' };
      const adapter = {
        ...viewportWithDisplaySets,
        type: 'planar',
        getCurrentMode: () => 'stack',
      };
      const emptyAdapter = {
        ...viewportWithDisplaySets,
        type: 'planar',
        getCurrentMode: () => 'empty',
      };
      const nextViewport = {
        ...viewportWithDisplaySets,
        type: 'planar',
        getCurrentMode: () => 'volume',
      };

      expect(getViewportContentMode(legacyEcg)).toBe('empty');
      expect(getViewportContentMode(adapter)).toBe('stack');
      expect(getViewportContentMode(emptyAdapter)).toBe('empty');
      expect(getViewportContentMode(nextViewport)).toBe('volume');
    });
  });

  describe('viewportIsInVolumeMode / viewportIsInStackMode', () => {
    it('treats volume and volume3d as volume mode', () => {
      expect(viewportIsInVolumeMode(volumeModeViewport)).toBe(true);
      expect(viewportIsInVolumeMode(volume3dModeViewport)).toBe(true);
      expect(viewportIsInVolumeMode(stackModeViewport)).toBe(false);
      expect(viewportIsInVolumeMode(ecgModeViewport)).toBe(false);
    });

    it('reports stack mode only for stack content', () => {
      expect(viewportIsInStackMode(stackModeViewport)).toBe(true);
      expect(viewportIsInStackMode(volumeModeViewport)).toBe(false);
      expect(viewportIsInStackMode(ecgModeViewport)).toBe(false);
    });

    it('is false when content mode is unknown', () => {
      expect(viewportIsInVolumeMode(legacyStackViewport)).toBe(false);
      expect(viewportIsInStackMode(legacyStackViewport)).toBe(false);
    });
  });

  describe('viewportSupportsWaveform', () => {
    it('returns true when the viewport exposes getWaveformData and getImageData', () => {
      expect(viewportSupportsWaveform(waveformViewport)).toBe(true);
    });

    it('returns false when getWaveformData or getImageData is missing', () => {
      expect(viewportSupportsWaveform({ getWaveformData: noop })).toBe(false);
      expect(viewportSupportsWaveform({ getImageData: noop })).toBe(false);
      expect(viewportSupportsWaveform(viewportWithDisplaySets)).toBe(false);
      expect(viewportSupportsWaveform(legacyStackViewport)).toBe(false);
    });

    it('returns false for null, undefined, and non-objects', () => {
      expect(viewportSupportsWaveform(null)).toBe(false);
      expect(viewportSupportsWaveform(undefined)).toBe(false);
      expect(viewportSupportsWaveform('not-a-viewport')).toBe(false);
    });
  });
});
