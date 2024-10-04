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
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });
      createViewports(renderingEngine, {
        viewportId: sagittalViewportId,
        orientation: Enums.OrientationAxis.SAGITTAL,
        useEnableElement: true,
      });
      createViewports(renderingEngine, {
        viewportId: customOrientationViewportId,
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
        type: ViewportType.ORTHOGRAPHIC,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
        },
      };

      expect(() => renderingEngine.enableElement(entry)).toThrow();
    });

    it('should successfully use disable element API', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });

      let viewport1 = renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeTruthy();

      renderingEngine.disableElement(axialViewportId);
      viewport1 = renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeUndefined();
    });

    it('should successfully get StackViewports', function () {
      createViewports(renderingEngine, {
        viewportId: axialViewportId,
        viewportType: ViewportType.STACK,
        orientation: Enums.OrientationAxis.AXIAL,
        useEnableElement: true,
      });

      const stackViewports = renderingEngine.getStackViewports();
      expect(stackViewports.length).toBe(1);
    });
  });
});
