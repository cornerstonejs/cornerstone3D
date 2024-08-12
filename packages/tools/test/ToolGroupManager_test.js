import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  metaData,
  volumeLoader,
  imageLoader,
  getEnabledElement,
} = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader } = volumeLoader;
const { ViewportType } = Enums;

const {
  ProbeTool,
  LengthTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = csTools3d;

const { fakeMetaDataProvider, fakeVolumeLoader } = testUtils;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();

const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';

function createViewports(width, height) {
  const element1 = document.createElement('div');

  element1.style.width = `${width}px`;
  element1.style.height = `${height}px`;
  document.body.appendChild(element1);

  const element2 = document.createElement('div');

  element2.style.width = `${width}px`;
  element2.style.height = `${height}px`;
  document.body.appendChild(element2);

  return [element1, element2];
}

describe('ToolGroup Manager: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('ToolGroup Manager: ', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(ProbeTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.toolGroup = ToolGroupManager.createToolGroup('volume1');
      this.toolGroup.addTool(ProbeTool.toolName);
      this.toolGroup.setToolActive(ProbeTool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary,
          },
        ],
      });
      this.renderingEngine = new RenderingEngine(renderingEngineId);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      // Destroy synchronizer manager to test it first since csTools3D also destroy
      // synchronizers
      ToolGroupManager.destroy();
      csTools3d.destroy();
      cache.purgeCache();
      this.renderingEngine?.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should successfully creates tool groups', function () {
      const [element1, element2] = createViewports(512, 128);
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      this.renderingEngine.setViewports([
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
      ]);

      this.toolGroup.addViewport(viewportId1, this.renderingEngine.id);

      const tg = ToolGroupManager.getToolGroup('volume1');
      expect(tg).toBeDefined();
    });
  });

  describe('ToolGroup Manager: ', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(ProbeTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.toolGroup = ToolGroupManager.createToolGroup('volume1');
      this.toolGroup.addTool(ProbeTool.toolName);
      this.toolGroup.setToolActive(ProbeTool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary,
          },
        ],
      });
      this.renderingEngine = new RenderingEngine(renderingEngineId);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      // Destroy synchronizer manager to test it first since csTools3D also destroy
      // synchronizers
      ToolGroupManager.destroyToolGroup('volume1');
      csTools3d.destroy();
      cache.purgeCache();
      this.renderingEngine?.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should successfully create toolGroup and get tool instances', function () {
      const [element1, element2] = createViewports(512, 128);
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      this.renderingEngine.setViewports([
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
      ]);

      this.toolGroup.addViewport(viewportId1, this.renderingEngine.id);

      const tg = ToolGroupManager.getToolGroup('volume1');
      expect(tg).toBeDefined();

      const tg2 = ToolGroupManager.getToolGroupForViewport(
        viewportId1,
        renderingEngineId
      );
      expect(tg2).toBeDefined();
      expect(tg).toBe(tg2);

      const tg3 = ToolGroupManager.createToolGroup('volume1');
      expect(tg3).toBeUndefined();

      const instance2 = tg.getToolInstance('probe');
      expect(instance2).toBeUndefined();
    });

    it('Should successfully Use toolGroup manager API', function () {
      const [element1, element2] = createViewports(512, 128);
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      this.renderingEngine.setViewports([
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
      ]);

      // Remove viewports
      let tg = ToolGroupManager.getToolGroup('volume1');

      tg.addViewport(viewportId1, this.renderingEngine.id);
      expect(tg.viewportsInfo.length).toBe(1);

      tg.removeViewports(renderingEngineId);

      tg = ToolGroupManager.getToolGroup('volume1');
      expect(tg.viewportsInfo.length).toBe(0);

      //
      tg.addViewport(viewportId1, this.renderingEngine.id);
      tg = ToolGroupManager.getToolGroup('volume1');
      expect(tg.viewportsInfo.length).toBe(1);

      tg.removeViewports(renderingEngineId, viewportId2);
      expect(tg.viewportsInfo.length).toBe(1);
    });

    it('Should successfully make a tool enabled/disabled/active/passive', function () {
      const [element1, element2] = createViewports(512, 128);
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      this.renderingEngine.setViewports([
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
      ]);

      this.toolGroup.addViewport(viewportId1, this.renderingEngine.id);

      // Remove viewports
      let tg = ToolGroupManager.getToolGroup('volume1');
      expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Active');
      expect(tg.getToolInstance(LengthTool.toolName)).toBeUndefined();

      tg.setToolPassive(ProbeTool.toolName);
      expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Passive');
    });

    it('Should successfully setTool status', function () {
      const [element1, element2] = createViewports(512, 128);
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      this.renderingEngine.setViewports([
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: element1,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: element2,
          defaultOptions: {
            background: [1, 0, 1], // pinkish background
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
      ]);

      this.toolGroup.addViewport(viewportId1, this.renderingEngine.id);

      // Remove viewports
      let tg = ToolGroupManager.getToolGroup('volume1');
      tg.setToolActive();
      tg.setToolPassive();
      tg.setToolEnabled();
      tg.setToolDisabled();

      expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Active');

      csTools3d.addTool(LengthTool);
      tg.addTool(LengthTool.toolName);
      tg.setToolEnabled(LengthTool.toolName);
      expect(tg.getToolInstance(LengthTool.toolName).mode).toBe('Enabled');

      tg.setToolDisabled(LengthTool.toolName);
      expect(tg.getToolInstance(LengthTool.toolName).mode).toBe('Disabled');
    });
  });
});
