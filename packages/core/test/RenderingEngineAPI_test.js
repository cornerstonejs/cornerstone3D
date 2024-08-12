import * as cornerstone3D from '../src/index';

// import { User } from ... doesn't work right now since we don't have named exports set up
const { RenderingEngine, cache, utilities, Enums } = cornerstone3D;

const { ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();

const axialViewportId = 'AXIAL_VIEWPORT';
const sagittalViewportId = 'SAGITTAL_VIEWPORT';
const customOrientationViewportId = 'OFF_AXIS_VIEWPORT';

describe('RenderingEngineAPI -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('RenderingEngine API:', function () {
    beforeEach(function () {
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      this.elementAxial = document.createElement('div');

      this.elementAxial.width = 256;
      this.elementAxial.height = 512;

      this.elementSagittal = document.createElement('div');

      this.elementSagittal.width = 1024;
      this.elementSagittal.height = 1024;

      this.elementCustom = document.createElement('div');

      this.elementCustom.width = 63;
      this.elementCustom.height = 87;

      this.renderingEngine.setViewports([
        {
          viewportId: axialViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementAxial,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: sagittalViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementSagittal,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: customOrientationViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementCustom,
          defaultOptions: {
            orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
          },
        },
      ]);
    });

    afterEach(function () {
      this.renderingEngine?.destroy();
      [this.elementAxial, this.elementSagittal, this.elementCustom].forEach(
        (el) => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
      );
      cache.purgeCache();
    });

    it('should be able to access the viewports from renderingEngine', function () {
      const AxialViewport = this.renderingEngine.getViewport(axialViewportId);
      const Viewports = this.renderingEngine.getViewports();

      expect(AxialViewport).toBeTruthy();
      expect(Viewports).toBeTruthy();
      expect(Viewports.length).toEqual(3);
    });

    it('should be able to destroy the rendering engine', function () {
      this.renderingEngine?.destroy();

      expect(function () {
        this.renderingEngine.getViewports();
      }).toThrow();
    });

    it('should be able to handle destroy of an engine that has been destroyed', function () {
      this.renderingEngine?.destroy();
      const response = this.renderingEngine?.destroy();
      expect(response).toBeUndefined();
    });
  });

  describe('RenderingEngine Enable/Disable API:', function () {
    beforeEach(function () {
      this.renderingEngine = new RenderingEngine(renderingEngineId);

      this.elementAxial = document.createElement('div');

      this.elementAxial.width = 256;
      this.elementAxial.height = 512;

      this.elementSagittal = document.createElement('div');

      this.elementSagittal.width = 1024;
      this.elementSagittal.height = 1024;

      this.elementCustomOrientation = document.createElement('div');

      this.elementCustomOrientation.width = 63;
      this.elementCustomOrientation.height = 87;
    });

    afterEach(function () {
      this.renderingEngine?.destroy();
      [
        this.elementAxial,
        this.elementSagittal,
        this.elementCustomOrientation,
      ].forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should be able to successfully use enable api', function () {
      const viewportInputEntries = [
        {
          viewportId: axialViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementAxial,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: sagittalViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementSagittal,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: customOrientationViewportId,
          type: ViewportType.ORTHOGRAPHIC,
          element: this.elementCustomOrientation,
          defaultOptions: {
            orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
          },
        },
      ];

      this.renderingEngine.enableElement(viewportInputEntries[0]);

      let viewport1 = this.renderingEngine.getViewport(axialViewportId);
      let viewport2 = this.renderingEngine.getViewport(sagittalViewportId);

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

      const enable = function () {
        this.renderingEngine.enableElement(entry);
      };
      expect(enable).toThrow();
    });

    it('should successfully use disable element API', function () {
      const entry = {
        viewportId: axialViewportId,
        type: ViewportType.ORTHOGRAPHIC,
        element: this.elementAxial,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
        },
      };

      this.renderingEngine.enableElement(entry);
      let viewport1 = this.renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeTruthy();

      this.renderingEngine.disableElement(axialViewportId);
      viewport1 = this.renderingEngine.getViewport(axialViewportId);
      expect(viewport1).toBeUndefined();
    });

    it('should successfully get StackViewports', function () {
      const entry = {
        viewportId: axialViewportId,
        type: ViewportType.STACK,
        element: this.elementAxial,
        defaultOptions: {
          orientation: Enums.OrientationAxis.AXIAL,
        },
      };

      this.renderingEngine.enableElement(entry);
      const stackViewports = this.renderingEngine.getStackViewports();
      expect(stackViewports.length).toBe(1);
    });
  });
});
