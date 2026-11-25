import { RenderingEngine } from '@cornerstonejs/core';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  utilities: { viewportSupportsDisplaySetPresentation: jest.fn(() => true) },
}));

const viewport = {
  setDisplaySetPresentation: jest.fn(),
  render: jest.fn(),
};

export function Panel() {
  const engine = new RenderingEngine('engine');

  return <div data-engine={engine.id} onClick={() => viewport.render()} />;
}
