jest.mock('../src/init', () => ({
  ...jest.requireActual('../src/init'),
  isCornerstoneInitialized: () => true,
  getShouldUseCPURendering: () => true,
}));

import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import {
  getViewportClassForInput,
  isRegisteredViewportType,
} from '../src/RenderingEngine/helpers/viewportTypeToViewportClass';
import ViewportType from '../src/enums/ViewportType';
import ViewportTypes from '../src/enums/ViewportTypes';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import VolumeViewport3D from '../src/RenderingEngine/GenericViewport/Volume3D/viewport3D';
import VideoViewport from '../src/RenderingEngine/GenericViewport/Video/VideoViewport';
import WSIViewport from '../src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';

/**
 * The three viewport type strings that 6.0 removed, each with the message
 * that names what an application uses instead.
 */
const removedTypes = [
  [
    'stack',
    "ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR_NEXT (a planar viewport shows a stack or a volume)",
  ],
  [
    'orthographic',
    "ViewportType 'orthographic' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR_NEXT with an orientation in defaultOptions, for example OrientationAxis.AXIAL (a planar viewport shows a stack or a volume)",
  ],
  [
    'perspective',
    "ViewportType 'perspective' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D_NEXT with parallelProjection: false in defaultOptions",
  ],
];

describe('the viewport type registry', () => {
  it('gives the next class of each next type string', () => {
    expect(getViewportClassForInput({ type: 'planarNext' })).toBe(
      PlanarViewport
    );
    expect(getViewportClassForInput({ type: 'volume3dNext' })).toBe(
      VolumeViewport3D
    );
    expect(getViewportClassForInput({ type: 'videoNext' })).toBe(VideoViewport);
    expect(getViewportClassForInput({ type: 'wholeSlideNext' })).toBe(
      WSIViewport
    );
    expect(getViewportClassForInput({ type: 'ecgNext' })).toBe(ECGViewport);
  });

  it('gives the next 3D, video, whole slide and ECG viewports for their plain strings', () => {
    expect(getViewportClassForInput({ type: ViewportType.VOLUME_3D })).toBe(
      VolumeViewport3D
    );
    expect(getViewportClassForInput({ type: ViewportType.VIDEO })).toBe(
      VideoViewport
    );
    expect(getViewportClassForInput({ type: ViewportType.WHOLE_SLIDE })).toBe(
      WSIViewport
    );
    expect(getViewportClassForInput({ type: ViewportType.ECG })).toBe(
      ECGViewport
    );
    ['volume3d', 'video', 'wholeSlide', 'ecg'].forEach((type) => {
      expect(isRegisteredViewportType(type)).toBe(true);
    });
  });

  it('has no stack, orthographic or perspective type, and names the replacement', () => {
    removedTypes.forEach(([type, message]) => {
      expect(isRegisteredViewportType(type)).toBe(false);
      expect(() => getViewportClassForInput({ type })).toThrow(
        new Error(message)
      );
    });
    ['STACK', 'ORTHOGRAPHIC', 'PERSPECTIVE'].forEach((name) => {
      expect(ViewportType[name]).toBeUndefined();
      expect(ViewportTypes[name]).toBeUndefined();
    });
  });
});

describe('a rendering engine asked for a removed viewport type', () => {
  let engine;

  beforeEach(() => {
    engine = new ContextPoolRenderingEngine('removedViewportTypes');
  });

  afterEach(() => {
    engine.destroy();
  });

  removedTypes.forEach(([type, message]) => {
    it(`throws at enableElement for '${type}', with the type to use instead`, () => {
      const element = document.createElement('div');

      expect(() =>
        engine.enableElement({ viewportId: 'removed', type, element })
      ).toThrow(new Error(message));
      expect(engine.getViewports()).toEqual([]);
    });

    it(`throws at setViewports for '${type}' before it changes anything`, () => {
      const reset = jest.spyOn(engine, '_reset');

      expect(() =>
        engine.setViewports([
          {
            viewportId: 'planar',
            type: ViewportType.PLANAR_NEXT,
            element: document.createElement('div'),
          },
          {
            viewportId: 'removed',
            type,
            element: document.createElement('div'),
          },
        ])
      ).toThrow(new Error(message));
      expect(reset).not.toHaveBeenCalled();
      expect(engine.getViewports()).toEqual([]);
    });
  });
});
