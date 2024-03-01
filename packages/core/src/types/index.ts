// @see: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#-type-only-imports-and-export
import type Cornerstone3DConfig from './Cornerstone3DConfig';
import type ICamera from './ICamera';
import type IEnabledElement from './IEnabledElement';
import type ICache from './ICache';
import type { IVolume } from './IVolume';
import type { VOI, VOIRange } from './voi';
import type DisplayArea from './displayArea';
import type ImageLoaderFn from './ImageLoaderFn';
import type IImageVolume from './IImageVolume';
import type IDynamicImageVolume from './IDynamicImageVolume';
import type VolumeLoaderFn from './VolumeLoaderFn';
import type IRegisterImageLoader from './IRegisterImageLoader';
import type IStreamingVolumeProperties from './IStreamingVolumeProperties';
import type CustomEventType from './CustomEventType';
import type {
  IViewport,
  PublicViewportInput,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
  ViewReference,
} from './IViewport';
import type {
  VolumeActor,
  Actor,
  ActorEntry,
  ImageActor,
  ICanvasActor,
} from './IActor';
import type {
  IImageLoadObject,
  IVolumeLoadObject,
  IGeometryLoadObject,
} from './ILoadObject';
import type Metadata from './Metadata';
import type OrientationVectors from './OrientationVectors';
import type AABB2 from './AABB2';
import type AABB3 from './AABB3';
import type Point2 from './Point2';
import type Point3 from './Point3';
import type Point4 from './Point4';
import type { PointsXYZ } from './Point3';
import type Mat3 from './Mat3';
import type Plane from './Plane';
import type IStreamingImageVolume from './IStreamingImageVolume';
import type ViewportInputOptions from './ViewportInputOptions';
import type IImageData from './IImageData';
import type IImageCalibration from './IImageCalibration';
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
import type { IStackInput, StackInputCallback } from './IStackInput';
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
import type { PublicSurfaceData, SurfaceData } from './SurfaceData';
import type ICachedGeometry from './ICachedGeometry';
import type { IContourSet } from './IContourSet';
import type { IContour } from './IContour';
import type RGB from './RGB';
import { ColormapPublic, ColormapRegistration } from './Colormap';
import type { ViewportProperties } from './ViewportProperties';
import type {
  PixelDataTypedArray,
  PixelDataTypedArrayString,
} from './PixelDataTypedArray';
import type { ImagePixelModule } from './ImagePixelModule';
import type { ImagePlaneModule } from './ImagePlaneModule';
import type { AffineMatrix } from './AffineMatrix';
export type {
  RetrieveStage,
  RetrieveOptions,
  RangeRetrieveOptions,
  StreamingRetrieveOptions,
  NearbyFrames,
  IRetrieveConfiguration,
  IImagesLoader,
} from './IRetrieveConfiguration';
import type { ImageLoadListener } from './ImageLoadListener';
import type { Color, ColorLUT } from './Color';
import type VideoViewportProperties from './VideoViewportProperties';
import type IVideoViewport from './IVideoViewport';
import type {
  InternalVideoCamera,
  VideoViewportInput,
} from './VideoViewportTypes';
import { ISurface } from './ISurface';
import type BoundsIJK from './BoundsIJK';
import type { ImageVolumeProps } from './ImageVolumeProps';
import type { VolumeProps } from './VolumeProps';
import type BoundsLPS from './BoundsLPS';
// Sometimes the type is needed rather than the class, so import
// the type only here.
import type PointsManager from '../utilities/PointsManager';

export type {
  // config
  Cornerstone3DConfig,
  //
  ICamera,
  IStackViewport,
  IVideoViewport,
  IVolumeViewport,
  IEnabledElement,
  ICache,
  IVolume,
  IViewportId,
  IImageVolume,
  ImageVolumeProps,
  IDynamicImageVolume,
  IRenderingEngine,
  ScalingParameters,
  PTScaling,
  PointsManager,
  Scaling,
  IStreamingImageVolume,
  IImage,
  IImageData,
  IImageCalibration,
  CPUIImageData,
  CPUImageData,
  EventTypes,
  ImageLoaderFn,
  VolumeLoaderFn,
  IRegisterImageLoader,
  IStreamingVolumeProperties,
  IViewport,
  ViewReference,
  ReferenceCompatibleOptions,
  ViewReferenceSpecifier,
  StackViewportProperties,
  VolumeViewportProperties,
  ViewportProperties,
  PublicViewportInput,
  VolumeActor,
  Actor,
  ActorEntry,
  ImageActor,
  ICanvasActor,
  IImageLoadObject,
  IVolumeLoadObject,
  IVolumeInput,
  VolumeInputCallback,
  IStackInput,
  StackInputCallback,
  ViewportPreset,
  //
  Metadata,
  OrientationVectors,
  AABB2,
  AABB3,
  Point2,
  Point3,
  PointsXYZ,
  Point4,
  Mat3,
  Plane,
  ViewportInputOptions,
  VideoViewportProperties,
  VOIRange,
  VOI,
  DisplayArea,
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
  // Surface
  PublicSurfaceData,
  SurfaceData,
  ISurface,
  // Color
  RGB,
  ColormapPublic,
  ColormapRegistration,
  // PixelData
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  ImagePixelModule,
  ImagePlaneModule,
  AffineMatrix,
  ImageLoadListener,
  // video
  InternalVideoCamera,
  VideoViewportInput,
  BoundsIJK,
  BoundsLPS,
  Color,
  ColorLUT,
  VolumeProps,
};
