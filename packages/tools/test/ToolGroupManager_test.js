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
} = cornerstone3D;

const { registerVolumeLoader } = volumeLoader;
const { unregisterAllImageLoaders } = imageLoader;
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

describe('ToolGroup Manager:', () => {
  let testEnv;
  let renderingEngine;
  let toolGroup;

  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume1'],
      tools: [ProbeTool, LengthTool],
      toolActivations: {
        [ProbeTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        },
      },
      viewportIds: [viewportId1, viewportId2],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume1'],
      cleanupDOMElements: true,
    });
  });

  it('Should successfully creates tool groups', function () {
    const [element1, element2] = testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId1,
      },
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId2,
      },
    ]);

    const tg = ToolGroupManager.getToolGroup('volume1');
    expect(tg).toBeDefined();
  });

  it('Should successfully make a tool enabled/disabled/active/passive', function () {
    const [element1, element2] = testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId1,
      },
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId2,
      },
    ]);

    // Remove viewports
    let tg = ToolGroupManager.getToolGroup('volume1');
    expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Active');

    tg.setToolPassive(ProbeTool.toolName);
    expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Passive');
  });

  it('Should successfully setTool status', function () {
    const [element1, element2] = testUtils.createViewports(renderingEngine, [
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId1,
      },
      {
        viewportType: ViewportType.ORTHOGRAPHIC,
        orientation: Enums.OrientationAxis.AXIAL,
        viewportId: viewportId2,
      },
    ]);

    // Remove viewports
    let tg = ToolGroupManager.getToolGroup('volume1');
    tg.setToolActive();
    tg.setToolPassive();
    tg.setToolEnabled();
    tg.setToolDisabled();

    expect(tg.getToolInstance(ProbeTool.toolName).mode).toBe('Active');

    tg.addTool(LengthTool.toolName);
    tg.setToolEnabled(LengthTool.toolName);
    expect(tg.getToolInstance(LengthTool.toolName).mode).toBe('Enabled');

    tg.setToolDisabled(LengthTool.toolName);
    expect(tg.getToolInstance(LengthTool.toolName).mode).toBe('Disabled');
  });
});
