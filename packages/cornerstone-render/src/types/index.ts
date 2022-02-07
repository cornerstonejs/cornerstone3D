// @see: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#-type-only-imports-and-export

import type ICamera from './ICamera'
import type IEnabledElement from './IEnabledElement'
import type ICache from './ICache'
import type IVolume from './IVolume'
import type { VOI, VOIRange } from './voi'
import type ImageLoaderFn from './ImageLoaderFn'
import type IImageVolume from './IImageVolume'
import type VolumeLoaderFn from './VolumeLoaderFn'
import type IRegisterImageLoader from './IRegisterImageLoader'
import type IStreamingVolume from './IStreamingVolume'
import type {
  IViewport,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
} from './IViewport'
import type { VolumeActor, ActorEntry } from './IActor'
import type { ImageLoadObject, VolumeLoadObject } from './ILoadObject'
import type LibraryConfiguration from './LibraryConfiguration'
import type Metadata from './Metadata'
import type Orientation from './Orientation'
import type Point2 from './Point2'
import type Point3 from './Point3'
import type Point4 from './Point4'
import type IStreamingImageVolume from './IStreamingImageVolume'
import type ViewportInputOptions from './ViewportInputOptions'
import type IImageData from './IImageData'
import type CPUIImageData from './CPUIImageData'
import type IImage from './IImage'
import type {
  PetScaling,
  Scaling,
  ScalingParameters,
} from './ScalingParameters'
import type StackProperties from './StackProperties'
import type IViewportUID from './IViewportUID'
import type FlipDirection from './FlipDirection'

// CPU types
import type CPUFallbackEnabledElement from './CPUFallbackEnabledElement'
import type CPUFallbackViewport from './CPUFallbackViewport'
import type CPUFallbackTransform from './CPUFallbackTransform'
import type CPUFallbackColormapData from './CPUFallbackColormapData'
import type CPUFallbackViewportDisplayedArea from './CPUFallbackViewportDisplayedArea'
import type CPUFallbackColormapsData from './CPUFallbackColormapsData'
import type CPUFallbackColormap from './CPUFallbackColormap'
import type TransformMatrix2D from './TransformMatrix2D'
import type CPUFallbackLookupTable from './CPUFallbackLookupTable'
import type CPUFallbackLUT from './CPUFallbackLUT'
import type CPUFallbackRenderingTools from './CPUFallbackRenderingTools'

export type {
  ICamera,
  IEnabledElement,
  ICache,
  IVolume,
  IViewportUID,
  IImageVolume,
  ScalingParameters,
  PetScaling,
  Scaling,
  IStreamingImageVolume,
  IImage,
  IImageData,
  CPUIImageData,
  ImageLoaderFn,
  VolumeLoaderFn,
  IRegisterImageLoader,
  IStreamingVolume,
  IViewport,
  ViewportInput,
  StackProperties,
  PublicViewportInput,
  InternalViewportInput,
  VolumeActor,
  ActorEntry,
  ImageLoadObject,
  VolumeLoadObject,
  //
  LibraryConfiguration,
  Metadata,
  Orientation,
  Point2,
  Point3,
  Point4,
  ViewportInputOptions,
  VOIRange,
  VOI,
  FlipDirection,
  // CPU fallback types
  CPUFallbackEnabledElement,
  CPUFallbackViewport,
  CPUFallbackTransform,
  CPUFallbackColormapData,
  CPUFallbackViewportDisplayedArea,
  CPUFallbackColormapsData,
  CPUFallbackColormap,
  TransformMatrix2D,
  CPUFallbackLookupTable,
  CPUFallbackLUT,
  CPUFallbackRenderingTools,
}
