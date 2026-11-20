let mockPolySeg: { updateSurfaceData: jest.Mock } | undefined;

jest.mock('../../../config', () => ({
  ...jest.requireActual('../../../config'),
  getPolySeg: () => mockPolySeg,
}));

import { getUpdateFunction } from './surfaceDisplay';

describe('surfaceDisplay.getUpdateFunction', () => {
  it('gives no update function without the polySeg add-on, so a data change calls nothing', () => {
    mockPolySeg = undefined;

    expect(getUpdateFunction({ id: 'vp-1' } as never)).toBeUndefined();
  });

  it('gives an update function that asks polySeg for the surface data with the add-on', async () => {
    mockPolySeg = { updateSurfaceData: jest.fn(() => Promise.resolve()) };
    const viewport = { id: 'vp-1' };
    const update = getUpdateFunction(viewport as never);

    await update('seg-1');

    expect(mockPolySeg.updateSurfaceData).toHaveBeenCalledWith('seg-1', {
      viewport,
    });
  });
});
