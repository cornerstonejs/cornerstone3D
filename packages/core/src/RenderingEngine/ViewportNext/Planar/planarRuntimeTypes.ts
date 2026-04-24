/**
 * planarRuntimeTypes -- Internal rendering state types for each planar
 * render path.
 *
 * Each type in this file is a discriminated-union member keyed by
 * `renderMode`. Together they form the `PlanarRendering` union that
 * PlanarViewport and its adapters use to track the mounted state of a
 * single dataset.
 *
 * These types are intentionally NOT exported from the public API surface;
 * they are internal implementation details shared between the viewport
 * controller and its render-path adapters.
 *
 * Render modes:
 *   - `vtkImage`   -- GPU path for single-image (stack) display via vtkImageMapper.
 *   - `cpuImage`      -- CPU fallback for single-image display via CPUFallbackEnabledElement.
 *   - `cpuVolume`  -- CPU path for volume slicing (samples a slice from the volume on the CPU).
 *   - `vtkVolumeSlice` -- GPU path for volume slicing via vtkImageResliceMapper.
 */
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type { InterpolationType } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  ActorRenderMode,
  ICanvasActor,
  IImage,
  IImageVolume,
  Point3,
  VOIRange,
} from '../../../types';
import type { MountedRendering } from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarDataPresentation,
} from './PlanarViewportTypes';

/**
 * Mounted rendering state for the GPU single-image path (`vtkImage`).
 *
 * Uses a vtkImageMapper + vtkImageSlice actor to display one DICOM image
 * at a time. The viewport swaps `currentImage` and rebuilds the VTK pipeline
 * when the slice index changes.
 */
export type PlanarImageMapperRendering = MountedRendering<{
  renderMode: ActorRenderMode.VTK_IMAGE;
  actor: vtkImageSlice;
  currentImage: IImage;
  mapper: vtkImageMapper;
  imageData: vtkImageData;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  dataPresentation?: PlanarDataPresentation;
  loadRequestId: number;
}>;

/**
 * Mounted rendering state for the CPU single-image path (`cpuImage`).
 *
 * Uses the Cornerstone CPU fallback renderer (`CPUFallbackEnabledElement`)
 * to draw a single image onto an offscreen canvas. The viewport reads
 * pixel data directly from the IImage and applies windowing / LUT on the CPU.
 */
export type PlanarCpuImageRendering = MountedRendering<{
  renderMode: ActorRenderMode.CPU_IMAGE;
  enabledElement: CPUFallbackEnabledElement;
  compatibilityActor: ICanvasActor;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  dataPresentation?: PlanarDataPresentation;
  fitScale: number;
  loadRequestId: number;
  renderingInvalidated: boolean;
}>;

/**
 * Mounted rendering state for the CPU volume-slice path (`cpuVolume`).
 *
 * Samples an arbitrary orthogonal slice from an IImageVolume on the CPU
 * using `PlanarCPUVolumeSampler`, then renders the resulting IImage through
 * the CPU fallback pipeline and `CanvasActor`. The `sampledSliceState` cache avoids
 * re-sampling when only presentation (VOI, colormap) changes.
 */
export type PlanarCpuVolumeRendering = MountedRendering<{
  renderMode: ActorRenderMode.CPU_VOLUME;
  compatibilityActor: ICanvasActor;
  enabledElement?: CPUFallbackEnabledElement;
  imageVolume: IImageVolume;
  imageIds: string[];
  acquisitionOrientation?: PlanarCamera['orientation'];
  layerCanvas: HTMLCanvasElement;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  renderingInvalidated: boolean;
  dataPresentation?: PlanarDataPresentation;
  compositeActor?: boolean;
  sampledSliceState?: {
    image: IImage;
    focalPoint: Point3;
    translationReferenceFocalPoint: Point3;
    right: Point3;
    up: Point3;
    normal: Point3;
    spacingInNormalDirection: number;
    canvasWidth: number;
    canvasHeight: number;
    interpolationType: InterpolationType;
  };
  pendingVolumeLoadCallback?: boolean;
  removeStreamingSubscriptions?: () => void;
}>;

/**
 * Mounted rendering state for the GPU volume-slice path (`vtkVolumeSlice`).
 *
 * Uses a vtkImageResliceMapper + vtkImageSlice actor to display an orthogonal
 * slab of the volume. Slice navigation updates the mapper slice plane to match
 * the current render camera focal point and view-plane normal.
 */
export type PlanarVolumeSliceRendering = MountedRendering<{
  renderMode: ActorRenderMode.VTK_VOLUME_SLICE;
  actor: vtkImageSlice;
  overlayOrder: number;
  imageVolume: IImageVolume;
  imageIds: string[];
  acquisitionOrientation?: PlanarCamera['orientation'];
  mapper: vtkImageResliceMapper;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  dataPresentation?: PlanarDataPresentation;
  removeStreamingSubscriptions?: () => void;
}>;

/**
 * Discriminated union of all planar rendering states.
 *
 * Discriminate on `renderMode` to narrow to a specific render path:
 * ```ts
 * if (rendering.renderMode === 'cpuVolume') {
 *   // rendering is PlanarCpuVolumeRendering
 * }
 * ```
 */
export type PlanarRendering =
  | PlanarImageMapperRendering
  | PlanarCpuImageRendering
  | PlanarCpuVolumeRendering
  | PlanarVolumeSliceRendering;
