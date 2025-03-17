import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { mat4, vec2, vec3 } from 'gl-matrix';
import eventTarget from '../eventTarget';
import * as metaData from '../metaData';
import { getImageDataMetadata as getImageDataMetadataUtil } from '../utilities/getImageDataMetadata';
import { coreLog } from '../utilities/logger';

import type {
  ActorEntry,
  CPUFallbackColormapData,
  CPUFallbackEnabledElement,
  CPUIImageData,
  ColormapPublic,
  EventTypes,
  FlipDirection,
  ICamera,
  IImage,
  IImageCalibration,
  IImageData,
  IImagesLoader,
  IStackInput,
  ImageLoadListener,
  Mat3,
  PTScaling,
  Point2,
  Point3,
  Scaling,
  StackViewportProperties,
  VOIRange,
  ViewReference,
  VolumeActor,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
  ViewportInput,
  ImagePixelModule,
  ImagePlaneModule,
  PixelDataTypedArray,
} from '../types';
import { actorIsA, isImageActor } from '../utilities/actorCheck';
import * as colormapUtils from '../utilities/colormap';
import {
  getTransferFunctionNodes,
  setTransferFunctionNodes,
} from '../utilities/transferFunctionUtils';
import * as windowLevelUtil from '../utilities/windowLevel';
import createLinearRGBTransferFunction from '../utilities/createLinearRGBTransferFunction';
import createSigmoidRGBTransferFunction from '../utilities/createSigmoidRGBTransferFunction';
import { updateVTKImageDataWithCornerstoneImage } from '../utilities/updateVTKImageDataWithCornerstoneImage';
import triggerEvent from '../utilities/triggerEvent';
import { isEqual } from '../utilities/isEqual';
import invertRgbTransferFunction from '../utilities/invertRgbTransferFunction';
import imageRetrieveMetadataProvider from '../utilities/imageRetrieveMetadataProvider';
import imageIdToURI from '../utilities/imageIdToURI';

import Viewport from './Viewport';
import drawImageSync from './helpers/cpuFallback/drawImageSync';
import { getImagePlaneModule } from '../utilities/buildMetadata';

import {
  Events,
  InterpolationType,
  MetadataModules,
  RequestType,
  VOILUTFunctionType,
  ViewportStatus,
} from '../enums';
import type { ImageLoaderOptions } from '../loaders/imageLoader';
import { loadAndCacheImage } from '../loaders/imageLoader';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import calculateTransform from './helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from './helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from './helpers/cpuFallback/rendering/getDefaultViewport';
import pixelToCanvas from './helpers/cpuFallback/rendering/pixelToCanvas';
import resize from './helpers/cpuFallback/rendering/resize';

import cache from '../cache/cache';
import { getConfiguration, getShouldUseCPURendering } from '../init';
import { createProgressive } from '../loaders/ProgressiveRetrieveImages';
import type {
  StackViewportNewStackEventDetail,
  StackViewportScrollEventDetail,
  VoiModifiedEventDetail,
} from '../types/EventTypes';
import type { ImageActor } from '../types/IActor';
import correctShift from './helpers/cpuFallback/rendering/correctShift';
import resetCamera from './helpers/cpuFallback/rendering/resetCamera';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import uuidv4 from '../utilities/uuidv4';
import getSpacingInNormalDirection from '../utilities/getSpacingInNormalDirection';
import getClosestImageId from '../utilities/getClosestImageId';

const EPSILON = 1; // Slice Thickness

export interface ImageDataMetaData {
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
// TODO This needs to be exposed as its published to consumers.
interface CalibrationEvent {
  rowScale?: number;
  columnScale?: number;
  scale: number;
  calibration: IImageCalibration;
}

interface SetVOIOptions {
  suppressEvents?: boolean;
  forceRecreateLUTFunction?: boolean;
  voiUpdatedWithSetProperties?: boolean;
}

const log = coreLog.getLogger('RenderingEngine', 'StackViewport');

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal viewport, and an associated target output `canvas`.
 *
 * StackViewports can be rendered using both GPU and a fallback CPU is the GPU
 * is not available (or low performance). Read more about StackViewports in
 * the documentation section of this website.
 */
class StackViewport extends Viewport {
  private imageIds: string[] = [];
  /**
   * The imageKeyToIndexMap maps the imageId values to the position in the imageIds
   * array.  It also contains the imageURI equivalent of each imageId to map
   * to the position in the imageIds array.  This allows checking for whether
   * the imageId or URI is present without having to scan the imageIds array.
   */
  private imageKeyToIndexMap = new Map<string, number>();

  // current imageIdIndex that is rendered in the viewport
  private currentImageIdIndex = 0;
  // the imageIdIndex that is targeted to be loaded with scrolling but has not initiated loading yet
  private targetImageIdIndex = 0;
  // setTimeout if the image is debounced to be loaded
  private debouncedTimeout: number;
  /**
   * The progressive retrieval configuration used for this viewport.
   */
  protected imagesLoader: IImagesLoader = this;

  // Viewport Properties
  private globalDefaultProperties: StackViewportProperties = {};
  private perImageIdDefaultProperties = new Map<
    string,
    StackViewportProperties
  >();

  private colormap: ColormapPublic | CPUFallbackColormapData;
  private voiRange: VOIRange;
  private voiUpdatedWithSetProperties = false;
  private VOILUTFunction: VOILUTFunctionType;
  //
  private invert = false;
  // The initial invert of the image loaded as opposed to the invert status of the viewport itself (see above).
  private initialInvert = false;
  private initialTransferFunctionNodes = null;
  private interpolationType: InterpolationType;

  // Helpers
  private _imageData: vtkImageDataType;
  private stackInvalidated = false; // if true -> new actor is forced to be created for the stack
  private _publishCalibratedEvent = false;
  private _calibrationEvent: CalibrationEvent;
  private _cpuFallbackEnabledElement?: CPUFallbackEnabledElement;
  // CPU fallback
  private useCPURendering: boolean;
  private cpuImagePixelData: PixelDataTypedArray;
  private cpuRenderingInvalidated: boolean;
  private csImage: IImage;

  // TODO: These should not be here and will be nuked
  public modality: string; // this is needed for tools
  public scaling: Scaling;

  // Camera properties
  private initialViewUp: Point3;

  // this flag is used to check
  // if the viewport used the same actor/mapper to render the image
  // or because of the new image inconsistency, a new actor/mapper was created
  public stackActorReInitialized: boolean;

  /**
   * Constructor for the StackViewport class
   * @param props - ViewportInput
   */
  constructor(props: ViewportInput) {
    super(props);
    this.scaling = {};
    this.modality = null;
    this.useCPURendering = getShouldUseCPURendering();
    this._configureRenderingPipeline();

    const result = this.useCPURendering
      ? this._resetCPUFallbackElement()
      : this._resetGPUViewport();

    this.currentImageIdIndex = 0;
    this.targetImageIdIndex = 0;
    this.resetCamera();

    this.initializeElementDisabledHandler();
  }

  public setUseCPURendering(value: boolean) {
    this.useCPURendering = value;
    this._configureRenderingPipeline(value);
  }

  static get useCustomRenderingPipeline(): boolean {
    return getShouldUseCPURendering();
  }

  public updateRenderingPipeline = () => {
    this._configureRenderingPipeline();
  };

  private _configureRenderingPipeline(value?: boolean) {
    this.useCPURendering = value ?? getShouldUseCPURendering();

    for (const key in this.renderingPipelineFunctions) {
      if (
        Object.prototype.hasOwnProperty.call(
          this.renderingPipelineFunctions,
          key
        )
      ) {
        const functions = this.renderingPipelineFunctions[key];
        this[key] = this.useCPURendering ? functions.cpu : functions.gpu;
      }
    }

    const result = this.useCPURendering
      ? this._resetCPUFallbackElement()
      : this._resetGPUViewport();
  }

  private _resetCPUFallbackElement() {
    this._cpuFallbackEnabledElement = {
      canvas: this.canvas,
      renderingTools: {},
      transform: new Transform(),
      viewport: { rotation: 0 },
    };
  }

  private _resetGPUViewport() {
    const renderer = this.getRenderer();
    const camera = vtkCamera.newInstance();
    renderer.setActiveCamera(camera);

    const viewPlaneNormal = [0, 0, -1] as Point3;
    this.initialViewUp = [0, -1, 0] as Point3;

    camera.setDirectionOfProjection(
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2]
    );
    camera.setViewUp(...this.initialViewUp);
    camera.setParallelProjection(true);
    camera.setThicknessFromFocalPoint(0.1);
    camera.setFreezeFocalPoint(true);
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: dimensions, direction, scalarData, vtkImageData, metadata, scaling
   */
  public getImageData: () => IImageData | CPUIImageData;

  /**
   * If the user has selected CPU rendering, return the CPU camera, otherwise
   * return the default camera
   * @returns The camera object.
   */
  public getCamera: () => ICamera;

  /**
   * Set the camera based on the provided camera object.
   * @param cameraInterface - The camera interface that will be used to
   * render the scene.
   */
  public setCamera: (
    cameraInterface: ICamera,
    storeAsInitialCamera?: boolean
  ) => void;

  public getRotation: () => number;

  /**
   * It sets the colormap to the default colormap.
   */
  public unsetColormap: () => void;

  /**
   * Resets the camera for the stack viewport.
   * This method adjusts the camera to fit the image in the viewport,
   * potentially resetting pan, zoom, and other view parameters.
   *
   * @param options - Optional configuration for the reset operation
   * @param options.resetPan - Whether to reset the pan (default: true)
   * @param options.resetZoom - Whether to reset the zoom (default: true)
   * @returns boolean - True if the camera was reset successfully, false otherwise
   */
  public resetCamera: (options?: {
    resetPan?: boolean;
    resetZoom?: boolean;
    resetToCenter?: boolean;
    suppressEvents?: boolean;
  }) => boolean;

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s camera.
   *
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld: (canvasPos: Point2) => Point3;

  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas: (worldPos: Point3) => Point2;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns The `vtkRenderer` for the `Viewport`.
   */
  public getRenderer: () => vtkRenderer;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the default
   * actor which is the first actor in the renderer.
   * @returns An actor entry.
   */
  public getDefaultActor: () => ActorEntry;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  public getActors: () => ActorEntry[];
  /**
   * If the renderer is CPU based, throw an error. Otherwise, it returns the actor entry for the given actor UID.
   * @param actorUID - The unique ID of the actor you want to get.
   * @returns An ActorEntry object.
   */
  public getActor: (actorUID: string) => ActorEntry;

  /**
   * If the renderer is CPU-based, throw an error; otherwise, set the
   * actors in the viewport.
   * @param actors - An array of ActorEntry objects.
   */
  public setActors: (actors: ActorEntry[]) => void;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, add a list of actors to the viewport
   * @param actors - An array of ActorEntry objects.
   */
  public addActors: (actors: ActorEntry[]) => void;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, add the
   * actor to the viewport
   * @param actorEntry - The ActorEntry object that was created by the
   * user.
   */
  public addActor: (actorEntry: ActorEntry) => void;

  /**
   * It throws an error if the renderer is CPU based. Otherwise, it removes the actors from the viewport.
   */
  public removeAllActors: () => void;

  private setVOI: (voiRange: VOIRange, options?: SetVOIOptions) => void;

  protected setInterpolationType: (
    interpolationType: InterpolationType
  ) => void;

  private setInvertColor: (invert: boolean) => void;

  /**
   * Sets the colormap for the current viewport.
   * @param colormap - The colormap data to use.
   */
  private setColormap: (
    colormap: CPUFallbackColormapData | ColormapPublic
  ) => void;

  private initializeElementDisabledHandler() {
    eventTarget.addEventListener(
      Events.ELEMENT_DISABLED,
      function elementDisabledHandler() {
        clearTimeout(this.debouncedTimeout);

        eventTarget.removeEventListener(
          Events.ELEMENT_DISABLED,
          elementDisabledHandler
        );
      }
    );
  }

  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  public resize = (): void => {
    // GPU viewport resize is handled inside the RenderingEngine
    if (this.useCPURendering) {
      this._resizeCPU();
    }
  };

