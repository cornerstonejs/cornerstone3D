import { getRenderingEngines } from '../RenderingEngine/getRenderingEngine';
import {
  viewportSupportsImageSlices,
  type ImageSliceViewport,
} from './viewportCapabilities';

/**
 * Get the viewport that is rendering the image with the given imageURI (imageId without
 * the loader schema), this can be any viewport that exposes image-slice queries.
 *
 * @param renderingEngine - The rendering engine that is rendering the viewports
 * @param imageURI - The imageURI of the image that is requested
 * @returns Matching image-slice-aware viewports
 */
export default function getViewportsWithImageURI(
  imageURI: string
): ImageSliceViewport[] {
  // If rendering engine is not provided, use all rendering engines
  const renderingEngines = getRenderingEngines();

  const viewports: ImageSliceViewport[] = [];
  renderingEngines.forEach((renderingEngine) => {
    const viewportsForRenderingEngine = renderingEngine
      .getViewports()
      .filter(viewportSupportsImageSlices);

    viewportsForRenderingEngine.forEach((viewport) => {
      if (viewport.hasImageURI(imageURI)) {
        viewports.push(viewport);
      }
    });
  });

  return viewports;
}
