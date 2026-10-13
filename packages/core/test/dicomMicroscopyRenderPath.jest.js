import { DicomMicroscopyRenderPath } from '../src/RenderingEngine/GenericViewport/WSI/DicomMicroscopyRenderPath';
import { getDicomMicroscopyViewer } from '../src/utilities/WSIUtilities';

jest.mock('../src/utilities/WSIUtilities', () => ({
  ...jest.requireActual('../src/utilities/WSIUtilities'),
  getDicomMicroscopyViewer: jest.fn(),
}));

describe('DicomMicroscopyRenderPath', () => {
  it('enables right-drag zoom and constrains its coordinates to the slide extent', async () => {
    const existingInteraction = {};
    const receivedCoordinates = [];
    const dragZoomInteraction = {
      handleDownEvent(event) {
        receivedCoordinates.push(event.coordinate);
        return true;
      },
      handleDragEvent(event) {
        receivedCoordinates.push(event.coordinate);
      },
      handleUpEvent(event) {
        receivedCoordinates.push(event.coordinate);
        return false;
      },
    };
    let dragZoomActive = false;
    const map = {
      getInteractions: () => ({
        getArray: () =>
          dragZoomActive
            ? [existingInteraction, dragZoomInteraction]
            : [existingInteraction],
      }),
      getPixelFromCoordinate: jest.fn(([x, y]) => [x * 2, y * 2]),
      getView: () => ({
        getProjection: () => ({ getExtent: () => [0, 10, 100, 80] }),
      }),
      on: jest.fn(),
    };
    const viewer = {
      activateDragZoomInteraction: jest.fn(() => {
        dragZoomActive = true;
      }),
      deactivateDragPanInteraction: jest.fn(),
      deactivateDragZoomInteraction: jest.fn(),
      getMap: () => map,
      render: jest.fn(),
    };

    getDicomMicroscopyViewer.mockResolvedValue({
      viewer: {
        VolumeImageViewer: jest.fn(() => viewer),
      },
    });

    const element = document.createElement('div');
    const renderPath = new DicomMicroscopyRenderPath();

    await renderPath.addData(
      {
        element,
        renderingEngineId: 'rendering-engine',
        viewportId: 'viewport',
      },
      {
        id: 'wsi',
        type: 'wsi',
        client: {},
        volumeImages: [],
      },
      {}
    );

    expect(viewer.activateDragZoomInteraction).toHaveBeenCalledWith({
      bindings: { mouseButtons: ['right'] },
    });
    expect(viewer.deactivateDragZoomInteraction).not.toHaveBeenCalled();

    const event = { coordinate: [-20, 120], pixel: [-40, 240] };

    dragZoomInteraction.handleDownEvent(event);
    dragZoomInteraction.handleDragEvent(event);
    dragZoomInteraction.handleUpEvent(event);

    expect(receivedCoordinates).toEqual([
      [0, 80],
      [0, 80],
      [0, 80],
    ]);
    expect(map.getPixelFromCoordinate).toHaveBeenCalledTimes(3);
    expect(event).toEqual({ coordinate: [-20, 120], pixel: [-40, 240] });
  });
});
