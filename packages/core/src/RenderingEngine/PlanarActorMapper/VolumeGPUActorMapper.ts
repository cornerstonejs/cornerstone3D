import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { actorIsA } from '../../utilities/actorCheck';
import snapFocalPointToSlice from '../../utilities/snapFocalPointToSlice';
import type { BlendModes } from '../../enums';
import type { ActorEntry, ICamera, IVolumeInput, Point3 } from '../../types';
import type {
  VolumeViewportScrollInfo,
  default as IVolumeActorMapper,
} from './IVolumeActorMapper';
import type { VolumeActorMapperContext } from './VolumeActorMapperContext';

export default class VolumeGPUActorMapper implements IVolumeActorMapper {
  constructor(private context: VolumeActorMapperContext) {}

  /**
   * Replaces viewport volume actors using the GPU pipeline.
   * @param volumeInputArray - Volumes to set on the viewport.
   * @param immediate - If true, render immediately after update.
   * @param suppressEvents - If true, skip event dispatch during setup.
   * @returns Promise resolved when actors are updated.
   */
  public setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.context.setVolumesBase(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /**
   * Appends volume actors using the GPU pipeline.
   * @param volumeInputArray - Volumes to append on the viewport.
   * @param immediate - If true, render immediately after update.
   * @param suppressEvents - If true, skip event dispatch during setup.
   * @returns Promise resolved when actors are appended.
   */
  public addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.context.addVolumesBase(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /**
   * Returns the effective blend mode for matching actors.
   * @param filterActorUIDs - Optional actor UID filter.
   * @returns Current blend mode.
   */
  public getBlendMode(filterActorUIDs?: string[]): BlendModes {
    const actorEntries = this.context.getActors();
    const actorForBlend =
      filterActorUIDs?.length > 0
        ? actorEntries.find((actorEntry) =>
            filterActorUIDs.includes(actorEntry.uid)
          )
        : actorEntries[0];

    return (
      actorForBlend?.blendMode ||
      // @ts-ignore vtk incorrect typing
      actorForBlend?.actor.getMapper().getBlendMode()
    );
  }

  /**
   * Sets the GPU mapper blend mode on selected actors.
   * @param blendMode - Blend mode to apply.
   * @param filterActorUIDs - Optional actor UID filter.
   * @param immediate - If true, triggers an immediate render.
   * @returns void
   */
  public setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs = [],
    immediate = false
  ): void {
    let actorEntries = this.context.getActors();

    if (filterActorUIDs?.length > 0) {
      actorEntries = actorEntries.filter((actorEntry: ActorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      const { actor } = actorEntry;
      const mapper = actor.getMapper();
      // @ts-ignore vtk incorrect typing
      mapper.setBlendMode?.(blendMode);
      actorEntry.blendMode = blendMode;
    });

    if (immediate) {
      this.context.render();
    }
  }

  /**
   * Ensures clipping planes exist for current actors and camera.
   * @param camera - Active camera.
   * @returns void
   */
  public ensureClippingPlanesForActors(camera: ICamera): void {
    const actorEntries = this.context.getActors();
    const { viewPlaneNormal, focalPoint } = camera;

    actorEntries.forEach((actorEntry) => {
      if (!actorEntry.actor) {
        return;
      }

      const mapper = actorEntry.actor.getMapper() as vtkMapper;
      const vtkPlanes = mapper.getClippingPlanes();

      if (vtkPlanes.length === 0 && !actorEntry?.clippingFilter) {
        const clipPlane1 = vtkPlane.newInstance();
        const clipPlane2 = vtkPlane.newInstance();
        const newVtkPlanes = [clipPlane1, clipPlane2];
        const slabThickness =
          actorEntry.slabThickness ??
          this.context.getRenderDefaultSlabThickness();

        this.context.setOrientationOfClippingPlanes(
          newVtkPlanes,
          slabThickness,
          viewPlaneNormal,
          focalPoint
        );

        mapper.addClippingPlane(clipPlane1);
        mapper.addClippingPlane(clipPlane2);
      }
    });
  }

  /**
   * Sets slab thickness on selected actors.
   * @param slabThickness - Requested slab thickness in world units.
   * @param filterActorUIDs - Optional actor UID filter.
   * @returns void
   */
  public setSlabThickness(slabThickness: number, filterActorUIDs = []): void {
    if (slabThickness < 0.1) {
      slabThickness = 0.1;
    }

    let actorEntries = this.context.getActors();

    if (filterActorUIDs?.length > 0) {
      actorEntries = actorEntries.filter((actorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      if (actorIsA(actorEntry, 'vtkVolume')) {
        actorEntry.slabThickness = slabThickness;
      }
    });

    const currentCamera = this.context.getCamera();
    this.context.updateClippingPlanesForActors(currentCamera);
    this.context.triggerCameraModifiedEventIfNecessary(
      currentCamera,
      currentCamera
    );
    this.context.setViewportSlabThickness(slabThickness);
  }

  /**
   * Resets slab thickness to the renderer default.
   * @returns void
   */
  public resetSlabThickness(): void {
    const actorEntries = this.context.getActors();
    const slabThickness = this.context.getRenderDefaultSlabThickness();

    actorEntries.forEach((actorEntry) => {
      if (actorIsA(actorEntry, 'vtkVolume')) {
        actorEntry.slabThickness = slabThickness;
      }
    });

    const currentCamera = this.context.getCamera();
    this.context.updateClippingPlanesForActors(currentCamera);
    this.context.triggerCameraModifiedEventIfNecessary(
      currentCamera,
      currentCamera
    );
    this.context.setViewportSlabThickness(undefined);
  }

  /**
   * Computes clipping planes for all slice coordinates.
   * @returns Slice-indexed clipping plane definitions.
   */
  public getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: {
      normal: Point3;
      origin: Point3;
    }[];
  }[] {
    const focalPoints = this.context.getSlicePlaneCoordinates();
    const { viewPlaneNormal } = this.context.getCamera();
    const slabThickness = this.context.getRenderDefaultSlabThickness();

    return focalPoints.map(({ point, sliceIndex }) => {
      const vtkPlanes = [vtkPlane.newInstance(), vtkPlane.newInstance()];

      this.context.setOrientationOfClippingPlanes(
        vtkPlanes,
        slabThickness,
        viewPlaneNormal,
        point
      );

      return {
        sliceIndex,
        planes: vtkPlanes.map((plane) => ({
          normal: plane.getNormal(),
          origin: plane.getOrigin(),
        })),
      };
    });
  }

  /**
   * Returns scroll bounds/state for the target volume.
   * @param volumeId - Target volume id.
   * @param useSlabThickness - If true, uses slab thickness as step size.
   * @returns Scroll state or undefined when unavailable.
   */
  public getScrollInfo(
    volumeId: string,
    useSlabThickness = false
  ): VolumeViewportScrollInfo | undefined {
    const { numScrollSteps, currentStepIndex } =
      this.context.getVolumeViewportScrollInfo(volumeId, useSlabThickness);

    return { numScrollSteps, currentStepIndex };
  }

  /**
   * Scrolls volume slicing plane along view normal.
   * @param volumeId - Target volume id.
   * @param delta - Number of scroll steps.
   * @param useSlabThickness - If true, uses slab thickness as step size.
   * @returns Scroll state after applying movement.
   */
  public scroll(
    volumeId: string,
    delta: number,
    useSlabThickness = false
  ): VolumeViewportScrollInfo | undefined {
    const { numScrollSteps, currentStepIndex, sliceRangeInfo } =
      this.context.getVolumeViewportScrollInfo(volumeId, useSlabThickness);

    if (!sliceRangeInfo || numScrollSteps === 0) {
      return { numScrollSteps, currentStepIndex };
    }

    const { sliceRange, spacingInNormalDirection, camera } = sliceRangeInfo;
    const { focalPoint, viewPlaneNormal, position } = camera;
    const { newFocalPoint, newPosition } = snapFocalPointToSlice(
      focalPoint,
      position,
      sliceRange,
      viewPlaneNormal,
      spacingInNormalDirection,
      delta
    );

    this.context.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
    });
    this.context.render();

    return { numScrollSteps, currentStepIndex };
  }

  /**
   * GPU mapper renders through VTK; no CPU canvas path required.
   * @returns void
   */
  public renderToCanvas(): void {
    return;
  }

  /**
   * Samples scalar intensity at world coordinate through base viewport implementation.
   * @param point - World coordinate.
   * @returns Scalar value if available.
   */
  public getIntensityFromWorld(point: Point3): number | undefined {
    return this.context.getIntensityFromWorldBase(point);
  }
}