  private _resizeCPU = (): void => {
    if (this._cpuFallbackEnabledElement.viewport) {
      resize(this._cpuFallbackEnabledElement);
    }
  };

  private getImageDataGPU(): IImageData | undefined {
    const defaultActor = this.getDefaultActor();

    if (!defaultActor) {
      return;
    }

    if (!isImageActor(defaultActor)) {
      return;
    }

    const { actor } = defaultActor;
    const vtkImageData = actor.getMapper().getInputData();
    const csImage = this.csImage;

    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      get scalarData() {
        return csImage?.voxelManager.getScalarData();
      },
      imageData: actor.getMapper().getInputData(),
      metadata: {
        Modality: this.modality,
        FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      },
      scaling: this.scaling,
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: { ...csImage?.calibration, ...this.calibration },
      preScale: {
        ...csImage?.preScale,
      },
      voxelManager: csImage?.voxelManager,
    };
  }

  private getImageDataCPU(): CPUIImageData | undefined {
    const { metadata } = this._cpuFallbackEnabledElement;

    if (!metadata) {
      return;
    }

    const spacing = metadata.spacing;
    const csImage = this.csImage;
    return {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: {
        Modality: this.modality,
        FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      },
      scaling: this.scaling,
      imageData: {
        getDirection: () => metadata.direction,
        getDimensions: () => metadata.dimensions,
        getScalarData: () => this.cpuImagePixelData,
        getSpacing: () => spacing,
        worldToIndex: (point: Point3) => {
          const canvasPoint = this.worldToCanvasCPU(point);
          const pixelCoord = canvasToPixel(
            this._cpuFallbackEnabledElement,
            canvasPoint
          );
          return [pixelCoord[0], pixelCoord[1], 0];
        },
        indexToWorld: (point: Point3, destPoint?: Point3) => {
          const canvasPoint = pixelToCanvas(this._cpuFallbackEnabledElement, [
            point[0],
            point[1],
          ]);
          return this.canvasToWorldCPU(canvasPoint, destPoint);
        },
      },
      scalarData: this.cpuImagePixelData,
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: { ...csImage?.calibration, ...this.calibration },
      preScale: {
        ...csImage?.preScale,
      },
      voxelManager: csImage?.voxelManager,
    };
  }

  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   * @returns frameOfReferenceUID : string representing frame of reference id
   */
  public getFrameOfReferenceUID = (sliceIndex?: number): string =>
    this.getImagePlaneReferenceData(sliceIndex)?.FrameOfReferenceUID;

  /**
   * Returns the raw/loaded image being shown inside the stack viewport.
   */
  public getCornerstoneImage = (): IImage => this.csImage;

