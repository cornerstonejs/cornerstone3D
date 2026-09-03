jest.mock('@cornerstonejs/core', () => ({
  getRenderingEngine: jest.fn(),
  viewportHasPan: jest.fn(),
  viewportHasZoom: jest.fn(),
  viewportProjection: {
    getPresentation: jest.fn(),
    withPresentation: jest.fn(),
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
    viewportProjection.getPresentation.mockReturnValue({
      pan: [12, -6],
      zoom: 2,
    });
    viewportProjection.withPresentation.mockReturnValue(nextViewState);

    zoomPanSyncCallback(
      createSynchronizerInstance(),
      sourceDescriptor,
      targetDescriptor
    );

    expect(viewportProjection.getPresentation).toHaveBeenCalledWith(
      sourceViewport,
      {
        selector: {
          pan: true,
          zoom: true,
        },
      }
    );
    expect(viewportProjection.withPresentation).toHaveBeenCalledWith(
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
    viewportProjection.getPresentation.mockReturnValue({
      pan: [12, -6],
      zoom: 2,
    });
    viewportProjection.withPresentation.mockReturnValue({
      anchorCanvas: [0.6, 0.4],
    });

    zoomPanSyncCallback(
      createSynchronizerInstance({
        syncZoom: false,
      }),
      sourceDescriptor,
      targetDescriptor
    );

    expect(viewportProjection.withPresentation).toHaveBeenCalledWith(
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
    viewportProjection.getPresentation.mockReturnValue(undefined);
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
});
