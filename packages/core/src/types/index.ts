// @see: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#-type-only-imports-and-export

import type ICamera from './ICamera';
import type IEnabledElement from './IEnabledElement';
import type ICache from './ICache';
import type IVolume from './IVolume';
import type { VOI, VOIRange } from './voi';
import type ImageLoaderFn from './ImageLoaderFn';
import type IImageVolume from './IImageVolume';
import type VolumeLoaderFn from './VolumeLoaderFn';
import type IRegisterImageLoader from './IRegisterImageLoader';
import type IStreamingVolumeProperties from './IStreamingVolumeProperties';
import type CustomEventType from './CustomEventType';
import type { IViewport, PublicViewportInput } from './IViewport';
import type { VolumeActor, Actor, ActorEntry } from './IActor';
import type {
  IImageLoadObject,
  IVolumeLoadObject,
  IGeometryLoadObject,
} from './ILoadObject';
import type Metadata from './Metadata';
import type OrientationVectors from './OrientationVectors';
import type Point2 from './Point2';
import type Point3 from './Point3';
import type Point4 from './Point4';
import type Mat3 from './Mat3';
import type Plane from './Plane';
import type IStreamingImageVolume from './IStreamingImageVolume';
import type ViewportInputOptions from './ViewportInputOptions';
import type IImageData from './IImageData';
import type CPUIImageData from './CPUIImageData';
import type { CPUImageData } from './CPUIImageData';
import type IImage from './IImage';
import type {
  PTScaling,
  Scaling,
  ScalingParameters,
} from './ScalingParameters';
import type StackViewportProperties from './StackViewportProperties';
import type VolumeViewportProperties from './VolumeViewportProperties';
import type IViewportId from './IViewportId';
import type FlipDirection from './FlipDirection';
import type ICachedImage from './ICachedImage';
import type ICachedVolume from './ICachedVolume';
import type IStackViewport from './IStackViewport';
import type IVolumeViewport from './IVolumeViewport';
import type ViewportPreset from './ViewportPreset';

// CPU types
import type CPUFallbackEnabledElement from './CPUFallbackEnabledElement';
import type CPUFallbackViewport from './CPUFallbackViewport';
import type CPUFallbackTransform from './CPUFallbackTransform';
import type CPUFallbackColormapData from './CPUFallbackColormapData';
import type CPUFallbackViewportDisplayedArea from './CPUFallbackViewportDisplayedArea';
import type CPUFallbackColormapsData from './CPUFallbackColormapsData';
import type CPUFallbackColormap from './CPUFallbackColormap';
import type TransformMatrix2D from './TransformMatrix2D';
import type CPUFallbackLookupTable from './CPUFallbackLookupTable';
import type CPUFallbackLUT from './CPUFallbackLUT';
import type CPUFallbackRenderingTools from './CPUFallbackRenderingTools';
import type { IVolumeInput, VolumeInputCallback } from './IVolumeInput';
import type * as EventTypes from './EventTypes';
import type IRenderingEngine from './IRenderingEngine';
import type ActorSliceRange from './ActorSliceRange';
import type ImageSliceData from './ImageSliceData';
import type IGeometry from './IGeometry';
import type {
  PublicContourSetData,
  ContourSetData,
  ContourData,
} from './ContourData';
import type ICachedGeometry from './ICachedGeometry';
import type { IContourSet } from './IContourSet';
import type { IContour } from './IContour';

export type {
  ICamera,
  IStackViewport,
  IVolumeViewport,
  IEnabledElement,
  ICache,
  IVolume,
  IViewportId,
  IImageVolume,
  IRenderingEngine,
  ScalingParameters,
  PTScaling,
  Scaling,
  IStreamingImageVolume,
  IImage,
  IImageData,
  CPUIImageData,
  CPUImageData,
  EventTypes,
  ImageLoaderFn,
  VolumeLoaderFn,
  IRegisterImageLoader,
  IStreamingVolumeProperties,
  IViewport,
  StackViewportProperties,
  VolumeViewportProperties,
  PublicViewportInput,
  VolumeActor,
  Actor,
  ActorEntry,
  IImageLoadObject,
  IVolumeLoadObject,
  IVolumeInput,
  VolumeInputCallback,
  ViewportPreset,
  //
  Metadata,
  OrientationVectors,
  Point2,
  Point3,
  Point4,
  Mat3,
  Plane,
  ViewportInputOptions,
  VOIRange,
  VOI,
  FlipDirection,
  ICachedImage,
  ICachedVolume,
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
  //
  CustomEventType,
  ActorSliceRange,
  ImageSliceData,
  // Geometry
  IGeometry,
  IGeometryLoadObject,
  ICachedGeometry,
  // Contour
  PublicContourSetData,
  ContourSetData,
  ContourData,
  IContourSet,
  IContour,
};
