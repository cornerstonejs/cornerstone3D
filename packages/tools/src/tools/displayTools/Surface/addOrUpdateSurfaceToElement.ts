import { utilities, type Types } from '@cornerstonejs/core';
import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { resetViewportCamera } from '../../../utilities/setViewportCamera';
import {
  getSurfaceActorEntry,
  getSurfaceRepresentationUID,
} from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import {
  addOrUpdateSurfaceDisplaySet,
  showsSurfacesAsDisplaySets,
} from './surfaceDisplaySet';
import {
  addOrUpdateSurfaceSliceProp,
  showsSurfacesAsSliceProps,
} from './surfaceSliceProps';
import { createSurfaceActor, updateSurfaceActorData } from './surfaceActor';

/**
 * Shows a surface of a segmentation on a viewport, or updates the one that
 * the viewport shows. On a direct next 3D viewport the surface is a geometry
 * display set, and the promise resolves when it is mounted. On a next planar
 * viewport, and on its legacy adapter, it is a prop of the vtk.js renderer of
 * the viewport, clipped to the slice in volume mode. On the legacy 3D adapter
 * it is an actor of the application, added before the function returns.
 *
 * @param viewport - The viewport.
 * @param surface - The surface, with its colour and its visibility.
 * @param segmentationId - The id of the segmentation of the surface.
 * @param geometryId - The id of the cached geometry of the surface, which a
 * next 3D viewport mounts. The id of the surface when not given.
 */
async function addOrUpdateSurfaceToElement(
  viewport: Types.IVolumeViewport,
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
    return;
  }

  const surfaceActorEntry = getSurfaceActorEntry(
    viewport.id,
    segmentationId,
    surface.segmentIndex
  );

  const surfaceActor = surfaceActorEntry?.actor as Types.Actor;

  const isVisible = surface.visible;

  if (surfaceActor) {
    surfaceActor.setVisibility(isVisible);

    if (!isVisible) {
      return;
    }

    if (updateSurfaceActorData(surfaceActor, surface)) {
      viewport.getRenderer().resetCameraClippingRange();
    }

    return;
  }

  let clippingFilter;
  const actor = createSurfaceActor(surface);

  const representationUID = getSurfaceRepresentationUID(
    segmentationId,
    surface.segmentIndex
  );

  viewport.addActor({
    uid: utilities.uuidv4(),
    actor: actor as vtkActor,
    clippingFilter,
    representationUID,
  });

  resetViewportCamera(viewport);
  viewport.getRenderer().resetCameraClippingRange();
  viewport.render();
}

export default addOrUpdateSurfaceToElement;
