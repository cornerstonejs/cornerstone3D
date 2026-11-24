jest.mock('@cornerstonejs/core', () => ({
  getRenderingEngine: jest.fn(),
  viewportHasPan: jest.fn(),
  viewportHasZoom: jest.fn(),
  viewportProjection: {
    getFraming: jest.fn(),
    withFraming: jest.fn(),
  },
}));

import {
  getRenderingEngine,
  viewportHasPan,
  viewportHasZoom,
  viewportProjection,
} from '@cornerstonejs/core';
import zoomPanSyncCallback from '../src/synchronizers/callbacks/zoomPanSyncCallback';

const sourceDescriptor = {
  renderingEngineId: 'rendering-engine',
  viewportId: 'source',
};
const targetDescriptor = {
  renderingEngineId: 'rendering-engine',
  viewportId: 'target',
};

function createSynchronizerInstance(options) {
  return {
    getOptions: jest.fn(() => options),
  };
}

function mockRenderingEngine(sourceViewport, targetViewport) {
  getRenderingEngine.mockReturnValue({
    getViewport: jest.fn((viewportId) =>
      viewportId === 'source' ? sourceViewport : targetViewport
    ),
  });
}

describe('zoomPanSyncCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('synchronizes projection-backed viewports through the projection service', () => {
    const sourceViewport = {};
    const targetViewport = {
      render: jest.fn(),
      setPan: jest.fn(),
      setViewState: jest.fn(),
      setZoom: jest.fn(),
    };
    const nextViewState = {
      anchorCanvas: [0.6, 0.4],
      scale: [2, 2],
    };

    mockRenderingEngine(sourceViewport, targetViewport);
    viewportProjection.getFraming.mockReturnValue({
      pan: [12, -6],
      zoom: 2,
    });
    viewportProjection.withFraming.mockReturnValue(nextViewState);

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      sourceDescriptor,
      targetDescriptor
    );

    expect(viewportProjection.getFraming).toHaveBeenCalledWith(sourceViewport, {
      selector: {
        pan: true,
        zoom: true,
      },
    });
    expect(viewportProjection.withFraming).toHaveBeenCalledWith(
      targetViewport,
      {
        pan: [12, -6],
        zoom: 2,
      }
    );
    expect(targetViewport.setViewState).toHaveBeenCalledWith(nextViewState);
    expect(targetViewport.setZoom).not.toHaveBeenCalled();
    expect(targetViewport.setPan).not.toHaveBeenCalled();
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('honors syncZoom and syncPan options when using projection state', () => {
    const sourceViewport = {};
    const targetViewport = {
      render: jest.fn(),
      setViewState: jest.fn(),
    };

    mockRenderingEngine(sourceViewport, targetViewport);
    viewportProjection.getFraming.mockReturnValue({
      pan: [12, -6],
      zoom: 2,
    });
    viewportProjection.withFraming.mockReturnValue({
      anchorCanvas: [0.6, 0.4],
    });

    zoomPanSyncCallback(
      createSynchronizerInstance({
        syncZoom: false,
      }),
      sourceDescriptor,
      targetDescriptor
    );

    expect(viewportProjection.withFraming).toHaveBeenCalledWith(
      targetViewport,
      {
        pan: [12, -6],
      }
    );
  });

  it('falls back to zoom and pan viewport capabilities without projection adapters', () => {
    const sourceViewport = {
      getPan: jest.fn(() => [4, -2]),
      getZoom: jest.fn(() => 1.5),
    };
    const targetViewport = {
      render: jest.fn(),
      setPan: jest.fn(),
      setZoom: jest.fn(),
    };

    mockRenderingEngine(sourceViewport, targetViewport);
    viewportProjection.getFraming.mockReturnValue(undefined);
    viewportHasZoom.mockReturnValue(true);
    viewportHasPan.mockReturnValue(true);

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      sourceDescriptor,
      targetDescriptor
    );

    expect(targetViewport.setZoom).toHaveBeenCalledWith(1.5);
    expect(targetViewport.setPan).toHaveBeenCalledWith([4, -2]);
    expect(targetViewport.render).toHaveBeenCalledTimes(1);
  });

  it('leaves the target when the projection service knows the source and gives no zoom and no pan for it, as for a 3D viewport that shows nothing', () => {
    const sourceViewport = {
      getPan: jest.fn(() => [0, 0]),
      getZoom: jest.fn(() => 1),
    };
    const targetViewport = {
      render: jest.fn(),
      setPan: jest.fn(),
      setViewState: jest.fn(),
      setZoom: jest.fn(),
    };

    mockRenderingEngine(sourceViewport, targetViewport);
    viewportProjection.getFraming.mockReturnValue({ camera: {} });
    viewportHasZoom.mockReturnValue(true);
    viewportHasPan.mockReturnValue(true);

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      sourceDescriptor,
      targetDescriptor
    );

    expect(viewportProjection.withFraming).not.toHaveBeenCalled();
    expect(targetViewport.setViewState).not.toHaveBeenCalled();
    expect(targetViewport.setZoom).not.toHaveBeenCalled();
    expect(targetViewport.setPan).not.toHaveBeenCalled();
  });

  it('reads the source from its own rendering engine when the target is in another one with a viewport of the same id', () => {
    const sourceViewport = { id: 'axial-of-engine-a' };
    const sameIdViewportOfEngineB = { id: 'axial-of-engine-b' };
    const targetViewport = {
      render: jest.fn(),
      setViewState: jest.fn(),
    };
    const engines = {
      a: { getViewport: jest.fn(() => sourceViewport) },
      b: {
        getViewport: jest.fn((viewportId) =>
          viewportId === 'axial' ? sameIdViewportOfEngineB : targetViewport
        ),
      },
    };

    getRenderingEngine.mockImplementation((id) => engines[id]);
    viewportProjection.getFraming.mockReturnValue({
      pan: [1, 2],
      zoom: 2,
    });
    viewportProjection.withFraming.mockReturnValue({ scale: [2, 2] });

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'a', viewportId: 'axial' },
      { renderingEngineId: 'b', viewportId: 'target' }
    );

    expect(viewportProjection.getFraming).toHaveBeenCalledWith(
      sourceViewport,
      expect.anything()
    );
  });

  it('does nothing when the source is disabled', () => {
    const targetViewport = {
      render: jest.fn(),
      setViewState: jest.fn(),
    };
    const engines = {
      a: { getViewport: jest.fn(() => undefined) },
      b: { getViewport: jest.fn(() => targetViewport) },
    };

    getRenderingEngine.mockImplementation((id) => engines[id]);

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      { renderingEngineId: 'a', viewportId: 'axial' },
      { renderingEngineId: 'b', viewportId: 'target' }
    );

    expect(viewportProjection.getFraming).not.toHaveBeenCalled();
    expect(targetViewport.render).not.toHaveBeenCalled();
  });
});
