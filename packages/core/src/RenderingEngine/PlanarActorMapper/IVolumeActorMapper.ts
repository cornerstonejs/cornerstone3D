import type { ICamera, IVolumeInput, Point3 } from '../../types';
import type { BlendModes } from '../../enums';

export default interface IVolumeActorMapper {
  setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  getBlendMode(filterActorUIDs?: string[]): BlendModes;
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate?: boolean
  ): void;
  ensureClippingPlanesForActors(camera: ICamera): void;
  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void;
  resetSlabThickness(): void;
  getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: {
      normal: Point3;
      origin: Point3;
    }[];
  }[];
  renderToCanvas(): void;
  getIntensityFromWorld(point: Point3): number | undefined;
}
