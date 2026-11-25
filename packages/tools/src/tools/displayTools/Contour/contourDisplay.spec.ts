import contourDisplay from './contourDisplay';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { removeContourCuts, updateContourCuts } from './contourCuts';

const mockContourData = {
  geometryIds: ['contourGeometry'],
  annotationUIDsMap: new Map(),
};

jest.mock('@cornerstonejs/core', () => ({
  getEnabledElementByViewportId: jest.fn(() => ({
    viewport: { render: jest.fn() },
  })),
  utilities: {
    logger: {
      toolsLog: { getLogger: () => ({ debug: jest.fn(), warn: jest.fn() }) },
    },
  },
}));

jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: () => ({
    representationData: { Contour: mockContourData },
  }),
}));

jest.mock('../../../config', () => ({ getPolySeg: () => null }));

jest.mock('./contourHandler/handleContourSegmentation', () => ({
  handleContourSegmentation: jest.fn(),
}));

jest.mock('./contourCuts', () => ({
  updateContourCuts: jest.fn(() => Promise.resolve()),
  removeContourCuts: jest.fn(),
}));

jest.mock('./removeContourFromElement', () => jest.fn());

jest.mock(
  '../../../utilities/segmentation/computeAndAddRepresentation',
  () => ({ computeAndAddRepresentation: jest.fn() })
);

describe('contourDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('draws the contour sets first and then asks for the cuts of the plane of the viewport, whatever the status of the viewport', async () => {
    const order = [];
    const viewport = {
      id: 'contourDisplayViewport',
      viewportStatus: 'needsRender',
    };

    (handleContourSegmentation as jest.Mock).mockImplementation(() =>
      order.push('contour sets')
    );
    (updateContourCuts as jest.Mock).mockImplementation(() => {
      order.push('cuts');
      return Promise.resolve();
    });

    await contourDisplay.render(
      viewport as never,
      { segmentationId: 'firstSegmentation' } as never
    );

    expect(order).toEqual(['contour sets', 'cuts']);
    expect(updateContourCuts).toHaveBeenCalledWith(
      viewport,
      'firstSegmentation'
    );
  });

  it('does not wait for the cuts to finish its render', async () => {
    (updateContourCuts as jest.Mock).mockImplementation(
      () => new Promise(() => undefined)
    );

    await expect(
      contourDisplay.render(
        { id: 'contourDisplayViewport' } as never,
        { segmentationId: 'firstSegmentation' } as never
      )
    ).resolves.toBeUndefined();
  });

  it('takes the cuts of the segmentation off the viewport when the representation goes', () => {
    contourDisplay.removeRepresentation(
      'contourDisplayViewport',
      'firstSegmentation'
    );

    expect(removeContourCuts).toHaveBeenCalledWith(
      'contourDisplayViewport',
      'firstSegmentation'
    );
  });
});
