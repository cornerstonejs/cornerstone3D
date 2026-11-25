import { render } from '@testing-library/react';
import { viewportProjection } from '@cornerstonejs/core';
import { Viewer } from './Viewer';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  viewportProjection: { getPresentation: jest.fn(() => ({ zoom: 2 })) },
  GenericViewport: jest.fn(),
}));

it('shows the zoom of the framing', () => {
  render(<Viewer />);
  expect(viewportProjection.getPresentation).toHaveBeenCalled();
});
