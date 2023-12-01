import { getRenderingEngine } from '../RenderingEngine';
import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';
import { IStackViewport, IVolumeViewport } from '../types';

type Viewport = IStackViewport | IVolumeViewport;

/**
 * Get the viewport that is rendering the image with the given imageURI (imageId without
 * the loader schema), this can be a stackViewport or a volumeViewport.
 *
 * @param renderingEngine - The rendering engine that is rendering the viewports
 * @param imageURI - The imageURI of the image that is requested
 * @returns A Viewport
 */
export default function getViewportsWithImageURI(
  imageURI: string,
  renderingEngineId?: string
): Array<Viewport> {
  // If rendering engine is not provided, use all rendering engines
  let renderingEngines;
  if (renderingEngineId) {
    renderingEngines = [getRenderingEngine(renderingEngineId)];
  } else {
    renderingEngines = getRenderingEngines();
  }

  const viewports = [];
  renderingEngines.forEach((renderingEngine) => {
    const viewportsForRenderingEngine = renderingEngine.getViewports();

    viewportsForRenderingEngine.forEach((viewport) => {
      if (viewport.hasImageURI(imageURI)) {
        viewports.push(viewport);
      }
    });
  });

  return viewports;
}
