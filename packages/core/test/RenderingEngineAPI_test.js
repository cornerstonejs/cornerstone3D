import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createViewports,
} from '../../../utils/test/testUtils';
import * as cornerstone3D from '../src/index';

const { Enums } = cornerstone3D;
const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const axialViewportId = 'AXIAL_VIEWPORT';
const sagittalViewportId = 'SAGITTAL_VIEWPORT';
const customOrientationViewportId = 'OFF_AXIS_VIEWPORT';

describe('RenderingEngineAPI -- ', () => {
  describe('RenderingEngine API:', function () {
    let renderingEngine;

    beforeEach(function () {
      const testEnv = setupTestEnvironment({
        renderingEngineId,
      });
      renderingEngine = testEnv.renderingEngine;
    });

    afterEach(function () {
      cleanupTestEnvironment({
        renderingEngineId,
      });
    });

    it('should be able to access the viewports from renderingEngine', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });
      createViewports(renderingEngine, {
        viewportId: sagittalViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.SAGITTAL,
        useEnableElement: true,
      });
      createViewports(renderingEngine, {
        viewportId: customOrientationViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
        useEnableElement: true,
      });

      const AxialViewport = renderingEngine.getViewport(axialViewportId);
      const Viewports = renderingEngine.getViewports();

      expect(AxialViewport).toBeTruthy();
      expect(Viewports).toBeTruthy();
      expect(Viewports.length).toEqual(3);
    });

    it('should be able to destroy the rendering engine', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.AXIAL,
      });

      renderingEngine.destroy();

      expect(function () {
        renderingEngine.getViewports();
      }).toThrow();
    });

    it('should be able to handle destroy of an engine that has been destroyed', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.AXIAL,
      });

      renderingEngine.destroy();
      const response = renderingEngine.destroy();
      expect(response).toBeUndefined();
    });
  });

  describe('RenderingEngine Enable/Disable API:', function () {
    let renderingEngine;

    beforeEach(function () {
      const testEnv = setupTestEnvironment({
        renderingEngineId,
      });
      renderingEngine = testEnv.renderingEngine;
    });

    afterEach(function () {
      cleanupTestEnvironment({
        renderingEngineId,
      });
    });

    it('should be able to successfully use enable api', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });

      let viewport1 = renderingEngine.getViewport(axialViewportId);
      let viewport2 = renderingEngine.getViewport(sagittalViewportId);

      expect(viewport1).toBeTruthy();
      expect(viewport1.id).toBe(axialViewportId);
      expect(viewport2).toBeUndefined();
    });

    it('should not enable element without an element', function () {
      const entry = {
        viewportId: axialViewportId,
        type: ViewportType.PLANAR,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
        },
      };

      expect(() => renderingEngine.enableElement(entry)).toThrow();
    });

    it('should successfully use disable element API', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.PLANAR,
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });

      let viewport1 = renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeTruthy();

      renderingEngine.disableElement(axialViewportId);
      viewport1 = renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeUndefined();
    });

    it('should resize legacy custom-pipeline viewports without changing the engine contract', function () {
      createViewports(renderingEngine, {
        viewportId: customOrientationViewportId,
        viewportType: ViewportType.ECG,
        useEnableElement: true,
      });

      expect(() => renderingEngine.resize()).not.toThrow();
    });
  });

  describe('RenderingEngine Enable/Disable API with Generic Viewport:', function () {
    let renderingEngine;

    beforeEach(function () {
      const testEnv = setupTestEnvironment({
        renderingEngineId,
      });
      renderingEngine = testEnv.renderingEngine;
    });

    afterEach(function () {
      cleanupTestEnvironment({
        renderingEngineId,
      });
    });

    it('throws for the removed type stack when using setViewports, and names the planar viewport', function () {
      expect(() =>
        createViewports(renderingEngine, [
          {
            viewportId: sagittalViewportId,
            viewportType: ViewportType.PLANAR,
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
          {
            viewportId: axialViewportId,
            viewportType: 'stack',
            orientation: Enums.OrientationAxis.AXIAL,
          },
        ])
      ).toThrowError(
        "ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR (a planar viewport shows a stack or a volume)"
      );
      expect(renderingEngine.getViewports().length).toBe(0);
    });

    it('throws for the removed types orthographic and perspective when using enableElement, and names their replacements', function () {
      expect(() =>
        createViewports(renderingEngine, {
          viewportId: axialViewportId,
          viewportType: 'orthographic',
          orientation: Enums.OrientationAxis.AXIAL,
          useEnableElement: true,
        })
      ).toThrowError(
        "ViewportType 'orthographic' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR with an orientation in defaultOptions, for example OrientationAxis.AXIAL (a planar viewport shows a stack or a volume)"
      );
      expect(() =>
        createViewports(renderingEngine, {
          viewportId: customOrientationViewportId,
          viewportType: 'perspective',
          useEnableElement: true,
        })
      ).toThrowError(
        "ViewportType 'perspective' was removed in Cornerstone3D 6.0: use ViewportType.VOLUME_3D with parallelProjection: false in defaultOptions"
      );
      expect(renderingEngine.getViewports().length).toBe(0);
    });

    it('draws every planar viewport through the first WebGL context of the pool', function () {
      createViewports(renderingEngine, [
        { viewportId: 'planar1' },
        { viewportId: 'planar2' },
        { viewportId: 'planar3' },
      ]);
      createViewports(renderingEngine, {
        viewportId: 'planar4',
        useEnableElement: true,
      });

      const pool = renderingEngine._implementation.contextPool;

      expect(pool.getContextCount()).toBeGreaterThan(1);
      ['planar1', 'planar2', 'planar3', 'planar4'].forEach((viewportId) => {
        expect(pool.getContextIndexForViewport(viewportId)).toBe(0);
      });
    });

    it('gives the next ECG viewport for ViewportType.ECG when using enableElement', function () {
      createViewports(renderingEngine, {
        viewportId: customOrientationViewportId,
        viewportType: ViewportType.ECG,
        useEnableElement: true,
      });

      const viewport = renderingEngine.getViewport(customOrientationViewportId);

      expect(viewport).toBeTruthy();
      expect(viewport.type).toBe(ViewportType.ECG);
    });

    [
      ['PLANAR', 'planar', 'planarNext'],
      ['VOLUME_3D', 'volume3d', 'volume3dNext'],
      ['VIDEO', 'video', 'videoNext'],
      ['WHOLE_SLIDE', 'wholeSlide', 'wholeSlideNext'],
      ['ECG', 'ecg', 'ecgNext'],
    ].forEach(([name, type, nextType]) => {
      it(`throws at enableElement and at setViewports for the removed 5.x string '${nextType}', with ViewportType.${name} to use instead`, function () {
        const message = `ViewportType '${nextType}' was removed in Cornerstone3D 6.0: use ViewportType.${name} ('${type}')`;

        expect(ViewportType[`${name}_NEXT`]).toBeUndefined();
        expect(() =>
          createViewports(renderingEngine, {
            viewportId: 'byNextString',
            viewportType: nextType,
            useEnableElement: true,
          })
        ).toThrowError(message);
        expect(() =>
          createViewports(renderingEngine, [
            { viewportId: 'byNextString', viewportType: nextType },
          ])
        ).toThrowError(message);
        expect(renderingEngine.getViewport('byNextString')).toBeUndefined();
      });
    });

    it('should resize remapped custom-pipeline Generic viewports without legacy camera APIs', function () {
      createViewports(renderingEngine, {
        viewportId: customOrientationViewportId,
        viewportType: ViewportType.ECG,
        useEnableElement: true,
      });

      expect(() => renderingEngine.resize()).not.toThrow();
    });
  });
});
