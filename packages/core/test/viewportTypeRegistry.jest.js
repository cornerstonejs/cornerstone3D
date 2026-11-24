jest.mock('../src/init', () => ({
  ...jest.requireActual('../src/init'),
  isCornerstoneInitialized: () => true,
  isWebGLUnavailable: () => true,
}));

import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import {
  getViewportClassForInput,
  isRegisteredViewportType,
} from '../src/RenderingEngine/helpers/viewportTypeToViewportClass';
import ViewportType from '../src/enums/ViewportType';
import ViewportTypes from '../src/enums/ViewportTypes';
import PlanarViewport from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import VolumeViewport3D from '../src/RenderingEngine/Viewports/Volume3D/viewport3D';
import VideoViewport from '../src/RenderingEngine/Viewports/Video/VideoViewport';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import BaseViewport from '../src/RenderingEngine/Viewports/BaseViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import * as renderingEngineModule from '../src/RenderingEngine';
import * as core from '../src/index';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

/**
 * The three viewport type strings that 6.0 removed, each with the message
 * that names what an application uses instead.
 */
const removedTypes = [
  [
    'stack',
    "ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR (a planar viewport shows a stack or a volume)",
  ],
  [
    'orthographic',
    "ViewportType 'orthographic' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR with an orientation in defaultOptions, for example OrientationAxis.AXIAL (a planar viewport shows a stack or a volume)",
  ],
  [
    'perspective',
    "ViewportType 'perspective' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D with parallelProjection: false in defaultOptions",
  ],
];

/**
 * Each family: its plain enum name and string, its removed `_NEXT` enum
 * name, its removed 5.x string (the prefix of its made-up frame of
 * reference), and its class.
 */
const families = [
  ['PLANAR', 'planar', 'PLANAR_NEXT', 'planarNext', PlanarViewport],
  ['VOLUME_3D', 'volume3d', 'VOLUME_3D_NEXT', 'volume3dNext', VolumeViewport3D],
  ['VIDEO', 'video', 'VIDEO_NEXT', 'videoNext', VideoViewport],
  [
    'WHOLE_SLIDE',
    'wholeSlide',
    'WHOLE_SLIDE_NEXT',
    'wholeSlideNext',
    WSIViewport,
  ],
  ['ECG', 'ecg', 'ECG_NEXT', 'ecgNext', ECGViewport],
];

describe('the viewport type registry', () => {
  it('has no 5.x next type string, and names the plain type', () => {
    families.forEach(([name, type, , nextType]) => {
      expect(isRegisteredViewportType(nextType)).toBe(false);
      expect(() => getViewportClassForInput({ type: nextType })).toThrow(
        new Error(
          `ViewportType '${nextType}' was removed in Cornerstone3D 6.0: use ViewportType.${name} ('${type}')`
        )
      );
    });
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

describe('the plain viewport type names', () => {
  it('give each type its plain string, and have no _NEXT name', () => {
    families.forEach(([name, type, nextName]) => {
      expect(ViewportType[name]).toBe(type);
      expect(ViewportTypes[name]).toBe(type);
      expect(ViewportType[nextName]).toBeUndefined();
      expect(ViewportTypes[nextName]).toBeUndefined();
    });
  });

  it('give the class of each family for the plain string', () => {
    families.forEach(([name, type, , , ViewportClass]) => {
      expect(isRegisteredViewportType(type)).toBe(true);
      expect(getViewportClassForInput({ type })).toBe(ViewportClass);
      expect(getViewportClassForInput({ type: ViewportTypes[name] })).toBe(
        ViewportClass
      );
    });
  });
});

/**
 * Makes an empty viewport of a family without WebGL: a planar viewport on a
 * stand-in rendering engine, a 3D viewport on a stand-in engine with a
 * stand-in renderer, the others on their own. Gives the viewport and a
 * function that destroys it.
 */
function makeEmptyViewport(ViewportClass, id) {
  const element = document.createElement('div');

  if (ViewportClass === PlanarViewport) {
    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      id
    );

    return { viewport, destroy: () => renderingEngine.destroy() };
  }

  if (ViewportClass === VolumeViewport3D) {
    const camera = vtkCamera.newInstance();
    const renderer = {
      getActiveCamera: () => camera,
      computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
      getViewProps: () => [],
    };
    const renderingEngine = {
      id: `standIn-${id}`,
      getRenderer: () => renderer,
      renderViewport() {},
    };

    renderingEngineCache.set(renderingEngine);

    const viewport = new VolumeViewport3D({
      id,
      element,
      renderingEngineId: renderingEngine.id,
      canvas: document.createElement('canvas'),
    });

    return {
      viewport,
      destroy: () => renderingEngineCache.delete(renderingEngine.id),
    };
  }

  const viewport = new ViewportClass({
    id,
    element,
    renderingEngineId: 'renderingEngine',
  });

  return { viewport, destroy: () => undefined };
}

describe('the viewport of each family', () => {
  const destroyers = [];

  afterEach(() => {
    destroyers.splice(0).forEach((destroy) => destroy());
  });

  it('has the plain string as its type', () => {
    families.forEach(([name, type, , , ViewportClass]) => {
      const { viewport, destroy } = makeEmptyViewport(
        ViewportClass,
        `${type}-type`
      );

      destroyers.push(destroy);
      expect(viewport.type).toBe(type);
      expect(viewport.type).toBe(ViewportType[name]);
    });
  });

  it('makes up the 5.x frame of reference, such as planarNext-viewport-<id>, without data', () => {
    families.forEach(([, type, , nextType, ViewportClass]) => {
      const viewportId = `${type}-empty`;
      const { viewport, destroy } = makeEmptyViewport(
        ViewportClass,
        viewportId
      );

      destroyers.push(destroy);
      expect(viewport.getFrameOfReferenceUID()).toBe(
        `${nextType}-viewport-${viewportId}`
      );
    });
  });
});

describe('the class export names', () => {
  /**
   * Each class with its plain export name and its removed 5.x export name,
   * or none.
   */
  const classNames = [
    [PlanarViewport, 'PlanarViewport'],
    [VolumeViewport3D, 'VolumeViewport3D', 'GenericVolumeViewport3D'],
    [VideoViewport, 'VideoViewport', 'VideoGenericViewport'],
    [WSIViewport, 'WSIViewport', 'WSIGenericViewport'],
    [ECGViewport, 'ECGViewport', 'ECGGenericViewport'],
  ];

  it('export each class under its plain name, and no Generic name or renderingEngineExportsV2', () => {
    classNames.forEach(([ViewportClass, name, removedName]) => {
      expect(core[name]).toBe(ViewportClass);
      expect(renderingEngineModule[name]).toBe(ViewportClass);

      if (removedName) {
        expect(core[removedName]).toBeUndefined();
        expect(renderingEngineModule[removedName]).toBeUndefined();
      }
    });
    expect(core.renderingEngineExportsV2).toBeUndefined();
    expect(renderingEngineModule.renderingEngineExportsV2).toBeUndefined();
    expect(core.BaseViewport).toBe(BaseViewport);
    expect(renderingEngineModule.BaseViewport).toBe(BaseViewport);
    expect(core.GenericViewport).toBeUndefined();
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
            type: ViewportType.PLANAR,
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
