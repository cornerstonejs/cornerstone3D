import { Enums, utilities } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';
import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { createSurfaceActor, updateSurfaceActorData } from './surfaceActor';

/**
 * The surfaces that a planar viewport shows, by representation UID, and the
 * listener that keeps them at the slice on display.
 */
type SliceSurfaces = {
  actors: Map<string, vtkActor>;
  onCameraModified: () => void;
};

/** The surfaces of each planar viewport. */
const sliceSurfacesByViewport = new WeakMap<PlanarViewport, SliceSurfaces>();

/**
 * Whether a surface goes on the viewport as a prop of its vtk.js renderer: a
 * next planar viewport, the only viewport other than a 3D one that has a
 * renderer.
 *
 * @param viewport - The viewport.
 * @returns Whether the viewport shows a surface as a prop of its renderer.
 */
function showsSurfacesAsSliceProps(
  viewport: Types.IViewport
): viewport is PlanarViewport {
  return (
    viewport.type !== Enums.ViewportType.VOLUME_3D_NEXT &&
    typeof (viewport as Partial<PlanarViewport>).getRenderer === 'function'
  );
}

/**
 * The pair of clipping planes of the slice on display in volume mode: of the
 * pairs of `utilities.getSlicesClippingPlanes`, 0.05 mm on each side of each
 * slice, the one nearest to the focal point. Undefined in stack mode.
 */
function getPlanesOfSliceOnDisplay(
  viewport: PlanarViewport
): { normal: Types.Point3; origin: Types.Point3 }[] | undefined {
  if (viewport.getCurrentMode() !== 'volume') {
    return;
  }

  const { cameraFocalPoint, viewPlaneNormal } = viewport.getViewReference();
  let nearest: { normal: Types.Point3; origin: Types.Point3 }[];
  let nearestDistance = Infinity;

  for (const { planes } of utilities.getSlicesClippingPlanes(viewport)) {
    const distance = Math.abs(
      [0, 1, 2].reduce(
        (sum, axis) =>
          sum +
          ((planes[0].origin[axis] + planes[1].origin[axis]) / 2 -
            cameraFocalPoint[axis]) *
            viewPlaneNormal[axis],
        0
      )
    );

    if (distance < nearestDistance) {
      nearest = planes;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/**
 * Clips each surface of a planar viewport to the slice on display, as the
 * legacy volume viewport did: two clipping planes 0.05 mm on each side of
 * the slice, so a surface shows as its cut. In stack mode a surface has no
 * clipping plane, as on the legacy stack viewport: it is drawn whole, in
 * front of the image where it stands toward the viewer and hidden by the
 * image where it stands behind it.
 *
 * @param viewport - The planar viewport.
 * @param actors - The actors of its surfaces.
 */
function clipSurfacesToSlice(
  viewport: PlanarViewport,
  actors: Iterable<vtkActor>
): void {
  const planes = getPlanesOfSliceOnDisplay(viewport);

  for (const actor of actors) {
    const mapper = actor.getMapper();

    if (!planes) {
      mapper.removeAllClippingPlanes();
      continue;
    }

    while (mapper.getNumberOfClippingPlanes() < planes.length) {
      mapper.addClippingPlane(vtkPlane.newInstance());
    }

    mapper.getClippingPlanes().forEach((plane, index) => {
      plane.setNormal(planes[index].normal);
      plane.setOrigin(planes[index].origin);
    });
  }
}

/**
 * The surfaces of a planar viewport. The first call makes the entry and
 * listens to the camera of the viewport, so the clipping follows a scroll and
 * a change of orientation.
 */
function getSliceSurfaces(viewport: PlanarViewport): SliceSurfaces {
  let sliceSurfaces = sliceSurfacesByViewport.get(viewport);

  if (sliceSurfaces) {
    return sliceSurfaces;
  }

  const actors = new Map<string, vtkActor>();
  const onCameraModified = () => {
    if (viewport.isDestroyed) {
      viewport.element.removeEventListener(
        Enums.Events.CAMERA_MODIFIED,
        onCameraModified
      );
      return;
    }

    clipSurfacesToSlice(viewport, actors.values());
  };

  sliceSurfaces = { actors, onCameraModified };
  sliceSurfacesByViewport.set(viewport, sliceSurfaces);
  viewport.element.addEventListener(
    Enums.Events.CAMERA_MODIFIED,
    onCameraModified
  );

  return sliceSurfaces;
}

/**
 * Shows a surface of a segmentation on a planar viewport as a prop of its
 * vtk.js renderer (`getRenderer().addActor`), or updates the one that it
 * shows: its visibility, its colour, and its points and polys when their
 * number changed. In volume mode the prop is clipped to the slice on display,
 * and the clipping follows each change of the camera. The viewport does not
 * move: the legacy viewport reset its camera for a new surface.
 *
 * @param viewport - The planar viewport.
 * @param surface - The surface, with its colour and its visibility.
 * @param representationUID - The representation UID of the surface.
 */
function addOrUpdateSurfaceSliceProp(
  viewport: PlanarViewport,
  surface: Types.ISurface,
  representationUID: string
): void {
  const { actors } = getSliceSurfaces(viewport);
  let actor = actors.get(representationUID);

  if (actor) {
    updateSurfaceActorData(actor, surface);
  } else {
    actor = createSurfaceActor(surface);
    actors.set(representationUID, actor);
    viewport.getRenderer().addActor(actor);
  }

  const [r, g, b] = surface.color;

  actor.setVisibility(surface.visible);
  actor.getProperty().setColor(r / 255, g / 255, b / 255);
  clipSurfacesToSlice(viewport, [actor]);
  viewport.render();
}

/**
 * Takes the surfaces of a segmentation out of the renderer of a planar
 * viewport. The viewport stops listening to its camera when it shows no
 * surface any more.
 *
 * @param viewport - The planar viewport.
 * @param representationUIDPrefix - The start of the representation UIDs of
 * the surfaces of the segmentation.
 */
function removeSurfaceSliceProps(
  viewport: PlanarViewport,
  representationUIDPrefix: string
): void {
  const sliceSurfaces = sliceSurfacesByViewport.get(viewport);

  if (!sliceSurfaces) {
    return;
  }

  const renderer = viewport.getRenderer();

  for (const [representationUID, actor] of sliceSurfaces.actors) {
    if (representationUID.startsWith(representationUIDPrefix)) {
      renderer.removeActor(actor);
      sliceSurfaces.actors.delete(representationUID);
    }
  }

  if (!sliceSurfaces.actors.size) {
    viewport.element.removeEventListener(
      Enums.Events.CAMERA_MODIFIED,
      sliceSurfaces.onCameraModified
    );
    sliceSurfacesByViewport.delete(viewport);
  }

  viewport.render();
}

/**
 * The actor entry of a surface that a planar viewport shows: the prop that
 * its renderer draws, with the representation UID of the surface as its uid.
 *
 * @param viewport - The planar viewport.
 * @param representationUID - The representation UID of the surface.
 * @returns The actor entry, or undefined when the viewport does not show the
 * surface.
 */
function getSurfaceSlicePropEntry(
  viewport: PlanarViewport,
  representationUID: string
): Types.ActorEntry | undefined {
  const actor = sliceSurfacesByViewport
    .get(viewport)
    ?.actors.get(representationUID);

  if (!actor) {
    return;
  }

  return { uid: representationUID, actor, representationUID };
}

export {
  addOrUpdateSurfaceSliceProp,
  getSurfaceSlicePropEntry,
  removeSurfaceSliceProps,
  showsSurfacesAsSliceProps,
};
