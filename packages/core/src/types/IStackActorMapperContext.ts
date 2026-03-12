import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type {
  ActorEntry,
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  IImageCalibration,
  ImagePixelModule,
  ImagePlaneModule,
  Mat3,
  Point3,
  Scaling,
  StackViewportProperties,
  VOIRange,
  ViewPresentation,
} from './index';

export interface IStackActorMapperImageDataMetaData {
  bitsAllocated: number;
  numberOfComponents: number;
  origin: Point3;
  direction: Mat3;
  dimensions: Point3;
  spacing: Point3;
  numVoxels: number;
  imagePlaneModule: ImagePlaneModule;
  imagePixelModule: ImagePixelModule;
}

export interface IStackCPUActorMapperContext {
  setCPUFallbackEnabledElement(element: CPUFallbackEnabledElement): void;
  getCPUFallbackEnabledElement(): CPUFallbackEnabledElement;
  getCPUActors(): ActorEntry[];
  setCPUActors(actors: ActorEntry[]): void;
  createActorMapper(image: IImage): ActorEntry['actor'];
  getCanvas(): HTMLCanvasElement;
  getModality(): string;
  getFrameOfReferenceUID(): string;
  getScaling(): Scaling;
  getHasPixelSpacing(): boolean;
  getCalibration(): IImageCalibration;
  getCSImage(): IImage;
  getCPUImagePixelData();
  setCPUImagePixelData(pixelData): void;
  worldToCanvasCPU(point: Point3): [number, number];
  canvasToWorldCPU(canvasPoint: [number, number], destPoint?: Point3): Point3;
  setVOIRange(voiRange: VOIRange): void;
  getImageDataMetadata(image: IImage): IStackActorMapperImageDataMetaData;
  getStackInvalidated(): boolean;
  setStackInvalidated(value: boolean): void;
  setCPURenderingInvalidated(value: boolean): void;
  getCPUFallbackError(method: string): Error;
}

export interface IStackGPUActorMapperContext {
  getRenderer(): vtkRenderer;
  getDefaultActor(): ActorEntry;
  getFrameOfReferenceUID(): string;
  getModality(): string;
  getScaling(): Scaling;
  getHasPixelSpacing(): boolean;
  getCalibration(): IImageCalibration;
  getCSImage(): IImage;
  getImageDataMetadata(image: IImage): IStackActorMapperImageDataMetaData;
  getImageDataObject(): vtkImageDataType;
  setImageDataObject(imageData: vtkImageDataType): void;
  getImagePlaneModule(imageId: string);
  addActors(actors: ActorEntry[]): void;
  getViewPresentation(): ViewPresentation;
  resetCameraNoEvent(): void;
  setViewPresentation(viewPresentation: ViewPresentation): void;
  setStackActorReInitialized(value: boolean): void;
  getActors(): ActorEntry[];
  getViewportId(): string;
  setActors(actors: ActorEntry[]): void;
  getCamera(): ICamera;
  setCameraNoEvent(camera: Partial<ICamera>): void;
  setInitialViewUp(viewUp: Point3): void;
  triggerCameraEvent(newCamera: ICamera, oldCamera: ICamera): void;
  getStackInvalidated(): boolean;
  setStackInvalidated(value: boolean): void;
  setVOI(voiRange: VOIRange, options?: unknown): void;
  setInitialInvert(value: boolean): void;
  getInvert(): boolean;
  getInitialInvert(): boolean;
  setInvertColor(invert: boolean): void;
  shouldPublishCalibratedEvent(): boolean;
  triggerCalibrationEvent(): void;
  getInterpolationType();
  setInterpolationType(interpolationType): void;
  getVOIUpdatedWithSetProperties(): boolean;
  getVOIRange(): VOIRange;
  setVOIRange(voiRange: VOIRange): void;
  isCurrentImagePTPrescaled(): boolean;
  getDefaultPTPrescaledVOIRange(): VOIRange;
  getVOIRangeForCurrentImage(): VOIRange;
  getActor(actorUID: string): ActorEntry;
  getProperties(): StackViewportProperties;
}
