import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { actorIsA } from '../../utilities/actorCheck';
import type { BlendModes } from '../../enums';
import type { ActorEntry, ICamera, IVolumeInput, Point3 } from '../../types';
import type IVolumeActorMapper from './IVolumeActorMapper';
import type { VolumeActorMapperContext } from './VolumeActorMapperContext';

export default class VolumeGPUActorMapper implements IVolumeActorMapper {
  constructor(private context: VolumeActorMapperContext) {}

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

  public renderToCanvas(): void {
    return;
  }

  public getIntensityFromWorld(point: Point3): number | undefined {
    return this.context.getIntensityFromWorldBase(point);
  }
}
