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
 * Render modes (`PlanarRenderModeId`):
 *   - `vtkFrame` -- GPU path for single-image (stack) display via vtkImageMapper.
 *   - `canvasFrame` -- CPU path for single-image display on the 2D canvas.
 *   - `canvasCpuSlice` -- CPU path for volume slicing (samples a slice from the volume on the CPU).
 *   - `vtkGpuVolumeSlice` -- GPU path for volume slicing via vtkImageResliceMapper.
 *   - `vtkCpuSlice` -- volume slice sampled on the CPU, drawn via vtkImageMapper.
 */
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type {
  CPUFallbackEnabledElement,
  ICanvasActor,
  IImage,
  IImageVolume,
  VOIRange,
} from '../../../types';
import type { VOILUTFunctionType } from '../../../enums';
import type { MountedRendering } from '../ViewportArchitectureTypes';
import type { VolumeStrategyState } from '../../helpers/volumeStrategyLifecycle';
import type {
  PlanarViewState,
  PlanarDisplaySetAppearance,
} from './PlanarViewportTypes';
import type { PlanarSliceCacheStatistics } from './planarCpuSlice';
import type { PlanarRenderModeId } from './planarRenderModeIds';

/**
 * Mounted rendering state for the GPU single-image path (`vtkFrame`).
 *
 * Uses a vtkImageMapper + vtkImageSlice actor to display one DICOM image
 * at a time. The viewport swaps `currentImage` and rebuilds the VTK pipeline
 * when the slice index changes.
 */
export type PlanarVtkFrameRendering = MountedRendering<{
  renderMode: PlanarRenderModeId.VTK_FRAME;
  actorEntryUID: string;
  actor: vtkImageSlice;
  currentImage: IImage;
  mapper: vtkImageMapper;
  imageData: vtkImageData;
  /**
   * True when the image shown last got a new vtkImageData, because it is the
   * first image or its size, data type or number of components differs from
   * the image before it. False when its pixels went into the vtkImageData
   * that was there.
   */
  newImageData: boolean;
  useWorldCoordinateImageData?: boolean;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  /** Whether the image shown starts inverted, as a MONOCHROME1 image does. */
  defaultInvert?: boolean;
  /** The VOI LUT function of the image shown, from its metadata. */
  defaultVOILUTFunction?: VOILUTFunctionType;
  appearance?: PlanarDisplaySetAppearance;
  loadRequestId: number;
  // Target index of the most recent applyViewState request. Used by the
  // dedup check to avoid re-loading on no-op camera changes while still
  // letting back-to-back navigation calls (e.g. Next then Previous) issue
  // a fresh load even while a previous load is still in flight.
  lastRequestedImageIdIndex?: number;
  /**
   * The load of the image of the last request: it resolves when the image
   * is shown or its load failed.
   */
  imageLoad?: Promise<void>;
  /** The index of the last request when its image failed to load. */
  failedImageIdIndex?: number;
}>;

/**
 * Mounted rendering state for the CPU single-image path (`canvasFrame`).
 *
 * Uses the Cornerstone CPU fallback renderer (`CPUFallbackEnabledElement`)
 * to draw a single image onto an offscreen canvas. The viewport reads
 * pixel data directly from the IImage and applies windowing / LUT on the CPU.
 */
export type PlanarCanvasFrameRendering = MountedRendering<{
  renderMode: PlanarRenderModeId.CANVAS_FRAME;
  actorEntryUID: string;
  enabledElement: CPUFallbackEnabledElement;
  compatibilityActor: ICanvasActor;
  currentImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  /** Whether the image shown starts inverted, as a MONOCHROME1 image does. */
  defaultInvert?: boolean;
  /** The VOI LUT function of the image shown, from its metadata. */
  defaultVOILUTFunction?: VOILUTFunctionType;
  appearance?: PlanarDisplaySetAppearance;
  fitScale: number;
  loadRequestId: number;
  renderingInvalidated: boolean;
  // See PlanarVtkFrameRendering.lastRequestedImageIdIndex.
  lastRequestedImageIdIndex?: number;
  /**
   * The load of the image of the last request: it resolves when the image
   * is shown or its load failed.
   */
  imageLoad?: Promise<void>;
  /** The index of the last request when its image failed to load. */
  failedImageIdIndex?: number;
}>;

