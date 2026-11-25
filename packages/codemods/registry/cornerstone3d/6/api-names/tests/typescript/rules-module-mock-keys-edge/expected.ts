import { viewportProjection } from '@cornerstonejs/core';

vi.mock('@cornerstonejs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cornerstonejs/core')>();

  return {
    ...actual,
    Enums: {
      ...actual.Enums,
      Events: {
        ...actual.Enums.Events,
        DISPLAY_SET_APPEARANCE_CHANGED: 'voi',
        COLORMAP_MODIFIED: 'colormap',
      },
    },
    EVENTS: { SCROLL_OUT_OF_BOUNDS: 'out' },
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
    getFraming: getPresentation,
    'withFraming'(viewport, framing) {
      return framing;
    },
  },
  planarProjection: {
    adapter: { getFraming: vi.fn() },
    deriveFraming: vi.fn(),
  },
  Types: {},
}));

jest.doMock('@cornerstonejs/core', () => {
  const framing = { getFraming: jest.fn() };

  return { viewportProjection: framing };
});

it('reads the framing', () => {
  expect(viewportProjection.getFraming).toBe(getPresentation);
});
