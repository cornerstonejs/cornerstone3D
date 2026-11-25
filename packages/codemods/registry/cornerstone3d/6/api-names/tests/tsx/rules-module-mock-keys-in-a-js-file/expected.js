import { render } from '@testing-library/react';
import { viewportProjection } from '@cornerstonejs/core';
import { Viewer } from './Viewer';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  viewportProjection: { getFraming: jest.fn(() => ({ zoom: 2 })) },
  BaseViewport: jest.fn(),
}));

it('shows the zoom of the framing', () => {
  render(<Viewer />);
  expect(viewportProjection.getFraming).toHaveBeenCalled();
});
