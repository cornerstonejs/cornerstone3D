import type {
  ActorEntry,
  ICamera,
  IImageVolume,
  IVolumeInput,
  Point3,
  VOIRange,
} from '../../types';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type {
  BlendModes,
  InterpolationType,
  VOILUTFunctionType,
} from '../../enums';

export interface VolumeActorMapperContext {
  setVolumesBase(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  addVolumesBase(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  getActors(): ActorEntry[];
  render(): void;
  getCamera(): ICamera;
  updateClippingPlanesForActors(camera: ICamera): void;
  triggerCameraModifiedEventIfNecessary(
    previousCamera: ICamera,
    updatedCamera: ICamera
  ): void;
  setOrientationOfClippingPlanes(
    vtkPlanes: vtkPlane[],
    slabThickness: number,
    viewPlaneNormal: Point3,
    focalPoint: Point3
  ): void;
  getSlicePlaneCoordinates(): {
    sliceIndex: number;
    point: Point3;
  }[];
  setCPUVolumes(
    volumeInputArray: IVolumeInput[],
    append?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  getViewportBlendMode(): BlendModes;
  setViewportBlendMode(blendMode: BlendModes): void;
  setViewportSlabThickness(slabThickness?: number): void;
  getRenderDefaultSlabThickness(): number;
  getCanvas(): HTMLCanvasElement;
  getCPUPrimaryVolume(volumeId?: string): IImageVolume | undefined;
  getCPUCameraBasis(camera: ICamera): {
    right: Point3;
    up: Point3;
    normal: Point3;
  };
  getViewportInterpolationType(): InterpolationType | undefined;
  getViewportVOILUTFunction(): VOILUTFunctionType | undefined;
  getViewportVOIRange(): VOIRange | undefined;
  getViewportInvert(): boolean;
  getViewportSlabThickness(): number | undefined;
  fillCanvasWithBackgroundColor(): void;
  logCPU(message: string, payload?: unknown): void;
  getIntensityFromWorldBase(point: Point3): number;
}
