import { viewportProjection } from '@cornerstonejs/core';

jest.mock('./viewportProjection', () => ({
  viewportProjection: { getPresentation: jest.fn() },
}));

jest.mock('@cornerstonejs/core');

jest.mock('@cornerstonejs/tools', () => ({
  viewportProjection: { getPresentation: jest.fn() },
  utilities: { stackContextPrefetch: { enable: jest.fn() } },
}));

jest.mock('@cornerstonejs/core', () => {
  const name = 'getPresentation';
  const shared = { getFraming: jest.fn() };

  return {
    viewportProjection: { getFraming: jest.fn(), [name]: jest.fn() },
    utilities: shared,
    Enums: { Events: { DISPLAY_SETS_CHANGED: 'changed' } },
    BaseViewport: jest.fn(),
  };
});

const fake = { viewportProjection: { getPresentation: jest.fn() } };

it('keeps what is not a mock of a Cornerstone name', () => {
  expect(viewportProjection.getFraming).toBeDefined();
  expect(fake.viewportProjection.getPresentation).toBeDefined();
});
