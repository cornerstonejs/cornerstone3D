import getEllipseWorldCoordinates from '../src/utilities/getEllipseWorldCoordinates';

describe('getEllipseWorldCoordinates', () => {
  it('uses the resolved camera for a Planar GenericViewport', () => {
    const viewport = {
      getResolvedView: () => ({
        toICamera: () => ({
          focalPoint: [0, 0, 0],
          position: [0, 0, -1],
          viewPlaneNormal: [0, 0, 1],
          viewUp: [0, 1, 0],
        }),
      }),
      getViewReference: () => ({}),
      setDisplaySets: jest.fn(),
      setDisplaySetPresentation: jest.fn(),
      setViewState: jest.fn(),
    };

    const coordinates = getEllipseWorldCoordinates(
      [
        [0, 0, 0],
        [2, 0, 0],
      ],
      viewport
    ).map((point) => Array.from(point));

    expect(coordinates).toEqual([
      [0, -2, 0],
      [0, 2, 0],
      [-2, 0, 0],
      [2, 0, 0],
    ]);
  });
});
