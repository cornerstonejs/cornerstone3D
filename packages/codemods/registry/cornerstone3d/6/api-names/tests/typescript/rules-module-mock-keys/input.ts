import { Enums, utilities, viewportProjection } from '@cornerstonejs/core';
import { synchronizers } from '@cornerstonejs/tools';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    viewportProjection: { getPresentation: jest.fn(), withPresentation: jest.fn() },
    utilities: {
      ...actual.utilities,
      resolveGenericViewportVolumeId: jest.fn(() => 'volume'),
      viewportSupportsDisplaySetPresentation: jest.fn(() => true),
    },
    Enums: {
      ...actual.Enums,
      Events: {
        ...actual.Enums.Events,
        VIEWPORT_NEW_IMAGE_SET: 'CORNERSTONE_VIEWPORT_NEW_IMAGE_SET',
      },
    },
    GenericViewport: jest.fn(),
  };
});

jest.mock('@cornerstonejs/tools', () => ({
  ...jest.requireActual('@cornerstonejs/tools'),
  synchronizers: { createPresentationViewSynchronizer: jest.fn() },
}));

const getPresentation = viewportProjection.getPresentation as jest.Mock;
const withPresentation = viewportProjection.withPresentation as jest.Mock;

beforeEach(() => {
  getPresentation.mockReset();
  withPresentation.mockReset();
});

it('reads the mocked names', () => {
  expect(utilities.resolveGenericViewportVolumeId).toBeDefined();
  expect(Enums.Events.VIEWPORT_NEW_IMAGE_SET).toBeDefined();
  expect(synchronizers.createPresentationViewSynchronizer).toBeDefined();
});
