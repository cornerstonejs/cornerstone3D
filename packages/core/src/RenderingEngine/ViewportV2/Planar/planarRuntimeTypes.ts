/**
 * planarRuntimeTypes -- Internal rendering state types for each planar
 * render path.
 *
 * Each type in this file is a discriminated-union member keyed by
 * `renderMode`. Together they form the `PlanarRendering` union that
 * PlanarViewportV2 and its adapters use to track the mounted state of a
 * single dataset.
 *
 * These types are intentionally NOT exported from the public API surface;
 * they are internal implementation details shared between the viewport
 * controller and its render-path adapters.
 *
 * Render modes:
 *   - `vtkImage`   -- GPU path for single-image (stack) display via vtkImageMapper.
 *   - `cpu2d`      -- CPU fallback for single-image display via CPUFallbackEnabledElement.
 *   - `cpuVolume`  -- CPU path for volume slicing (samples a slice from the volume on the CPU).
 *   - `vtkVolume`  -- GPU path for volume slicing via vtkVolumeMapper.
 */
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type { InterpolationType } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  IImageVolume,
  Point3,
  VOIRange,
} from '../../../types';
import type { MountedRendering } from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarDataPresentation,
} from './PlanarViewportV2Types';

/**
 * Mounted rendering state for the GPU single-image path (`vtkImage`).
 *
 * Uses a vtkImageMapper + vtkImageSlice actor to display one DICOM image
 * at a time. The viewport swaps `currentImage` and rebuilds the VTK pipeline
 * when the slice index changes.
 */
export type PlanarImageMapperRendering = MountedRendering<{
  renderMode: 'vtkImage';
  actor: vtkImageSlice;
  currentImage: IImage;
  mapper: vtkImageMapper;
  imageData: vtkImageData;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  dataPresentation?: PlanarDataPresentation;
  requestedCamera?: PlanarCamera;
  renderCamera?: ICamera;
  loadRequestId: number;
}>;

/**
 * Mounted rendering state for the CPU single-image path (`cpu2d`).
 *
 * Uses the Cornerstone CPU fallback renderer (`CPUFallbackEnabledElement`)
 * to draw a single image onto an offscreen canvas. The viewport reads
 * pixel data directly from the IImage and applies windowing / LUT on the CPU.
 */
export type PlanarCpuImageRendering = MountedRendering<{
  renderMode: 'cpu2d';
  enabledElement: CPUFallbackEnabledElement;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  dataPresentation?: PlanarDataPresentation;
  fitScale: number;
  loadRequestId: number;
  requestedCamera?: PlanarCamera;
  renderCamera?: ICamera;
  renderingInvalidated: boolean;
}>;

/**
 * Mounted rendering state for the CPU volume-slice path (`cpuVolume`).
 *
 * Samples an arbitrary orthogonal slice from an IImageVolume on the CPU
 * using `PlanarCPUVolumeSampler`, then renders the resulting IImage through
 * the CPU fallback pipeline. The `sampledSliceState` cache avoids
 * re-sampling when only presentation (VOI, colormap) changes.
 */
export type PlanarCpuVolumeRendering = MountedRendering<{
  renderMode: 'cpuVolume';
  actor: vtkVolume;
  mapper: vtkVolumeMapper;
  enabledElement?: CPUFallbackEnabledElement;
  imageVolume: IImageVolume;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  requestedCamera?: PlanarCamera;
  renderCamera?: ICamera;
  renderingInvalidated: boolean;
  dataPresentation?: PlanarDataPresentation;
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
 * Mounted rendering state for the GPU volume-slice path (`vtkVolume`).
 *
 * Uses a vtkVolumeMapper + vtkVolume actor with clipping planes to display
 * an orthogonal slab of the volume. Slice navigation moves the clipping
 * planes along the view-plane normal while the full volume stays mounted
 * in the GPU pipeline.
 */
export type PlanarVolumeMapperRendering = MountedRendering<{
  renderMode: 'vtkVolume';
  actor: vtkVolume;
  imageVolume: IImageVolume;
  mapper: vtkVolumeMapper;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  requestedCamera?: PlanarCamera;
  renderCamera?: ICamera;
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
  | PlanarVolumeMapperRendering;
