import { viewportProjection } from '@cornerstonejs/core';

vi.mock('@cornerstonejs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cornerstonejs/core')>();

  return {
    ...actual,
    Enums: {
      ...actual.Enums,
      Events: {
        ...actual.Enums.Events,
        VOI_MODIFIED: 'voi',
        COLORMAP_MODIFIED: 'colormap',
      },
    },
    EVENTS: { STACK_SCROLL_OUT_OF_BOUNDS: 'out' },
    utilities: {
      ...actual.utilities,
      genericViewportDisplaySetMetadataProvider: { add: vi.fn() },
      isGenericViewport: vi.fn(() => true),
    },
  };
});

const getPresentation = vi.fn();

vi.doMock('@cornerstonejs/core', () => ({
  viewportProjection: {
    getPresentation,
    'withPresentation'(viewport, framing) {
      return framing;
    },
  },
  planarProjection: {
    adapter: { getPresentation: vi.fn() },
    derivePresentation: vi.fn(),
  },
  Types: {},
}));

jest.doMock('@cornerstonejs/core', () => {
  const framing = { getPresentation: jest.fn() };

  return { viewportProjection: framing };
});

it('reads the framing', () => {
  expect(viewportProjection.getPresentation).toBe(getPresentation);
});
