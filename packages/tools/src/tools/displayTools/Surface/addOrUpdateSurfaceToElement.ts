import type { Types } from '@cornerstonejs/core';
import { getSurfaceRepresentationUID } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import {
  addOrUpdateSurfaceDisplaySet,
  showsSurfacesAsDisplaySets,
} from './surfaceDisplaySet';
import {
  addOrUpdateSurfaceSliceProp,
  showsSurfacesAsSliceProps,
} from './surfaceSliceProps';

/**
 * Shows a surface of a segmentation on a viewport, or updates the one that
 * the viewport shows. On a next 3D viewport the surface is a geometry display
 * set, and the promise resolves when it is mounted. On a next planar viewport
 * it is a prop of the vtk.js renderer of the viewport, clipped to the slice in
 * volume mode. Any other viewport shows no surface.
 *
 * @param viewport - The viewport.
 * @param surface - The surface, with its colour and its visibility.
 * @param segmentationId - The id of the segmentation of the surface.
 * @param geometryId - The id of the cached geometry of the surface, which a
 * next 3D viewport mounts. The id of the surface when not given.
 */
async function addOrUpdateSurfaceToElement(
  viewport: Types.IViewport,
  surface: Types.ISurface,
  segmentationId: string,
  geometryId: string = surface.id
): Promise<void> {
  if (showsSurfacesAsDisplaySets(viewport)) {
    return addOrUpdateSurfaceDisplaySet(
      viewport,
      geometryId,
      surface,
      segmentationId
    );
  }

  if (showsSurfacesAsSliceProps(viewport)) {
    addOrUpdateSurfaceSliceProp(
      viewport,
      surface,
      getSurfaceRepresentationUID(segmentationId, surface.segmentIndex)
    );
  }
}

export default addOrUpdateSurfaceToElement;
