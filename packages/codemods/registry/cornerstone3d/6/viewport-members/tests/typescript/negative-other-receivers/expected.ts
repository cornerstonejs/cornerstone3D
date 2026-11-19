import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { PlanarViewport } from '@cornerstonejs/core';

const renderer = vtkRenderer.newInstance();
const button = { isDisabled: false, modality: 'CT' };
const store = { setProperties: (value: object) => value };

renderer.resetCamera();
store.setProperties({ voiRange: 1 });

function sixZero(viewport: PlanarViewport, displaySetId: string) {
  viewport.resetViewState();
  viewport.setDisplaySetPresentation(displaySetId, {
    voiRange: { lower: 0, upper: 1 },
  });

  return [
    viewport.isDestroyed,
    viewport.getImageData()?.imageData.getBounds(),
    button,
  ];
}

console.log(sixZero);