  /**
   * Creates imageMapper based on the provided vtkImageData and also creates
   * the imageSliceActor and connects it to the imageMapper.
   * For color stack images, it sets the independent components to be false which
   * is required in vtk.
   *
   * @param imageData - vtkImageData for the viewport
   * @returns actor vtkActor
   */
  private createActorMapper = (imageData) => {
    const mapper = vtkImageMapper.newInstance();
    mapper.setInputData(imageData);

    const actor = vtkImageSlice.newInstance();

    actor.setMapper(mapper);

    const { preferSizeOverAccuracy } = getConfiguration().rendering;

    if (preferSizeOverAccuracy) {
      mapper.setPreferSizeOverAccuracy(true);
    }

    if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false);
    }

    return actor;
  };

  /** Gets the number of slices */
  public getNumberOfSlices = (): number => {
    return this.imageIds.length;
  };

  /**
   * Checks the metadataProviders to see if a calibratedPixelSpacing is
   * given. If so, checks the actor to see if it needs to be modified, and
   * set the flags for imageCalibration if a new actor needs to be created
   *
   * @param imageId - imageId
   * @param imagePlaneModule - imagePlaneModule
   * @returns modified imagePlaneModule with the calibrated spacings
   */
  private calibrateIfNecessary(imageId, imagePlaneModule) {
    const calibration = metaData.get('calibratedPixelSpacing', imageId);
    const isUpdated = this.calibration !== calibration;
    const { scale } = calibration || {};
    this.hasPixelSpacing = scale > 0 || imagePlaneModule.rowPixelSpacing > 0;
    imagePlaneModule.calibration = calibration;

    if (!isUpdated) {
      return imagePlaneModule;
    }

    this.calibration = calibration;
    this._publishCalibratedEvent = true;
    this._calibrationEvent = {
      scale,
      calibration,
    } as CalibrationEvent;

    return imagePlaneModule;
  }

  /**
   * Update the default properties of the viewport and add properties by imageId if specified
   * @param ViewportProperties - The properties to set
   * @param imageId If given, we set the default properties only for this image index, if not
   * the default properties will be set for all imageIds
   */
  public setDefaultProperties(
    ViewportProperties: StackViewportProperties,
    imageId?: string
  ): void {
    if (imageId == null) {
      this.globalDefaultProperties = ViewportProperties;
    } else {
      this.perImageIdDefaultProperties.set(imageId, ViewportProperties);

      //If the viewport is the same imageIdI, we need to update the viewport
      if (this.getCurrentImageId() === imageId) {
        this.setProperties(ViewportProperties);
      }
    }
  }

  /**
   * Remove the global default properties of the viewport or remove default properties for an imageId if specified
   * @param imageId If given, we remove the default properties only for this imageID, if not
   * the global default properties will be removed
   */
  public clearDefaultProperties(imageId?: string): void {
    if (imageId == null) {
      this.globalDefaultProperties = {};
      this.resetProperties();
    } else {
      this.perImageIdDefaultProperties.delete(imageId);
      this.resetToDefaultProperties();
    }
  }

  /**
   Configures the properties of the viewport.
   This method allows customization of the viewport by setting attributes like
   VOI (Value of Interest), color inversion, interpolation type, and image rotation.
   If setProperties is called for the first time, the provided properties will
   become the default settings for all images in the stack in case the resetPropertiese need to be called
   @param properties - An object containing the properties to be set.
   @param properties.colormap - Specifies the colormap for the viewport.
   @param properties.voiRange - Defines the lower and upper Value of Interest (VOI) to be applied.
   @param properties.VOILUTFunction - Function to handle the application of a lookup table (LUT) to the VOI.
   @param properties.invert - A boolean value to toggle color inversion (true: inverted, false: not inverted).
   @param properties.interpolationType - Determines the interpolation method to be used (1: linear, 0: nearest-neighbor).
   @param properties.rotation - Specifies the image rotation angle in degrees.
   @param suppressEvents - A boolean value to control event suppression. If true, the related events will not be triggered. Default is false.
   */
  public setProperties(
    {
      colormap,
      voiRange,
      VOILUTFunction,
      invert,
      interpolationType,
    }: StackViewportProperties = {},
    suppressEvents = false
  ): void {
    this.viewportStatus = this.csImage
      ? ViewportStatus.PRE_RENDER
      : ViewportStatus.LOADING;

    // setting the global default properties to the viewport, since we can always
    // go back to the default properties by calling resetToDefaultProperties
    this.globalDefaultProperties = {
      colormap: this.globalDefaultProperties.colormap ?? colormap,
      voiRange: this.globalDefaultProperties.voiRange ?? voiRange,
      VOILUTFunction:
        this.globalDefaultProperties.VOILUTFunction ?? VOILUTFunction,
      invert: this.globalDefaultProperties.invert ?? invert,
      interpolationType:
        this.globalDefaultProperties.interpolationType ?? interpolationType,
    };

    if (typeof colormap !== 'undefined') {
      this.setColormap(colormap);
    }
    // if voi is not applied for the first time, run the setVOI function
    // which will apply the default voi based on the range
    if (typeof voiRange !== 'undefined') {
      const voiUpdatedWithSetProperties = true;
      this.setVOI(voiRange, { suppressEvents, voiUpdatedWithSetProperties });
    }

    if (typeof VOILUTFunction !== 'undefined') {
      this.setVOILUTFunction(VOILUTFunction, suppressEvents);
    }

    if (typeof invert !== 'undefined') {
      this.setInvertColor(invert);
    }

    if (typeof interpolationType !== 'undefined') {
      this.setInterpolationType(interpolationType);
    }
  }

  /**
   * Retrieve the viewport default properties
   * @param imageId If given, we retrieve the default properties of an image index if it exists
   * If not given,we return the global properties of the viewport
   * @returns viewport properties including voi, invert, interpolation type,
   */
  public getDefaultProperties = (imageId?: string): StackViewportProperties => {
    let imageProperties;
    if (imageId !== undefined) {
      imageProperties = this.perImageIdDefaultProperties.get(imageId);
    }

    if (imageProperties !== undefined) {
      return imageProperties;
    }

    return {
      ...this.globalDefaultProperties,
    };
  };

  /**
   * Retrieve the viewport properties
   * @returns viewport properties including voi, invert, interpolation type,
   */
  public getProperties = (): StackViewportProperties => {
    const {
      colormap,
      voiRange,
      VOILUTFunction,
      interpolationType,
      invert,
      voiUpdatedWithSetProperties,
    } = this;

    return {
      colormap,
      voiRange,
      VOILUTFunction,
      interpolationType,
      invert,
      isComputedVOI: !voiUpdatedWithSetProperties,
    };
  };

  public resetCameraForResize = (): boolean => {
    return this.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: true,
      suppressEvents: true,
    });
  };

  /**
   * Reset the viewport properties to the default values
   */
  public resetProperties(): void {
    this.cpuRenderingInvalidated = true;
    this.voiUpdatedWithSetProperties = false;
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    this.fillWithBackgroundColor();

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement.renderingTools = {};
    }

    this._resetProperties();

    this.render();
  }

  private _resetProperties() {
    let voiRange;
    if (this._isCurrentImagePTPrescaled()) {
      // if not set via setProperties; if it is a PT image and is already prescaled,
      // use the default range for PT
      voiRange = this._getDefaultPTPrescaledVOIRange();
    } else {
      // if not set via setProperties; if it is not a PT image or is not prescaled,
      // use the voiRange for the current image from its metadata if found
      // otherwise, use the cached voiRange
      voiRange = this._getVOIRangeForCurrentImage();
    }

    this.setVOI(voiRange);

    this.setInvertColor(this.initialInvert);

    this.setInterpolationType(InterpolationType.LINEAR);

    if (!this.useCPURendering) {
      const transferFunction = this.getTransferFunction();
      setTransferFunctionNodes(
        transferFunction,
        this.initialTransferFunctionNodes
      );

      const nodes = getTransferFunctionNodes(transferFunction);

      const RGBPoints = nodes.reduce((acc, node) => {
        acc.push(node[0], node[1], node[2], node[3]);
        return acc;
      }, []);

      const defaultActor = this.getDefaultActor();
      const matchedColormap = colormapUtils.findMatchingColormap(
        RGBPoints,
        defaultActor.actor
      );

      this.setColormap(matchedColormap);
    }
  }

  public resetToDefaultProperties(): void {
    this.cpuRenderingInvalidated = true;
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    this.fillWithBackgroundColor();

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement.renderingTools = {};
    }

    const currentImageId = this.getCurrentImageId();
    const properties =
      this.perImageIdDefaultProperties.get(currentImageId) ||
      this.globalDefaultProperties;

    if (properties.colormap?.name) {
      this.setColormap(properties.colormap);
    }

    let voiRange;
    if (properties.voiRange == undefined) {
      // if not set via setProperties; if it is not a PT image or is not prescaled,
      // use the voiRange for the current image from its metadata if found
      // otherwise, use the cached voiRange
      voiRange = this._getVOIRangeForCurrentImage();
    } else {
      voiRange = properties.voiRange;
    }

    this.setVOI(voiRange);

    this.setInterpolationType(InterpolationType.LINEAR);
    this.setInvertColor(false);

    this.render();
  }

  private _getVOIFromCache(): VOIRange {
    let voiRange;
    if (this.voiUpdatedWithSetProperties) {
      // use the cached voiRange if the voiRange is locked (if the user has
      // manually set the voi with tools or setProperties api)
      voiRange = this.voiRange;
    } else if (this._isCurrentImagePTPrescaled()) {
      // if not set via setProperties; if it is a PT image and is already prescaled,
      // use the default range for PT
      voiRange = this._getDefaultPTPrescaledVOIRange();
    } else {
      // if not set via setProperties; if it is not a PT image or is not prescaled,
      // use the voiRange for the current image from its metadata if found
      // otherwise, use the cached voiRange
      voiRange = this._getVOIRangeForCurrentImage() ?? this.voiRange;
    }

    return voiRange;
  }

  private _setPropertiesFromCache(): void {
    const voiRange = this._getVOIFromCache();
    const { interpolationType, invert } = this;

    this.setVOI(voiRange);
    this.setInterpolationType(interpolationType);
    this.setInvertColor(invert);
  }

  private getCameraCPU(): Partial<ICamera> {
    const { metadata, viewport } = this._cpuFallbackEnabledElement;

    if (!metadata) {
      return {};
    }

    const { direction } = metadata;

    // focalPoint and position of CPU camera is just a placeholder since
    // tools need focalPoint to be defined
    const viewPlaneNormal = direction.slice(6, 9).map((x) => -x) as Point3;
    let viewUp = direction.slice(3, 6).map((x) => -x) as Point3;

    // If camera is rotated, we need the correct rotated viewUp along the
    // viewPlaneNormal vector
    if (viewport.rotation) {
      const rotationMatrix = mat4.fromRotation(
        mat4.create(),
        (viewport.rotation * Math.PI) / 180,
        viewPlaneNormal
      );
      viewUp = vec3.transformMat4(
        vec3.create(),
        viewUp,
        rotationMatrix
      ) as Point3;
    }

    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    // Focal point is the center of the canvas in world coordinate by construction
    const canvasCenterWorld = this.canvasToWorld(canvasCenter);

    // parallel scale is half of the viewport height in the world units (mm)

    const topLeftWorld = this.canvasToWorld([0, 0]);
    const bottomLeftWorld = this.canvasToWorld([0, this.element.clientHeight]);

    const parallelScale = vec3.distance(topLeftWorld, bottomLeftWorld) / 2;

    return {
      parallelProjection: true,
      focalPoint: canvasCenterWorld,
      position: [0, 0, 0],
      parallelScale,
      scale: viewport.scale,
      viewPlaneNormal: [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ],
      viewUp: [viewUp[0], viewUp[1], viewUp[2]],
      flipHorizontal: this.flipHorizontal,
      flipVertical: this.flipVertical,
    };
  }

  private setCameraCPU(cameraInterface: ICamera): void {
    const { viewport, image } = this._cpuFallbackEnabledElement;
    const previousCamera = this.getCameraCPU();

    const { focalPoint, parallelScale, scale, flipHorizontal, flipVertical } =
      cameraInterface;

    const { clientHeight } = this.element;

    if (focalPoint) {
      const focalPointCanvas = this.worldToCanvasCPU(focalPoint);
      const focalPointPixel = canvasToPixel(
        this._cpuFallbackEnabledElement,
        focalPointCanvas
      );

      const prevFocalPointCanvas = this.worldToCanvasCPU(
        previousCamera.focalPoint
      );
      const prevFocalPointPixel = canvasToPixel(
        this._cpuFallbackEnabledElement,
        prevFocalPointCanvas
      );

      const deltaPixel = vec2.create();
      vec2.subtract(
        deltaPixel,
        vec2.fromValues(focalPointPixel[0], focalPointPixel[1]),
        vec2.fromValues(prevFocalPointPixel[0], prevFocalPointPixel[1])
      );

      const shift = correctShift(
        { x: deltaPixel[0], y: deltaPixel[1] },
        viewport
      );

      viewport.translation.x -= shift.x;
      viewport.translation.y -= shift.y;
    }

    if (parallelScale) {
      // We need to convert he parallelScale which has a physical meaning to
      // camera scale factor (since CPU works with scale). Since parallelScale represents
      // half of the height of the viewport in the world unit (mm), we can use that
      // to compute the scale factor which is the ratio of the viewport height in pixels
      // to the current rendered image height.
      const { rowPixelSpacing } = image;
      const scale = (clientHeight * rowPixelSpacing * 0.5) / parallelScale;

      viewport.scale = scale;
      viewport.parallelScale = parallelScale;
    }

    if (scale) {
      const { rowPixelSpacing } = image;
      viewport.scale = scale;
      viewport.parallelScale = (clientHeight * rowPixelSpacing * 0.5) / scale;
    }

    if (flipHorizontal !== undefined || flipVertical !== undefined) {
      this.setFlipCPU({ flipHorizontal, flipVertical });
    }

    // re-calculate the transforms
    this._cpuFallbackEnabledElement.transform = calculateTransform(
      this._cpuFallbackEnabledElement
    );

    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera: this.getCamera(),
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  }

  private getPanCPU(): Point2 {
    const { viewport } = this._cpuFallbackEnabledElement;

    return [viewport.translation.x, viewport.translation.y];
  }

  private setPanCPU(pan: Point2): void {
    const camera = this.getCameraCPU();

    this.setCameraCPU({
      ...camera,
      focalPoint: [...pan.map((p) => -p), 0] as Point3,
    });
  }

  private getZoomCPU(): number {
    const { viewport } = this._cpuFallbackEnabledElement;

    return viewport.scale;
  }

  private setZoomCPU(zoom: number): void {
    const camera = this.getCameraCPU();

    this.setCameraCPU({ ...camera, scale: zoom });
  }

  private setFlipCPU({ flipHorizontal, flipVertical }: FlipDirection): void {
    const { viewport } = this._cpuFallbackEnabledElement;

    if (flipHorizontal !== undefined) {
      viewport.hflip = flipHorizontal;
      this.flipHorizontal = viewport.hflip;
    }

    if (flipVertical !== undefined) {
      viewport.vflip = flipVertical;
      this.flipVertical = viewport.vflip;
    }
  }

  private getRotationCPU = (): number => {
    const { viewport } = this._cpuFallbackEnabledElement;
    return viewport.rotation;
  };

  /**
   * Gets the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   *
   * @returns the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   */
  private getRotationGPU = (): number => {
    const {
      viewUp: currentViewUp,
      viewPlaneNormal,
      flipVertical,
    } = this.getCameraNoRotation();

    // The initial view up vector without any rotation, but incorporating vertical flip.
    const initialViewUp = flipVertical
      ? vec3.negate(vec3.create(), this.initialViewUp)
      : this.initialViewUp;

    // The angle between the initial and current view up vectors.
    // TODO: check with VTK about rounding errors here.
    const initialToCurrentViewUpAngle =
      (vec3.angle(initialViewUp, currentViewUp) * 180) / Math.PI;

    // Now determine if initialToCurrentViewUpAngle is positive or negative by comparing
    // the direction of the initial/current view up cross product with the current
    // viewPlaneNormal.

    const initialToCurrentViewUpCross = vec3.cross(
      vec3.create(),
      initialViewUp,
      currentViewUp
    );

    // The sign of the dot product of the start/end view up cross product and
    // the viewPlaneNormal indicates a positive or negative rotation respectively.
    const normalDot = vec3.dot(initialToCurrentViewUpCross, viewPlaneNormal);

    return normalDot >= 0
      ? initialToCurrentViewUpAngle
      : (360 - initialToCurrentViewUpAngle) % 360;
  };

  protected setRotation = (rotation: number) => {
    const previousCamera = this.getCamera();

    if (this.useCPURendering) {
      this.setRotationCPU(rotation);
    } else {
      this.setRotationGPU(rotation);
    }

    if (this._suppressCameraModifiedEvents) {
      return;
    }

    // New camera after rotation
    const camera = this.getCamera();

    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  };

  private setVOILUTFunction(
    voiLUTFunction: VOILUTFunctionType,
    suppressEvents?: boolean
  ): void {
    if (this.useCPURendering) {
      throw new Error('VOI LUT function is not supported in CPU rendering');
    }

    // make sure the VOI LUT function is valid in the VOILUTFunctionType which is enum
    const newVOILUTFunction = this._getValidVOILUTFunction(voiLUTFunction);

    let forceRecreateLUTFunction = false;
    if (this.VOILUTFunction !== newVOILUTFunction) {
      forceRecreateLUTFunction = true;
    }

    this.VOILUTFunction = newVOILUTFunction;

    const { voiRange } = this.getProperties();
    this.setVOI(voiRange, { suppressEvents, forceRecreateLUTFunction });
  }

  private setRotationCPU(rotation: number): void {
    const { viewport } = this._cpuFallbackEnabledElement;
    viewport.rotation = rotation;
  }

  /**
   * The rotation that is being set is intended to be around the currently
   * display center of the image.  However, the roll operation does it around
   * another point which can result in the image disappearing.  The set/get
   * pan values move the center of rotation to the center of the image as
   * currently actually displayed.
   */
  private setRotationGPU(rotation: number): void {
    const panFit = this.getPan(this.fitToCanvasCamera);
    const pan = this.getPan();
    const panSub = vec2.sub([0, 0], panFit, pan) as Point2;
    this.setPan(panSub, false);
    const { flipVertical } = this.getCamera();

    // Moving back to zero rotation, for new scrolled slice rotation is 0 after camera reset
    const initialViewUp = flipVertical
      ? vec3.negate(vec3.create(), this.initialViewUp)
      : this.initialViewUp;

    this.setCameraNoEvent({
      viewUp: initialViewUp as Point3,
    });

    // rotating camera to the new value
    this.getVtkActiveCamera().roll(-rotation);
    const afterPan = this.getPan();
    const afterPanFit = this.getPan(this.fitToCanvasCamera);
    const newCenter = vec2.sub([0, 0], afterPan, afterPanFit);
    const newOffset = vec2.add([0, 0], panFit, newCenter) as Point2;
    this.setPan(newOffset, false);
  }

  private setInterpolationTypeGPU(interpolationType: InterpolationType): void {
    const defaultActor = this.getDefaultActor();

    if (!defaultActor) {
      return;
    }

    if (!isImageActor(defaultActor)) {
      return;
    }
    const { actor } = defaultActor;
    const volumeProperty = actor.getProperty();

    // @ts-ignore
    volumeProperty.setInterpolationType(interpolationType);

    this.interpolationType = interpolationType;
  }

  private setInterpolationTypeCPU(interpolationType: InterpolationType): void {
    const { viewport } = this._cpuFallbackEnabledElement;

    viewport.pixelReplication =
      interpolationType === InterpolationType.LINEAR ? false : true;

    this.interpolationType = interpolationType;
  }

  private setInvertColorCPU(invert: boolean): void {
    const { viewport } = this._cpuFallbackEnabledElement;

    if (!viewport) {
      return;
    }

    viewport.invert = invert;
    this.invert = invert;
  }

  private setInvertColorGPU(invert: boolean): void {
    const defaultActor = this.getDefaultActor();

    if (!defaultActor) {
      return;
    }

    if (!isImageActor(defaultActor)) {
      return;
    }

    // Duplicated logic to make sure typescript stops complaining
    // about vtkActor not having the correct property
    if (actorIsA(defaultActor, 'vtkVolume')) {
      const volumeActor = defaultActor.actor as VolumeActor;
      const tfunc = volumeActor.getProperty().getRGBTransferFunction(0);

      if ((!this.invert && invert) || (this.invert && !invert)) {
        invertRgbTransferFunction(tfunc);
      }
      this.invert = invert;
    } else if (actorIsA(defaultActor, 'vtkImageSlice')) {
      const imageSliceActor = defaultActor.actor as vtkImageSlice;
      const tfunc = imageSliceActor.getProperty().getRGBTransferFunction(0);

      if ((!this.invert && invert) || (this.invert && !invert)) {
        invertRgbTransferFunction(tfunc);
      }

      this.invert = invert;
    }
  }

  private setVOICPU(voiRange: VOIRange, options: SetVOIOptions = {}): void {
    const { suppressEvents = false } = options;
    // TODO: Account for VOILUTFunction
    const { viewport, image } = this._cpuFallbackEnabledElement;

    if (!viewport || !image) {
      return;
    }

    if (typeof voiRange === 'undefined') {
      const { windowWidth: ww, windowCenter: wc } = image;

      const wwToUse = Array.isArray(ww) ? ww[0] : ww;
      const wcToUse = Array.isArray(wc) ? wc[0] : wc;
      viewport.voi = {
        windowWidth: wwToUse,
        windowCenter: wcToUse,
        voiLUTFunction: image.voiLUTFunction,
      };

      const { lower, upper } = windowLevelUtil.toLowHighRange(
        wwToUse,
        wcToUse,
        image.voiLUTFunction
      );
      voiRange = { lower, upper };
    } else {
      const { lower, upper } = voiRange;
      const { windowCenter, windowWidth } = windowLevelUtil.toWindowLevel(
        lower,
        upper
      );

      if (!viewport.voi) {
        viewport.voi = {
          windowWidth: 0,
          windowCenter: 0,
          voiLUTFunction: image.voiLUTFunction,
        };
      }

      viewport.voi.windowWidth = windowWidth;
      viewport.voi.windowCenter = windowCenter;
    }

    this.voiRange = voiRange;
    const eventDetail: VoiModifiedEventDetail = {
      viewportId: this.id,
      range: voiRange,
    };

    if (!suppressEvents) {
      triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
    }
  }

  private getTransferFunction() {
    const defaultActor = this.getDefaultActor();

    if (!defaultActor) {
      return;
    }

    if (!isImageActor(defaultActor)) {
      return;
    }
    const imageActor = defaultActor.actor as ImageActor;

    return imageActor.getProperty().getRGBTransferFunction(0);
  }

  private setVOIGPU(voiRange: VOIRange, options: SetVOIOptions = {}): void {
    const {
      suppressEvents = false,
      forceRecreateLUTFunction = false,
      voiUpdatedWithSetProperties = false,
    } = options;

    if (
      voiRange &&
      this.voiRange &&
      this.voiRange.lower === voiRange.lower &&
      this.voiRange.upper === voiRange.upper &&
      !forceRecreateLUTFunction &&
      !this.stackInvalidated
    ) {
      return;
    }

    const defaultActor = this.getDefaultActor();
    if (!defaultActor) {
      return;
    }

    if (!isImageActor(defaultActor)) {
      return;
    }
    const imageActor = defaultActor.actor as ImageActor;

    let voiRangeToUse = voiRange;

    if (typeof voiRangeToUse === 'undefined') {
      const imageData = imageActor.getMapper().getInputData();
      const range = imageData.getPointData().getScalars().getRange();
      const maxVoiRange = { lower: range[0], upper: range[1] };
      voiRangeToUse = maxVoiRange;
    }

    // scaling logic here
    // https://github.com/Kitware/vtk-js/blob/master/Sources/Rendering/OpenGL/ImageMapper/index.js#L540-L549
    imageActor.getProperty().setUseLookupTableScalarRange(true);

    let transferFunction = imageActor.getProperty().getRGBTransferFunction(0);

    const isSigmoidTFun =
      this.VOILUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID;

    // use the old cfun if it exists for linear case
    if (isSigmoidTFun || !transferFunction || forceRecreateLUTFunction) {
      const transferFunctionCreator = isSigmoidTFun
        ? createSigmoidRGBTransferFunction
        : createLinearRGBTransferFunction;

      transferFunction = transferFunctionCreator(
        voiRangeToUse
      ) as vtkColorTransferFunction;

      if (this.invert) {
        invertRgbTransferFunction(transferFunction);
      }

      imageActor.getProperty().setRGBTransferFunction(0, transferFunction);
      this.initialTransferFunctionNodes =
        getTransferFunctionNodes(transferFunction);
    }

    if (!isSigmoidTFun) {
      // @ts-ignore vtk type error
      transferFunction.setRange(voiRangeToUse.lower, voiRangeToUse.upper);
    }

    this.voiRange = voiRangeToUse;

    // if voiRange is set by setProperties we need to lock it if it is not locked already
    if (!this.voiUpdatedWithSetProperties) {
      this.voiUpdatedWithSetProperties = voiUpdatedWithSetProperties;
    }

    if (suppressEvents) {
      return;
    }

    const eventDetail: VoiModifiedEventDetail = {
      viewportId: this.id,
      range: voiRangeToUse,
      VOILUTFunction: this.VOILUTFunction,
    };

    triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
  }

  /**
   * Adds scaling parameters to the viewport to be used along all slices
   *
   * @param imageIdScalingFactor - suvbw, suvlbm, suvbsa
   */
  private _addScalingToViewport(imageIdScalingFactor) {
    if (this.scaling.PT) {
      return;
    }

    // if don't exist
    // These ratios are constant across all frames, so only need one.
    const { suvbw, suvlbm, suvbsa } = imageIdScalingFactor;

    const ptScaling = {} as PTScaling;

    if (suvlbm) {
      ptScaling.suvbwToSuvlbm = suvlbm / suvbw;
    }

    if (suvbsa) {
      ptScaling.suvbwToSuvbsa = suvbsa / suvbw;
    }

    this.scaling.PT = ptScaling;
  }

  /**
   * Calculates image metadata based on the image object. It calculates normal
   * axis for the images, and output image metadata
   *
   * @param image - stack image containing cornerstone image
   * @returns image metadata: bitsAllocated, number of components, origin,
   *  direction, dimensions, spacing, number of voxels.
   */
  public getImageDataMetadata(image: IImage): ImageDataMetaData {
    // TODO: Creating a single image should probably not require a metadata provider.
    // We should define the minimum we need to display an image and it should live on
    // the Image object itself. Additional stuff (e.g. pixel spacing, direction, origin, etc)
    // should be optional and used if provided through a metadata provider.
    const imageId = image.imageId;
    const props = getImageDataMetadataUtil(image);

    const {
      numberOfComponents,
      origin,
      direction,
      dimensions,
      spacing,
      numVoxels,
      imagePixelModule,
      voiLUTFunction,
      modality,
      scalingFactor,
      calibration,
    } = props;

    if (modality === 'PT' && scalingFactor) {
      this._addScalingToViewport(scalingFactor);
    }

    this.modality = modality;
    const voiLUTFunctionEnum = this._getValidVOILUTFunction(voiLUTFunction);
    this.VOILUTFunction = voiLUTFunctionEnum;

    this.calibration = calibration;
    let imagePlaneModule = this._getImagePlaneModule(imageId);

    if (!this.useCPURendering) {
      imagePlaneModule = this.calibrateIfNecessary(imageId, imagePlaneModule);
    }

    return {
      bitsAllocated: imagePixelModule.bitsAllocated,
      numberOfComponents,
      origin,
      direction,
      dimensions,
      spacing,
      numVoxels,
      imagePlaneModule,
      imagePixelModule,
    };
  }

  /**
   * Matches images for overlay by comparing their orientation, position, and dimensions.
   * @param currentImageId - The ID of the current image.
   * @param targetOverlayImageId - The ID of the target overlay image.
   * @returns The ID of the matched image, or undefined if no match is found.
   */
  private matchImagesForOverlay(
    currentImageId: string,
    targetOverlayImageId: string
  ): string | undefined {
    const matchImagesForOverlay = (targetImageId: string) => {
      // Retrieve image plane metadata for both overlay and current images
      const overlayImagePlaneModule = metaData.get(
        MetadataModules.IMAGE_PLANE,
        targetOverlayImageId
      );
      const currentImagePlaneModule = metaData.get(
        MetadataModules.IMAGE_PLANE,
        targetImageId
      );

      const overlayOrientation =
        overlayImagePlaneModule.imageOrientationPatient;
      const currentOrientation =
        currentImagePlaneModule.imageOrientationPatient;

      if (overlayOrientation && currentOrientation) {
        // Compare image orientations
        const closeEnough = isEqual(
          overlayImagePlaneModule.imageOrientationPatient,
          currentImagePlaneModule.imageOrientationPatient
        );

        if (closeEnough) {
          // Compare image positions
          const referencePosition =
            overlayImagePlaneModule.imagePositionPatient;
          const currentPosition = currentImagePlaneModule.imagePositionPatient;

          if (referencePosition && currentPosition) {
            const closeEnough = isEqual(referencePosition, currentPosition);

            if (closeEnough) {
              // Compare image dimensions
              const referenceRows = overlayImagePlaneModule.rows;
              const referenceColumns = overlayImagePlaneModule.columns;
              const currentRows = currentImagePlaneModule.rows;
              const currentColumns = currentImagePlaneModule.columns;

              if (
                referenceRows === currentRows &&
                referenceColumns === currentColumns
              ) {
                return targetImageId;
              }
            }
          }
        }
      } else {
        // If orientation information is not available, compare dimensions only
        const referenceRows = overlayImagePlaneModule.rows;
        const referenceColumns = overlayImagePlaneModule.columns;
        const currentRows = currentImagePlaneModule.rows;
        const currentColumns = currentImagePlaneModule.columns;

        if (
          referenceRows === currentRows &&
          referenceColumns === currentColumns
        ) {
          return targetImageId;
        }
      }
    };

    return matchImagesForOverlay(currentImageId);
  }

  /**
   * Gets the view reference data for a given image slice.  This uses the
   * image plane module to read a default focal point/normal, and also returns
   * the referenced image id and the frame of reference uid.
   */
  public getImagePlaneReferenceData(
    sliceIndex = this.getCurrentImageIdIndex()
  ): ViewReference {
    const imageId = this.imageIds[sliceIndex];
    if (!imageId) {
      return;
    }
    const imagePlaneModule = metaData.get(MetadataModules.IMAGE_PLANE, imageId);
    if (!imagePlaneModule) {
      return;
    }
    const { imagePositionPatient, frameOfReferenceUID: FrameOfReferenceUID } =
      imagePlaneModule;
    let { rowCosines, columnCosines } = imagePlaneModule;
    // Values are null, not undefined, so need to assign instead of defaulting
    rowCosines ||= [1, 0, 0];
    columnCosines ||= [0, 1, 0];
    const viewPlaneNormal = vec3.cross(
      [0, 0, 0],
      columnCosines,
      rowCosines
    ) as Point3;
    return {
      FrameOfReferenceUID,
      viewPlaneNormal,
      cameraFocalPoint: imagePositionPatient as Point3,
      referencedImageId: imageId,
      sliceIndex,
    };
  }

  /**
   * Converts the image direction to camera viewUp and viewplaneNormal
   *
   * @param imageDataDirection - vtkImageData direction
   * @returns viewplane normal and viewUp of the camera
   */
  private _getCameraOrientation(imageDataDirection: Mat3): {
    viewPlaneNormal: Point3;
    viewUp: Point3;
  } {
    const viewPlaneNormal = imageDataDirection.slice(6, 9).map((x) => -x);

    const viewUp = imageDataDirection.slice(3, 6).map((x) => -x);
    return {
      viewPlaneNormal: [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ],
      viewUp: [viewUp[0], viewUp[1], viewUp[2]],
    };
  }

  createVTKImageData({
    origin,
    direction,
    dimensions,
    spacing,
    numberOfComponents,
    pixelArray,
  }) {
    const values = new pixelArray.constructor(pixelArray.length);

    // Todo: I guess nothing should be done for use16bit?
    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: numberOfComponents,
      values: values,
    });

    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(dimensions);
    imageData.setSpacing(spacing);
    imageData.setDirection(direction);
    imageData.setOrigin(origin);
    imageData.getPointData().setScalars(scalarArray);

    return imageData;
  }
  /**
   * Creates vtkImagedata based on the image object, it creates
   * empty scalar data for the image based on the metadata
   * tags (e.g., bitsAllocated)
   *
   * @param image - cornerstone Image object
   */
  private _createVTKImageData({
    origin,
    direction,
    dimensions,
    spacing,
    numberOfComponents,
    pixelArray,
  }): void {
    try {
      this._imageData = this.createVTKImageData({
        origin,
        direction,
        dimensions,
        spacing,
        numberOfComponents,
        pixelArray,
      });
    } catch (e) {
      log.error(e);
    }
  }

  /**
   * Sets the imageIds to be visualized inside the stack viewport. It accepts
   * list of imageIds, the index of the first imageId to be viewed. It is a
   * asynchronous function that returns a promise resolving to imageId being
   * displayed in the stack viewport.
   *
   *
   * @param imageIds - list of strings, that represents list of image Ids
   * @param currentImageIdIndex - number representing the index of the initial image to be displayed
   */
  public async setStack(
    imageIds: string[],
    currentImageIdIndex = 0
  ): Promise<string> {
    this._throwIfDestroyed();

    this.imageIds = imageIds;

    if (currentImageIdIndex > imageIds.length) {
      throw new Error(
        'Current image index is greater than the number of images in the stack'
      );
    }

    this.imageKeyToIndexMap.clear();
    imageIds.forEach((imageId, index) => {
      this.imageKeyToIndexMap.set(imageId, index);
      this.imageKeyToIndexMap.set(imageIdToURI(imageId), index);
    });
    this.currentImageIdIndex = currentImageIdIndex;
    this.targetImageIdIndex = currentImageIdIndex;
    const imageRetrieveConfiguration = metaData.get(
      imageRetrieveMetadataProvider.IMAGE_RETRIEVE_CONFIGURATION,
      imageIds[currentImageIdIndex],
      'stack'
    );

    this.imagesLoader = imageRetrieveConfiguration
      ? (imageRetrieveConfiguration.create || createProgressive)(
          imageRetrieveConfiguration
        )
      : this;

    // reset the stack
    this.stackInvalidated = true;
    this.flipVertical = false;
    this.flipHorizontal = false;
    this.voiRange = null;
    this.interpolationType = InterpolationType.LINEAR;
    this.invert = false;
    this.viewportStatus = ViewportStatus.LOADING;

    this.fillWithBackgroundColor();

    if (this.useCPURendering) {
      this._cpuFallbackEnabledElement.renderingTools = {};
      delete this._cpuFallbackEnabledElement.viewport.colormap;
    }

    const imageId = await this._setImageIdIndex(currentImageIdIndex);

    const eventDetail: StackViewportNewStackEventDetail = {
      imageIds,
      viewportId: this.id,
      element: this.element,
      currentImageIdIndex: currentImageIdIndex,
    };

    triggerEvent(this.element, Events.VIEWPORT_NEW_IMAGE_SET, eventDetail);

    return imageId;
  }

  /**
   * Throws an error if you are using a destroyed instance of the stack viewport
   */
  private _throwIfDestroyed() {
    if (this.isDisabled) {
      throw new Error(
        'The stack viewport has been destroyed and is no longer usable. Renderings will not be performed. If you ' +
          'are using the same viewportId and have re-enabled the viewport, you need to grab the new viewport instance ' +
          'using renderingEngine.getViewport(viewportId), instead of using your lexical scoped reference to the viewport instance.'
      );
    }
  }

  /**
   * It checks if the new image object matches the dimensions, spacing,
   * and direction of the previously displayed image in the viewport or not.
   * It returns a boolean
   *
   * @param image - Cornerstone Image object
   * @param imageData - vtkImageData
   * @returns boolean
   */
  private _checkVTKImageDataMatchesCornerstoneImage(
    image: IImage,
    imageData: vtkImageDataType
  ): boolean {
    if (!imageData) {
      return false;
    }
    const [xSpacing, ySpacing] = imageData.getSpacing();
    const [xVoxels, yVoxels] = imageData.getDimensions();
    const imagePlaneModule = this._getImagePlaneModule(image.imageId);
    const direction = imageData.getDirection();
    const rowCosines = direction.slice(0, 3);
    const columnCosines = direction.slice(3, 6);
    const dataType = imageData.getPointData().getScalars().getDataType();

    // using epsilon comparison for float numbers comparison.
    const isSameXSpacing = isEqual(xSpacing, image.columnPixelSpacing);
    const isSameYSpacing = isEqual(ySpacing, image.rowPixelSpacing);

    // using spacing, size, and direction only for now
    const isXSpacingValid =
      isSameXSpacing || (image.columnPixelSpacing === null && xSpacing === 1.0);
    const isYSpacingValid =
      isSameYSpacing || (image.rowPixelSpacing === null && ySpacing === 1.0);
    const isXVoxelsMatching = xVoxels === image.columns;
    const isYVoxelsMatching = yVoxels === image.rows;
    const isRowCosinesMatching = isEqual(
      imagePlaneModule.rowCosines,
      rowCosines as Point3
    );
    const isColumnCosinesMatching = isEqual(
      imagePlaneModule.columnCosines,
      columnCosines as Point3
    );
    const isDataTypeMatching =
      dataType === image.voxelManager.getScalarData().constructor.name;

    const result =
      isXSpacingValid &&
      isYSpacingValid &&
      isXVoxelsMatching &&
      isYVoxelsMatching &&
      isRowCosinesMatching &&
      isColumnCosinesMatching &&
      isDataTypeMatching;

    return result;
  }

  /**
   * It Updates the vtkImageData of the viewport with the new pixel data
   * from the provided image object.
   *
   * @param image - Cornerstone Image object
   */
  private _updateVTKImageDataFromCornerstoneImage(image: IImage): void {
    const imagePlaneModule = this._getImagePlaneModule(image.imageId);
    let origin = imagePlaneModule.imagePositionPatient;

    if (origin == null) {
      origin = [0, 0, 0];
    }

    this._imageData.setOrigin(origin);

    // Update the pixel data in the vtkImageData object with the pixelData
    // from the loaded Cornerstone image
    updateVTKImageDataWithCornerstoneImage(this._imageData, image);
  }

  /**
   * It uses imageLoadPoolManager to add request for the imageId. It loadsAndCache
   * the image and triggers the STACK_NEW_IMAGE when the request successfully retrieves
   * the image. Next, the volume actor gets updated with the new new retrieved image.
   *
   * @param imageId - string representing the imageId
   * @param imageIdIndex - index of the imageId in the imageId list
   */
  private _loadAndDisplayImage(
    imageId: string,
    imageIdIndex: number
  ): Promise<string> {
    return this.useCPURendering
      ? this._loadAndDisplayImageCPU(imageId, imageIdIndex)
      : this._loadAndDisplayImageGPU(imageId, imageIdIndex);
  }

  private _loadAndDisplayImageCPU(
    imageId: string,
    imageIdIndex: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 1. Load the image using the Image Loader
      function successCallback(
        image: IImage,
        imageIdIndex: number,
        imageId: string
      ) {
        // Perform this check after the image has finished loading
        // in case the user has already scrolled away to another image.
        // In that case, do not render this image.
        if (this.currentImageIdIndex !== imageIdIndex) {
          return;
        }

        const pixelData = image.voxelManager.getScalarData();

        // handle the case where the pixelData is a Float32Array
        // CPU path cannot handle it, it should be converted to Uint16Array
        // and via the Modality LUT we can display it properly
        const preScale = image.preScale;
        const scalingParams = preScale?.scalingParameters;

        const scaledWithNonIntegers =
          (preScale?.scaled && scalingParams?.rescaleIntercept % 1 !== 0) ||
          scalingParams?.rescaleSlope % 1 !== 0;

        if (pixelData instanceof Float32Array && scaledWithNonIntegers) {
          const floatMinMax = {
            min: image.maxPixelValue,
            max: image.minPixelValue,
          };
          const floatRange = Math.abs(floatMinMax.max - floatMinMax.min);
          const intRange = 65535;
          const slope = floatRange / intRange;
          const intercept = floatMinMax.min;
          const numPixels = pixelData.length;
          const intPixelData = new Uint16Array(numPixels);

          let min = 65535;

          let max = 0;

          for (let i = 0; i < numPixels; i++) {
            const rescaledPixel = Math.floor(
              (pixelData[i] - intercept) / slope
            );

            intPixelData[i] = rescaledPixel;
            min = Math.min(min, rescaledPixel);
            max = Math.max(max, rescaledPixel);
          }

          // reset the properties since basically the image has changed
          image.minPixelValue = min;
          image.maxPixelValue = max;
          image.slope = slope;
          image.intercept = intercept;
          image.getPixelData = () => intPixelData;

          image.preScale = {
            ...image.preScale,
            scaled: false,
          };
        }

        this._setCSImage(image);
        this.viewportStatus = ViewportStatus.PRE_RENDER;

        const eventDetail: EventTypes.StackNewImageEventDetail = {
          image,
          imageId,
          imageIdIndex,
          viewportId: this.id,
          renderingEngineId: this.renderingEngineId,
        };

        triggerEvent(this.element, Events.STACK_NEW_IMAGE, eventDetail);

        this._updateToDisplayImageCPU(image);

        // Todo: trigger an event to allow applications to hook into END of loading state
        // Currently we use loadHandlerManagers for this

        // Trigger the image to be drawn on the next animation frame
        this.render();

        // Update the viewport's currentImageIdIndex to reflect the newly
        // rendered image
        this.currentImageIdIndex = imageIdIndex;
        resolve(imageId);
      }

      function errorCallback(
        error: Error,
        imageIdIndex: number,
        imageId: string
      ) {
        const eventDetail = {
          error,
          imageIdIndex,
          imageId,
        };

        if (!this.suppressEvents) {
          triggerEvent(eventTarget, Events.IMAGE_LOAD_ERROR, eventDetail);
        }

        reject(error);
      }

      function sendRequest(imageId, imageIdIndex, options) {
        return loadAndCacheImage(imageId, options).then(
          (image) => {
            successCallback.call(this, image, imageIdIndex, imageId);
          },
          (error) => {
            errorCallback.call(this, error, imageIdIndex, imageId);
          }
        );
      }

      const priority = -5;
      const requestType = RequestType.Interaction;
      const additionalDetails = { imageId, imageIdIndex };
      const options = {
        useRGBA: true,
        requestType,
      };

      const eventDetail: EventTypes.PreStackNewImageEventDetail = {
        imageId,
        imageIdIndex,
        viewportId: this.id,
        renderingEngineId: this.renderingEngineId,
      };
      triggerEvent(this.element, Events.PRE_STACK_NEW_IMAGE, eventDetail);

      imageLoadPoolManager.addRequest(
        sendRequest.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority
      );
    });
  }

  public successCallback(imageId, image) {
    const imageIdIndex = this.imageIds.indexOf(imageId);
    // Todo: trigger an event to allow applications to hook into END of loading state
    // Currently we use loadHandlerManagers for this
    // Perform this check after the image has finished loading
    // in case the user has already scrolled away to another image.
    // In that case, do not render this image.
    if (this.currentImageIdIndex !== imageIdIndex) {
      return;
    }

    // If Photometric Interpretation is not the same for the next image we are trying to load
    // invalidate the stack to recreate the VTK imageData.  Get the PMI from
    // the base csImage if imageFrame isn't defined, which happens when the images
    // come from the volume
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csImgFrame = (this.csImage as any)?.imageFrame;
    const imgFrame = image?.imageFrame;
    const photometricInterpretation =
      csImgFrame?.photometricInterpretation ||
      this.csImage?.photometricInterpretation;
    const newPhotometricInterpretation =
      imgFrame?.photometricInterpretation || image?.photometricInterpretation;

    if (photometricInterpretation !== newPhotometricInterpretation) {
      this.stackInvalidated = true;
    }

    this._setCSImage(image);

    const eventDetail: EventTypes.StackNewImageEventDetail = {
      image,
      imageId,
      imageIdIndex,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    this._updateActorToDisplayImageId(image);
    triggerEvent(this.element, Events.STACK_NEW_IMAGE, eventDetail);

    // Trigger the image to be drawn on the next animation frame
    this.render();

    // Update the viewport's currentImageIdIndex to reflect the newly
    // rendered image
    this.currentImageIdIndex = imageIdIndex;
  }

  public errorCallback(imageId, permanent, error) {
    if (!permanent) {
      return;
    }
    const imageIdIndex = this.imageIds.indexOf(imageId);
    const eventDetail = {
      error,
      imageIdIndex,
      imageId,
    };

    triggerEvent(eventTarget, Events.IMAGE_LOAD_ERROR, eventDetail);
  }

  public getLoaderImageOptions(imageId: string) {
    const imageIdIndex = this.imageIds.indexOf(imageId);
    const { transferSyntaxUID } = metaData.get('transferSyntax', imageId) || {};

    const options = {
      useRGBA: false,
      transferSyntaxUID,
      priority: 5,
      requestType: RequestType.Interaction,
      additionalDetails: { imageId, imageIdIndex },
    };
    return options;
  }

  public async loadImages(
    imageIds: string[],
    listener: ImageLoadListener
  ): Promise<unknown> {
    const resultList = await Promise.allSettled(
      imageIds.map((imageId) => {
        const options = this.getLoaderImageOptions(
          imageId
        ) as ImageLoaderOptions;

        return loadAndCacheImage(imageId, options).then(
          (image) => {
            listener.successCallback(imageId, image);
            return imageId;
          },
          (error) => {
            listener.errorCallback(imageId, true, error);
            return imageId;
          }
        );
      })
    );
    const errorList = resultList.filter((item) => item.status === 'rejected');
    if (errorList && errorList.length) {
      const event = new CustomEvent(Events.IMAGE_LOAD_ERROR, {
        detail: errorList,
        cancelable: true,
      });
      eventTarget.dispatchEvent(event);
    }
    return resultList;
  }

  private _loadAndDisplayImageGPU(imageId: string, imageIdIndex: number) {
    const eventDetail: EventTypes.PreStackNewImageEventDetail = {
      imageId,
      imageIdIndex,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };
    triggerEvent(this.element, Events.PRE_STACK_NEW_IMAGE, eventDetail);

    return this.imagesLoader.loadImages([imageId], this).then((v) => {
      return imageId;
    });
  }

  /**
   * Renders the given Cornerstone image object in the viewport.
   * This method is intended to be used by utilities to render
   * an individual image, rather than by applications that want to display
   * a complete image stack. If you want to load and display a complete
   * image stack, use the setStack method instead of this one.
   *
   * The rendered image will appear in the viewport's element.
   * Use this method if you have other means of loading and the
   * cornerstone image object is already available.
   *
   * If you don't understand the difference between this method and
   * setStack, you probably want to use setStack.
   *
   * @param image - The Cornerstone image object to render.
   */
  public renderImageObject = (image) => {
    this._setCSImage(image);

    const renderFn = this.useCPURendering
      ? this._updateToDisplayImageCPU
      : this._updateActorToDisplayImageId;

    renderFn.call(this, image);
  };

  private _setCSImage = (image) => {
    image.isPreScaled = image.preScale?.scaled;
    this.csImage = image;
  };

  private _updateToDisplayImageCPU(image: IImage) {
    const metadata = this.getImageDataMetadata(image);

    const viewport = getDefaultViewport(
      this.canvas,
      image,
      this.modality,
      this._cpuFallbackEnabledElement.viewport.colormap
    );

    const { windowCenter, windowWidth, voiLUTFunction } = viewport.voi;
    this.voiRange = windowLevelUtil.toLowHighRange(
      windowWidth,
      windowCenter,
      voiLUTFunction
    );

    this._cpuFallbackEnabledElement.image = image;
    this._cpuFallbackEnabledElement.metadata = {
      ...metadata,
    };
    this.cpuImagePixelData = image.voxelManager.getScalarData();

    const viewportSettingToUse = Object.assign(
      {},
      viewport,
      this._cpuFallbackEnabledElement.viewport
    );

    // Important: this.stackInvalidated is different than cpuRenderingInvalidated. The
    // former is being used to maintain the previous state of the viewport
    // in the same stack, the latter is used to trigger drawImageSync
    this._cpuFallbackEnabledElement.viewport = this.stackInvalidated
      ? viewport
      : viewportSettingToUse;

    // used the previous state of the viewport, then stackInvalidated is set to false
    this.stackInvalidated = false;

    // new viewport is set to the current viewport, then cpuRenderingInvalidated is set to true
    this.cpuRenderingInvalidated = true;

    this._cpuFallbackEnabledElement.transform = calculateTransform(
      this._cpuFallbackEnabledElement
    );
  }

  public getSliceViewInfo(): {
    width: number;
    height: number;
    sliceIndex: number;
    slicePlane: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  } {
    throw new Error('Method not implemented.');
  }

  /**
   * This method is used to add images to the stack viewport.
   * It takes an array of stack inputs, each containing an imageId and an actor UID.
   * For each stack input, it retrieves the image from the cache and creates a VTK image data object.
   * It then creates an actor mapper for the image data and adds it to the list of actors.
   * Finally, it sets the actors for the stack viewport.
   *
   * @param  stackInputs - An array of stack inputs, each containing an image ID and an actor UID.
   */
  public addImages(stackInputs: IStackInput[]) {
    const actors = [];
    stackInputs.forEach((stackInput) => {
      const { imageId, ...rest } = stackInput;
      const image = cache.getImage(imageId);

      const { origin, dimensions, direction, spacing, numberOfComponents } =
        this.getImageDataMetadata(image);

      const imagedata = this.createVTKImageData({
        origin,
        dimensions,
        direction,
        spacing,
        numberOfComponents,
        pixelArray: image.voxelManager.getScalarData(),
      });
      const imageActor = this.createActorMapper(imagedata);
      if (imageActor) {
        actors.push({
          uid: stackInput.actorUID ?? uuidv4(),
          actor: imageActor,
          referencedId: imageId,
          ...rest,
        });
        if (stackInput.callback) {
          stackInput.callback({ imageActor, imageId: stackInput.imageId });
        }
      }
    });
    this.addActors(actors);
  }

  /**
   * It updates the volume actor with the retrieved cornerstone image.
   * It first checks if the new image has the same dimensions, spacings, and
   * dimensions of the previous one: 1) If yes, it updates the pixel data 2) if not,
   * it creates a whole new volume actor for the image.
   * Note: Camera gets reset for both situations. Therefore, each image renders at
   * its exact 3D location in the space, and both image and camera moves while scrolling.
   *
   * @param image - Cornerstone image
   * @returns
   */
  private _updateActorToDisplayImageId(image) {
    // This function should do the following:
    // - Get the existing actor's vtkImageData that is being used to render the current image and check if we can reuse the vtkImageData that is in place (i.e. do the image dimensions and data type match?)
    // - If we can reuse it, replace the scalar data under the hood
    // - If we cannot reuse it, create a new actor, remove the old one, and reset the camera

    // 2. Check if we can reuse the existing vtkImageData object, if one is present.
    const sameImageData = this._checkVTKImageDataMatchesCornerstoneImage(
      image,
      this._imageData
    );

    // const activeCamera = this.getRenderer().getActiveCamera();
    const viewPresentation = this.getViewPresentation();

    // Cache camera props so we can trigger one camera changed event after
    // The full transition.
    // const previousCameraProps = this.getCamera();
    if (sameImageData && !this.stackInvalidated) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._updateVTKImageDataFromCornerstoneImage(image);

      this.resetCameraNoEvent();
      this.setViewPresentation(viewPresentation);

      // set the flip and view up back to the previous value since the restore camera props
      // rely on the correct flip value
      // this.setCameraNoEvent({
      //   flipHorizontal: previousCameraProps.flipHorizontal,
      //   flipVertical: previousCameraProps.flipVertical,
      //   viewUp: previousCameraProps.viewUp,
      // });

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      // Todo: i'm not sure if this is needed
      // @ts-ignore: vtkjs incorrect typing
      // activeCamera.setFreezeFocalPoint(true);

      this._setPropertiesFromCache();
      this.stackActorReInitialized = false;

      return;
    }

    const {
      origin,
      direction,
      dimensions,
      spacing,
      numberOfComponents,
      imagePixelModule,
    } = this.getImageDataMetadata(image);

    // 3b. If we cannot reuse the vtkImageData object (either the first render
    // or the size has changed), create a new one

    const pixelArray = image.voxelManager.getScalarData();
    this._createVTKImageData({
      origin,
      direction,
      dimensions,
      spacing,
      numberOfComponents,
      pixelArray,
    });

    // Set the scalar data of the vtkImageData object from the Cornerstone
    // Image's pixel data
    this._updateVTKImageDataFromCornerstoneImage(image);

    // Create a VTK Image Slice actor to display the vtkImageData object
    const actor = this.createActorMapper(this._imageData);
    const oldActors = this.getActors();
    if (oldActors.length && oldActors[0].uid === this.id) {
      oldActors[0].actor = actor;
    } else {
      oldActors.unshift({ uid: this.id, actor });
    }
    this.setActors(oldActors);

    // Adjusting the camera based on slice axis. this is required if stack
    // contains various image orientations (axial ct, sagittal xray)
    const { viewPlaneNormal, viewUp } = this._getCameraOrientation(direction);

    const previousCamera = this.getCamera();
    this.setCameraNoEvent({ viewUp, viewPlaneNormal });

    // Setting this makes the following comment about resetCameraNoEvent not modifying viewUp true.
    this.initialViewUp = viewUp;

    // Reset the camera to point to the new slice location, reset camera doesn't
    // modify the direction of projection and viewUp
    this.resetCameraNoEvent();

    // set the view presentation back to the original one to restore the pan and zoom
    this.setViewPresentation(viewPresentation);

    this.triggerCameraEvent(this.getCamera(), previousCamera);

    // This is necessary to initialize the clipping range and it is not related
    // to our custom slabThickness.
    // @ts-ignore: vtkjs incorrect typing
    //Todo: i'm not sure if this is needed
    // activeCamera.setFreezeFocalPoint(true);

    const monochrome1 =
      imagePixelModule.photometricInterpretation === 'MONOCHROME1';

    // invalidate the stack so that we can set the voi range
    this.stackInvalidated = true;

    const voiRange = this._getInitialVOIRange(image);
    this.setVOI(voiRange, {
      forceRecreateLUTFunction: !!monochrome1,
    });

    this.initialInvert = !!monochrome1;

    // should carry over the invert color from the previous image if has been applied
    this.setInvertColor(this.invert || this.initialInvert);

    // Saving position of camera on render, to cache the panning
    this.stackInvalidated = false;

    this.stackActorReInitialized = true;

    if (this._publishCalibratedEvent) {
      this.triggerCalibrationEvent();
    }
  }

  private _getInitialVOIRange(image: IImage) {
    if (this.voiRange && this.voiUpdatedWithSetProperties) {
      return this.voiRange;
    }
    const { windowCenter, windowWidth, voiLUTFunction } = image;

    let voiRange = this._getVOIRangeFromWindowLevel(
      windowWidth,
      windowCenter,
      voiLUTFunction
    );

    // Get the range for the PT since if it is prescaled
    // we set a default range of 0-5
    voiRange = this._getPTPreScaledRange() || voiRange;

    return voiRange;
  }

  private _getPTPreScaledRange() {
    if (!this._isCurrentImagePTPrescaled()) {
      return undefined;
    }

    return this._getDefaultPTPrescaledVOIRange();
  }

  private _isCurrentImagePTPrescaled() {
    if (this.modality !== 'PT' || !this.csImage.isPreScaled) {
      return false;
    }

    if (!this.csImage.preScale?.scalingParameters.suvbw) {
      return false;
    }

    return true;
  }

  private _getDefaultPTPrescaledVOIRange() {
    return { lower: 0, upper: 5 };
  }

  private _getVOIRangeFromWindowLevel(
    windowWidth: number | number[],
    windowCenter: number | number[],
    voiLUTFunction: VOILUTFunctionType = VOILUTFunctionType.LINEAR
  ): { lower: number; upper: number } | undefined {
    let center, width;

    if (typeof windowCenter === 'number' && typeof windowWidth === 'number') {
      center = windowCenter;
      width = windowWidth;
    } else if (Array.isArray(windowCenter) && Array.isArray(windowWidth)) {
      center = windowCenter[0];
      width = windowWidth[0];
    }

    // If center and width are defined, convert them to low-high range
    if (center !== undefined && width !== undefined) {
      return windowLevelUtil.toLowHighRange(width, center, voiLUTFunction);
    }
  }

  /**
   * Loads the image based on the provided imageIdIndex
   * @param imageIdIndex - number represents imageId index
   */
  private async _setImageIdIndex(imageIdIndex: number): Promise<string> {
    if (imageIdIndex >= this.imageIds.length) {
      throw new Error(
        `ImageIdIndex provided ${imageIdIndex} is invalid, the stack only has ${this.imageIds.length} elements`
      );
    }

    // Update the state of the viewport to the new imageIdIndex;
    this.currentImageIdIndex = imageIdIndex;
    this.hasPixelSpacing = true;
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    // Todo: trigger an event to allow applications to hook into START of loading state
    // Currently we use loadHandlerManagers for this
    const imageId = await this._loadAndDisplayImage(
      this.imageIds[imageIdIndex],
      imageIdIndex
    );

    //Check if there is any existing specific options for images if not we don't
    //want to re-render the viewport to its default properties
    if (this.perImageIdDefaultProperties.size >= 1) {
      const defaultProperties = this.perImageIdDefaultProperties.get(imageId);
      if (defaultProperties !== undefined) {
        this.setProperties(defaultProperties);
      } else if (this.globalDefaultProperties !== undefined) {
        this.setProperties(this.globalDefaultProperties);
      }
    }

    return imageId;
  }

  private resetCameraCPU({
    resetPan = true,
    resetZoom = true,
  }: {
    resetPan?: boolean;
    resetZoom?: boolean;
  }) {
    const { image } = this._cpuFallbackEnabledElement;

    if (!image) {
      return;
    }

    resetCamera(this._cpuFallbackEnabledElement, resetPan, resetZoom);

    const { scale } = this._cpuFallbackEnabledElement.viewport;

    // canvas center is the focal point
    const { clientWidth, clientHeight } = this.element;
    const center: Point2 = [clientWidth / 2, clientHeight / 2];

    const centerWorld = this.canvasToWorldCPU(center);

    this.setCameraCPU({
      focalPoint: centerWorld,
      scale,
    });
  }

  private resetCameraGPU({ resetPan, resetZoom }): boolean {
    // Todo: we need to make the rotation a camera properties so that
    // we can reset it there, right now it is not possible to reset the rotation
    // without this

    // We do not know the ordering of various flips and rotations that have been applied,
    // so the rotation and flip must be reset together.
    this.setCamera({
      flipHorizontal: false,
      flipVertical: false,
      viewUp: this.initialViewUp,
    });

    // For stack Viewport we since we have only one slice
    // it should be enough to reset the camera to the center of the image
    const resetToCenter = true;
    return super.resetCamera({ resetPan, resetZoom, resetToCenter });
  }

  /**
   * It scrolls the stack of imageIds by the delta amount provided. If the debounce
   * flag is set, it will only scroll the stack if the delta is greater than the
   * debounceThreshold which is 40 milliseconds by default.
   * @param delta - number of indices to scroll, it can be positive or negative
   * @param debounce - whether to debounce the scroll event
   * @param loop - whether to loop the stack
   */
  public scroll(delta: number, debounce = true, loop = false): void {
    const imageIds = this.imageIds;

    const currentTargetImageIdIndex = this.targetImageIdIndex;
    const numberOfFrames = imageIds.length;

    let newTargetImageIdIndex = currentTargetImageIdIndex + delta;
    newTargetImageIdIndex = Math.max(0, newTargetImageIdIndex);

    if (loop) {
      newTargetImageIdIndex = newTargetImageIdIndex % numberOfFrames;
    } else {
      newTargetImageIdIndex = Math.min(
        numberOfFrames - 1,
        newTargetImageIdIndex
      );
    }

    this.targetImageIdIndex = newTargetImageIdIndex;

    const targetImageId = imageIds[newTargetImageIdIndex];

    const imageAlreadyLoaded = cache.isLoaded(targetImageId);

    // If image is already cached we want to scroll right away; however, if it is
    // not cached, we can debounce the scroll event to avoid firing multiple scroll
    // events for the images that might happen to be passing by (as a result of infinite
    // scrolling).
    if (imageAlreadyLoaded || !debounce) {
      this.setImageIdIndex(newTargetImageIdIndex);
    } else {
      clearTimeout(this.debouncedTimeout);
      this.debouncedTimeout = window.setTimeout(() => {
        this.setImageIdIndex(newTargetImageIdIndex);
      }, 40);
    }

    const eventData: StackViewportScrollEventDetail = {
      newImageIdIndex: newTargetImageIdIndex,
      imageId: targetImageId,
      direction: delta,
    };

    if (newTargetImageIdIndex !== currentTargetImageIdIndex) {
      triggerEvent(this.element, Events.STACK_VIEWPORT_SCROLL, eventData);
    }
  }

  /**
   * Loads the image based on the provided imageIdIndex. It is an Async function which
   * returns a promise that resolves to the imageId.
   *
   * @param imageIdIndex - number represents imageId index in the list of
   * provided imageIds in setStack
   */
  public setImageIdIndex(imageIdIndex: number): Promise<string> {
    this._throwIfDestroyed();

    // If we are already on this imageId index, stop here
    if (this.currentImageIdIndex === imageIdIndex) {
      return Promise.resolve(this.getCurrentImageId());
    }

    // Otherwise, get the imageId and attempt to display it
    const imageIdPromise = this._setImageIdIndex(imageIdIndex);

    return imageIdPromise;
  }

  /**
   * Calibrates the image with new metadata that has been added for imageId. To calibrate
   * a viewport, you should add your calibration data manually to
   * calibratedPixelSpacingMetadataProvider and call viewport.calibrateSpacing
   * for it get applied.
   *
   * @param imageId - imageId to be calibrated
   */
  public calibrateSpacing(imageId: string): void {
    const imageIdIndex = this.getImageIds().indexOf(imageId);
    this.stackInvalidated = true;
    this._loadAndDisplayImage(imageId, imageIdIndex);
  }

  private triggerCameraEvent(camera: ICamera, previousCamera: ICamera) {
    // Finally emit event for the full camera change cause during load image.
    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
    };

    if (!this.suppressEvents) {
      // For crosshairs to adapt to new viewport size
      triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
    }
  }

  private triggerCalibrationEvent() {
    // Update the indexToWorld and WorldToIndex for viewport
    const { imageData } = this.getImageData();
    // Finally emit event for the full camera change cause during load image.
    const eventDetail: EventTypes.ImageSpacingCalibratedEventDetail = {
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      imageId: this.getCurrentImageId(),
      // Todo: why do we need to pass imageData? isn't' indexToWorld and worldToIndex enough?
      imageData: imageData as vtkImageData,
      worldToIndex: imageData.getWorldToIndex() as mat4,
      ...this._calibrationEvent,
    };

    if (!this.suppressEvents) {
      // Let the tools know the image spacing has been calibrated
      triggerEvent(this.element, Events.IMAGE_SPACING_CALIBRATED, eventDetail);
    }

    this._publishCalibratedEvent = false;
  }

  public jumpToWorld(worldPos: Point3): boolean {
    const imageIds = this.getImageIds();
    const imageData = this.getImageData();
    const { direction, spacing } = imageData;

    const imageId = getClosestImageId(
      { direction: direction, spacing, imageIds },
      worldPos,
      this.getCamera().viewPlaneNormal
    );

    const index = imageIds.indexOf(imageId);

    if (index === -1) {
      return false;
    }

    this.setImageIdIndex(index);
    this.render();

    return true;
  }

  private canvasToWorldCPU = (
    canvasPos: Point2,
    worldPos: Point3 = [0, 0, 0]
  ): Point3 => {
    if (!this._cpuFallbackEnabledElement.image) {
      return;
    }
    // compute the pixel coordinate in the image
    const [px, py] = canvasToPixel(this._cpuFallbackEnabledElement, canvasPos);

    // convert pixel coordinate to world coordinate
    const { origin, spacing, direction } = this.getImageData();

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    // Calculate the world coordinate of the pixel
    vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0]);
    vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1]);

    return worldPos;
  };

  private worldToCanvasCPU = (worldPos: Point3): Point2 => {
    // world to pixel
    const { spacing, direction, origin } = this.getImageData();

    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    const diff = vec3.subtract(vec3.create(), worldPos, origin);

    const indexPoint: Point2 = [
      vec3.dot(diff, iVector) / spacing[0],
      vec3.dot(diff, jVector) / spacing[1],
    ];

    // pixel to canvas
    const canvasPoint = pixelToCanvas(
      this._cpuFallbackEnabledElement,
      indexPoint
    );
    return canvasPoint;
  };

  private canvasToWorldGPU = (canvasPos: Point2): Point3 => {
    const renderer = this.getRenderer();

    // Temporary setting the clipping range to the distance and distance + 0.1
    // in order to calculate the transformations correctly.
    // This is similar to the vtkSlabCamera isPerformingCoordinateTransformations
    // You can read more about it here there.
    const vtkCamera = this.getVtkActiveCamera();
    const crange = vtkCamera.getClippingRange();
    const distance = vtkCamera.getDistance();

    vtkCamera.setClippingRange(distance, distance + 0.1);

    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasPosWithDPR = [
      canvasPos[0] * devicePixelRatio,
      canvasPos[1] * devicePixelRatio,
    ];
    const displayCoord = [
      canvasPosWithDPR[0] + this.sx,
      canvasPosWithDPR[1] + this.sy,
    ];

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    // set clipping range back to original to be able
    vtkCamera.setClippingRange(crange[0], crange[1]);

    return [worldCoord[0], worldCoord[1], worldCoord[2]];
  };

  private worldToCanvasGPU = (worldPos: Point3): Point2 => {
    const renderer = this.getRenderer();

    // Temporary setting the clipping range to the distance and distance + 0.1
    // in order to calculate the transformations correctly.
    // This is similar to the vtkSlabCamera isPerformingCoordinateTransformations
    // You can read more about it here there.
    const vtkCamera = this.getVtkActiveCamera();
    const crange = vtkCamera.getClippingRange();
    const distance = vtkCamera.getDistance();

    vtkCamera.setClippingRange(distance, distance + 0.1);

    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
      renderer
    );

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const canvasCoord = [
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ] as Point2;

    // set clipping range back to original to be able
    vtkCamera.setClippingRange(crange[0], crange[1]);

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasCoordWithDPR = [
      canvasCoord[0] / devicePixelRatio,
      canvasCoord[1] / devicePixelRatio,
    ] as Point2;

    return canvasCoordWithDPR;
  };

  private _getVOIRangeForCurrentImage() {
    const { windowCenter, windowWidth, voiLUTFunction } = this.csImage;

    return this._getVOIRangeFromWindowLevel(
      windowWidth,
      windowCenter,
      voiLUTFunction
    );
  }

  private _getValidVOILUTFunction(
    voiLUTFunction: VOILUTFunctionType | unknown
  ): VOILUTFunctionType {
    if (
      !Object.values(VOILUTFunctionType).includes(
        voiLUTFunction as VOILUTFunctionType
      )
    ) {
      return VOILUTFunctionType.LINEAR;
    }
    return voiLUTFunction as VOILUTFunctionType;
  }

  /**
   * Returns the index of the imageId being renderer
   *
   * @returns currently shown imageId index
   */
  public getCurrentImageIdIndex = (): number => {
    return this.currentImageIdIndex;
  };

  /**
   * returns the slice index of the view
   * @returns slice index
   */
  public getSliceIndex = (): number => {
    return this.currentImageIdIndex;
  };

  /**
   * Returns information about the current slice view.
   * @returns An object containing the slice index and slice axis.
   * @throws Error if the view is oblique.
   */
  public getSliceInfo(): {
    sliceIndex: number;
    slicePlane: number;
    width: number;
    height: number;
  } {
    const sliceIndex = this.getSliceIndex();
    const { dimensions } = this.getImageData();
    return {
      width: dimensions[0],
      height: dimensions[1],
      sliceIndex,
      slicePlane: 2,
    };
  }

  /**
   * Determines if a given ViewReference is viewable in this StackViewport.
   *
   * @param viewRef - The ViewReference to check.
   * @param options - Additional options for compatibility checking.
   * @returns True if the ViewReference is viewable, false otherwise.
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    const testIndex = this.getCurrentImageIdIndex();
    const currentImageId = this.imageIds[testIndex];
    if (!currentImageId || !viewRef) {
      return false;
    }
    const { referencedImageId, multiSliceReference } = viewRef;

    // Optimize the return for the exact match cases
    if (referencedImageId) {
      if (referencedImageId === currentImageId) {
        return true;
      }
      viewRef.referencedImageURI ||= imageIdToURI(referencedImageId);
      const { referencedImageURI: referencedImageURI } = viewRef;
      const foundSliceIndex = this.imageKeyToIndexMap.get(referencedImageURI);
      if (options.asOverlay) {
        const matchedImageId = this.matchImagesForOverlay(
          currentImageId,
          referencedImageId
        );
        if (matchedImageId) {
          return true;
        }
      }
      if (foundSliceIndex === undefined) {
        return false;
      }
      if (options.withNavigation) {
        return true;
      }
      const rangeEndSliceIndex =
        multiSliceReference &&
        this.imageKeyToIndexMap.get(multiSliceReference.referencedImageId);
      return testIndex <= rangeEndSliceIndex && testIndex >= foundSliceIndex;
    }

    if (!super.isReferenceViewable(viewRef, options)) {
      return false;
    }

    if (viewRef.volumeId) {
      return options.asVolume;
    }

    // if camera focal point is provided, we can use that as a point
    // Todo: handle the case where the nearby project is not desired
    const { cameraFocalPoint } = viewRef;

    if (options.asNearbyProjection && cameraFocalPoint) {
      const { spacing, direction, origin } = this.getImageData();

      const viewPlaneNormal = direction.slice(6, 9) as Point3;

      const sliceThickness = getSpacingInNormalDirection(
        { direction, spacing },
        viewPlaneNormal
      );

      // Project the cameraFocalPoint onto the image plane
      const diff = vec3.subtract(vec3.create(), cameraFocalPoint, origin);
      const distanceToPlane = vec3.dot(diff, viewPlaneNormal);

      // Define a threshold (e.g., half the slice thickness)
      const threshold = sliceThickness / 2;

      if (Math.abs(distanceToPlane) <= threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets a standard target to show this image instance.
   * Returns undefined if the requested slice index is not available.
   *
   * If using sliceIndex for requesting a specific reference, the slice index MUST come
   * from the stack of image ids.  Using slice index from a volume or from a different
   * stack of images ids, EVEN if they contain the same set of images will result in
   * random images being chosen.
   */
  public getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const { sliceIndex = this.getCurrentImageIdIndex() } = viewRefSpecifier;
    const reference = super.getViewReference(viewRefSpecifier);
    const referencedImageId = this.getCurrentImageId(sliceIndex);
    if (!referencedImageId) {
      return;
    }
    reference.referencedImageId = referencedImageId;
    if (this.getCurrentImageIdIndex() !== sliceIndex) {
      const referenceData = this.getImagePlaneReferenceData(
        sliceIndex as number
      );
      if (!referenceData) {
        return;
      }
      Object.assign(reference, referenceData);
    }
    return reference;
  }

  /**
   * Applies the view reference, which may navigate the slice index and apply
   * other camera modifications.
   * Assumes that the slice index is correct for this viewport
   */
  public setViewReference(viewRef: ViewReference): void {
    if (!viewRef?.referencedImageId) {
      if (viewRef?.sliceIndex !== undefined) {
        this.scroll(viewRef.sliceIndex - this.targetImageIdIndex);
      }
      return;
    }
    const { referencedImageId } = viewRef;
    viewRef.referencedImageURI ||= imageIdToURI(referencedImageId);
    const { referencedImageURI: referencedImageURI } = viewRef;
    const sliceIndex = this.imageKeyToIndexMap.get(referencedImageURI);
    if (sliceIndex === undefined) {
      log.error(`No image URI found for ${referencedImageURI}`);
      return;
    }

    this.scroll(sliceIndex - this.targetImageIdIndex);
  }

  /**
   * Returns the imageId string for the specified view, using the
   * `imageId:<imageId>` URN format.
   */
  public getViewReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    const { sliceIndex = this.currentImageIdIndex } = specifier;
    return `imageId:${this.imageIds[sliceIndex]}`;
  }

  /**
   *
   * Returns the imageIdIndex that is targeted to be loaded, in case of debounced
   * loading (with scroll), the targetImageIdIndex is the latest imageId
   * index that is requested to be loaded but debounced.
   */
  public getTargetImageIdIndex = (): number => {
    return this.targetImageIdIndex;
  };

  public getSliceIndexForImage(reference: string | ViewReference) {
    if (!reference) {
      return;
    }
    if (typeof reference === 'string') {
      return this.imageKeyToIndexMap.get(reference);
    }
    if (reference.referencedImageId) {
      return this.imageKeyToIndexMap.get(reference.referencedImageId);
    }
    return;
  }

  /**
   * Returns the list of image Ids for the current viewport
   * @returns list of strings for image Ids
   */
  public getImageIds = (): string[] => {
    return this.imageIds;
  };

  /**
   * Returns the currently rendered imageId
   * @returns string for imageId
   */
  public getCurrentImageId = (
    index = this.getCurrentImageIdIndex()
  ): string => {
    return this.imageIds[index];
  };

  /**
   * Returns true if the viewport contains the given imageId
   * @param imageId - imageId
   * @returns boolean if imageId is in viewport
   */
  public hasImageId = (imageId: string): boolean => {
    return this.imageKeyToIndexMap.has(imageId);
  };

  /**
   * Returns true if the viewport contains the given imageURI (no data loader scheme)
   * @param imageURI - imageURI
   * @returns boolean if imageURI is in viewport
   */
  public hasImageURI = (imageURI: string): boolean => {
    return this.imageKeyToIndexMap.has(imageURI);
  };

  private getCPUFallbackError(method: string): Error {
    return new Error(
      `method ${method} cannot be used during CPU Fallback mode`
    );
  }

  private fillWithBackgroundColor() {
    const renderingEngine = this.getRenderingEngine();

    if (renderingEngine) {
      renderingEngine.fillCanvasWithBackgroundColor(
        this.canvas,
        this.options.background
      );
    }
  }

  public customRenderViewportToCanvas = () => {
    if (!this.useCPURendering) {
      throw new Error(
        'Custom cpu rendering pipeline should only be hit in CPU rendering mode'
      );
    }

    if (this._cpuFallbackEnabledElement.image) {
      drawImageSync(
        this._cpuFallbackEnabledElement,
        this.cpuRenderingInvalidated
      );
      // reset flags
      this.cpuRenderingInvalidated = false;
    } else {
      this.fillWithBackgroundColor();
    }

    return {
      canvas: this.canvas,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      viewportStatus: this.viewportStatus,
    };
  };

  private unsetColormapCPU() {
    delete this._cpuFallbackEnabledElement.viewport.colormap;
    this._cpuFallbackEnabledElement.renderingTools = {};

    this.cpuRenderingInvalidated = true;

    this.fillWithBackgroundColor();

    this.render();
  }

  private setColormapCPU(colormapData: CPUFallbackColormapData) {
    this.colormap = colormapData;
    const colormap = colormapUtils.getColormap(colormapData.name);

    this._cpuFallbackEnabledElement.viewport.colormap = colormap;
    this._cpuFallbackEnabledElement.renderingTools = {};

    this.fillWithBackgroundColor();
    this.cpuRenderingInvalidated = true;

    this.render();

    const eventDetail = {
      viewportId: this.id,
      colormap: colormapData,
    };
    triggerEvent(this.element, Events.COLORMAP_MODIFIED, eventDetail);
  }

  private setColormapGPU(colormap: ColormapPublic) {
    const ActorEntry = this.getDefaultActor();
    const actor = ActorEntry.actor as ImageActor;
    const actorProp = actor.getProperty();
    const rgbTransferFunction = actorProp.getRGBTransferFunction();

    const colormapObj =
      colormapUtils.getColormap(colormap.name) ||
      vtkColorMaps.getPresetByName(colormap.name);

    if (!rgbTransferFunction) {
      const cfun = vtkColorTransferFunction.newInstance();
      cfun.applyColorMap(colormapObj);
      cfun.setMappingRange(this.voiRange.lower, this.voiRange.upper);
      actorProp.setRGBTransferFunction(0, cfun);
    } else {
      rgbTransferFunction.applyColorMap(colormapObj);
      rgbTransferFunction.setMappingRange(
        this.voiRange.lower,
        this.voiRange.upper
      );
      actorProp.setRGBTransferFunction(0, rgbTransferFunction);
    }

    this.colormap = colormap;
    this.render();

    const eventDetail = {
      viewportId: this.id,
      colormap,
    };

    triggerEvent(this.element, Events.COLORMAP_MODIFIED, eventDetail);
  }

  private unsetColormapGPU() {
    // TODO -> vtk has full colormaps which are piecewise and frankly better?
    // Do we really want a pre defined 256 color map just for the sake of harmonization?
    throw new Error('unsetColormapGPU not implemented.');
  }

  // create default values for imagePlaneModule if values are undefined
  private _getImagePlaneModule(imageId: string): ImagePlaneModule {
    const imagePlaneModule = getImagePlaneModule(imageId);

    this.hasPixelSpacing =
      !imagePlaneModule.usingDefaultValues || this.calibration?.scale > 0;

    this.calibration ||= imagePlaneModule.calibration;

    return imagePlaneModule;
  }

  private renderingPipelineFunctions = {
    getImageData: {
      cpu: this.getImageDataCPU,
      gpu: this.getImageDataGPU,
    },
    setColormap: {
      cpu: this.setColormapCPU,
      gpu: this.setColormapGPU,
    },
    getCamera: {
      cpu: this.getCameraCPU,
      gpu: super.getCamera,
    },
    setCamera: {
      cpu: this.setCameraCPU,
      gpu: super.setCamera,
    },
    getPan: {
      cpu: this.getPanCPU,
      gpu: super.getPan,
    },
    setPan: {
      cpu: this.setPanCPU,
      gpu: super.setPan,
    },
    getZoom: {
      cpu: this.getZoomCPU,
      gpu: super.getZoom,
    },
    setZoom: {
      cpu: this.setZoomCPU,
      gpu: super.setZoom,
    },
    setVOI: {
      cpu: this.setVOICPU,
      gpu: this.setVOIGPU,
    },
    getRotation: {
      cpu: this.getRotationCPU,
      gpu: this.getRotationGPU,
    },
    setInterpolationType: {
      cpu: this.setInterpolationTypeCPU,
      gpu: this.setInterpolationTypeGPU,
    },
    setInvertColor: {
      cpu: this.setInvertColorCPU,
      gpu: this.setInvertColorGPU,
    },
    resetCamera: {
      cpu: (
        options: { resetPan?: boolean; resetZoom?: boolean } = {}
      ): boolean => {
        const { resetPan = true, resetZoom = true } = options;
        this.resetCameraCPU({ resetPan, resetZoom });
        return true;
      },
      gpu: (
        options: { resetPan?: boolean; resetZoom?: boolean } = {}
      ): boolean => {
        const { resetPan = true, resetZoom = true } = options;
        this.resetCameraGPU({ resetPan, resetZoom });
        return true;
      },
    },
    canvasToWorld: {
      cpu: this.canvasToWorldCPU,
      gpu: this.canvasToWorldGPU,
    },
    worldToCanvas: {
      cpu: this.worldToCanvasCPU,
      gpu: this.worldToCanvasGPU,
    },
    getRenderer: {
      cpu: () => this.getCPUFallbackError('getRenderer'),
      gpu: super.getRenderer,
    },
    getDefaultActor: {
      cpu: () => this.getCPUFallbackError('getDefaultActor'),
      gpu: super.getDefaultActor,
    },
    getActors: {
      cpu: () => this.getCPUFallbackError('getActors'),
      gpu: super.getActors,
    },
    getActor: {
      cpu: () => this.getCPUFallbackError('getActor'),
      gpu: super.getActor,
    },
    setActors: {
      cpu: () => this.getCPUFallbackError('setActors'),
      gpu: super.setActors,
    },
    addActors: {
      cpu: () => this.getCPUFallbackError('addActors'),
      gpu: super.addActors,
    },
    addActor: {
      cpu: () => this.getCPUFallbackError('addActor'),
      gpu: super.addActor,
    },
    removeAllActors: {
      cpu: () => this.getCPUFallbackError('removeAllActors'),
      gpu: super.removeAllActors,
    },
    unsetColormap: {
      cpu: this.unsetColormapCPU,
      gpu: this.unsetColormapGPU,
    },
  };
}

export default StackViewport;