/**
 * Mounted rendering state for the CPU volume-slice path (`canvasCpuSlice`).
 *
 * Cuts the slice of the view plane out of the volume on the CPU with
 * `PlanarSliceSampler`, the sample step of the sampled slice path, and draws
 * it on the 2D canvas with `PlanarCpuSliceCanvas`, which uses the CPU
 * fallback pipeline for VOI, colormap and invert, and `CanvasActor` for a
 * labelmap. The sampler keeps the slice on screen and its neighbours, so a
 * change of the appearance, a pan or a zoom does not sample again.
 */
export type PlanarCanvasCpuSliceRendering = MountedRendering<{
  renderMode: PlanarRenderModeId.CANVAS_CPU_SLICE;
  actorEntryUID: string;
  compatibilityActor: ICanvasActor;
  imageVolume: IImageVolume;
  imageIds: string[];
  acquisitionOrientation?: PlanarViewState['orientation'];
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  renderingInvalidated: boolean;
  appearance?: PlanarDisplaySetAppearance;
  compositeActor?: boolean;
  pendingVolumeLoadCallback?: boolean;
  removeStreamingSubscriptions?: () => void;
  /**
   * The counts and timings of the sampler of this slice, for tests and
   * example pages, as
   * `viewport.bindings.get(displaySetId).rendering.getSliceCacheStatistics()`.
   */
  getSliceCacheStatistics(): PlanarSliceCacheStatistics;
  /**
   * True when the slab of the view is too large for the CPU, so the picture
   * is not that slab (the render plan reason `slabTooLarge`).
   */
  slabTooLarge?: boolean;
}>;

/**
 * Mounted rendering state for the GPU volume-slice path (`vtkGpuVolumeSlice`).
 *
 * Uses a vtkImageResliceMapper + vtkImageSlice actor to display an orthogonal
 * slab of the volume. Slice navigation updates the mapper slice plane to match
 * the current render camera focal point and view-plane normal.
 */
export type PlanarVtkGpuVolumeSliceRendering = MountedRendering<{
  renderMode: PlanarRenderModeId.VTK_GPU_VOLUME_SLICE;
  actorEntryUID: string;
  actor: vtkImageSlice;
  overlayOrder: number;
  imageVolume: IImageVolume;
  imageIds: string[];
  acquisitionOrientation?: PlanarViewState['orientation'];
  mapper: vtkImageResliceMapper;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  appearance?: PlanarDisplaySetAppearance;
  isSegmentationOverlay?: boolean;
  removeStreamingSubscriptions?: () => void;
  /**
   * The internal render path state: true while the acquired frame shows in
   * place of this slice (see `withAcquiredFrames`).
   */
  showsAcquiredFrame?: boolean;
}> &
  VolumeStrategyState;

/**
 * Mounted rendering state for the sampled slice path (`vtkCpuSlice`).
 *
 * Cuts the slice of the view plane out of the volume on the CPU and draws it
 * as a 2D image with a vtkImageMapper + vtkImageSlice actor. No 3D texture is
 * made. The fields match `PlanarVtkGpuVolumeSliceRendering` apart from the mapper.
 */
export type PlanarVtkCpuSliceRendering = MountedRendering<{
  renderMode: PlanarRenderModeId.VTK_CPU_SLICE;
  actorEntryUID: string;
  actor: vtkImageSlice;
  overlayOrder: number;
  imageVolume: IImageVolume;
  imageIds: string[];
  acquisitionOrientation?: PlanarViewState['orientation'];
  mapper: vtkImageMapper;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
  defaultVOIRange?: VOIRange;
  appearance?: PlanarDisplaySetAppearance;
  isSegmentationOverlay?: boolean;
  removeStreamingSubscriptions?: () => void;
  /**
   * The counts and timings of the sampler of this slice, for tests and
   * example pages, as
   * `viewport.bindings.get(displaySetId).rendering.getSliceCacheStatistics()`.
   */
  getSliceCacheStatistics(): PlanarSliceCacheStatistics;
  /**
   * True when the slab of the view is too large for the CPU, so the picture
   * is not that slab (the render plan reason `slabTooLarge`).
   */
  slabTooLarge?: boolean;
}>;

/**
 * Discriminated union of all planar rendering states.
 *
 * Discriminate on `renderMode` to narrow to a specific render path:
 * ```ts
 * if (rendering.renderMode === 'canvasCpuSlice') {
 *   // rendering is PlanarCanvasCpuSliceRendering
 * }
 * ```
 */
export type PlanarRendering =
  | PlanarVtkFrameRendering
  | PlanarCanvasFrameRendering
  | PlanarCanvasCpuSliceRendering
  | PlanarVtkGpuVolumeSliceRendering
  | PlanarVtkCpuSliceRendering;
