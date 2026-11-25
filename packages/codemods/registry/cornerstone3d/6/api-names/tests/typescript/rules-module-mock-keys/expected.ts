import { Enums, utilities, viewportProjection } from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    viewportProjection: { getFraming: jest.fn(), withFraming: jest.fn() },
    utilities: {
      ...actual.utilities,
      resolveViewportVolumeId: jest.fn(() => 'volume'),
      viewportSupportsDisplaySetAppearance: jest.fn(() => true),
    },
    Enums: {
      ...actual.Enums,
      Events: {
        ...actual.Enums.Events,
        DISPLAY_SETS_CHANGED: 'CORNERSTONE_VIEWPORT_NEW_IMAGE_SET',
      },
    },
    BaseViewport: jest.fn(),
  };
});

jest.mock('@cornerstonejs/tools', () => ({
  ...jest.requireActual('@cornerstonejs/tools'),
  synchronizers: { createViewFramingSynchronizer: jest.fn() },
}));

const getPresentation = viewportProjection.getFraming as jest.Mock;
const withPresentation = viewportProjection.withFraming as jest.Mock;

beforeEach(() => {
  getPresentation.mockReset();
  withPresentation.mockReset();
});

it('reads the mocked names', () => {
  expect(utilities.resolveViewportVolumeId).toBeDefined();
  expect(Enums.Events.DISPLAY_SETS_CHANGED).toBeDefined();
  expect(synchronizers.createViewFramingSynchronizer).toBeDefined();
});
