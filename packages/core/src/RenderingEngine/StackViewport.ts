import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { mat4, vec2, vec3 } from 'gl-matrix';
import _cloneDeep from 'lodash.clonedeep';
import eventTarget from '../eventTarget';
import * as metaData from '../metaData';
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
  IStackViewport,
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
} from '../types';
import {
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
  ViewportInput,
} from '../types/IViewport';
import {
  actorIsA,
  colormap as colormapUtils,
  createSigmoidRGBTransferFunction,
  imageIdToURI,
  imageRetrieveMetadataProvider,
  invertRgbTransferFunction,
  isEqual,
  isImageActor,
  triggerEvent,
  updateVTKImageDataWithCornerstoneImage,
  windowLevel as windowLevelUtil,
} from '../utilities';
import Viewport from './Viewport';
import { getColormap } from './helpers/cpuFallback/colors/index';
import drawImageSync from './helpers/cpuFallback/drawImageSync';

import {
  Events,
  InterpolationType,
  MetadataModules,
  RequestType,
  VOILUTFunctionType,
  ViewportStatus,
} from '../enums';
import { ImageLoaderOptions, loadAndCacheImage } from '../loaders/imageLoader';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import calculateTransform from './helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from './helpers/cpuFallback/rendering/canvasToPixel';
import getDefaultViewport from './helpers/cpuFallback/rendering/getDefaultViewport';
import pixelToCanvas from './helpers/cpuFallback/rendering/pixelToCanvas';
import resize from './helpers/cpuFallback/rendering/resize';

import cache from '../cache';
import { getConfiguration, getShouldUseCPURendering } from '../init';
import { createProgressive } from '../loaders/ProgressiveRetrieveImages';
import {
  ImagePixelModule,
  ImagePlaneModule,
  PixelDataTypedArray,
} from '../types';
import {
  StackViewportNewStackEventDetail,
  StackViewportScrollEventDetail,
  VoiModifiedEventDetail,
} from '../types/EventTypes';
import { ImageActor } from '../types/IActor';
import createLinearRGBTransferFunction from '../utilities/createLinearRGBTransferFunction';
import {
  getTransferFunctionNodes,
  setTransferFunctionNodes,
} from '../utilities/transferFunctionUtils';
import correctShift from './helpers/cpuFallback/rendering/correctShift';
import resetCamera from './helpers/cpuFallback/rendering/resetCamera';
import { Transform } from './helpers/cpuFallback/rendering/transform';

const EPSILON = 1; // Slice Thickness

interface ImageDataMetaData {
  bitsAllocated: number;
  numComps: number;
  origin: Point3;
  direction: Mat3;
  dimensions: Point3;
  spacing: Point3;
  numVoxels: number;
  imagePlaneModule: ImagePlaneModule;
  imagePixelModule: ImagePixelModule;
}
// TODO This needs to be exposed as its published to consumers.
type CalibrationEvent = {
  rowScale?: number;
  columnScale?: number;
  scale: number;
  calibration: IImageCalibration;
};

type SetVOIOptions = {
  suppressEvents?: boolean;
  forceRecreateLUTFunction?: boolean;
  voiUpdatedWithSetProperties?: boolean;
};

/**
 * An object representing a single stack viewport, which is a camera
 * looking into an internal viewport, and an associated target output `canvas`.
 *
 * StackViewports can be rendered using both GPU and a fallback CPU is the GPU
 * is not available (or low performance). Read more about StackViewports in
 * the documentation section of this website.
 */
class StackViewport extends Viewport implements IStackViewport, IImagesLoader {
  private imageIds: Array<string>;
  // current imageIdIndex that is rendered in the viewport
  private currentImageIdIndex: number;
  // the imageIdIndex that is targeted to be loaded with scrolling but has not initiated loading yet
  private targetImageIdIndex: number;
  // setTimeout if the image is debounced to be loaded
  private debouncedTimeout: number;
  /**
   * The progressive retrieval configuration used for this viewport.
   */
  protected imagesLoader: IImagesLoader = this;

  // Viewport Properties
  private globalDefaultProperties: StackViewportProperties;
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
  private cameraFocalPointOnRender: Point3; // we use focalPoint since flip manipulates the position and makes it useless to track
  private stackInvalidated = false; // if true -> new actor is forced to be created for the stack
  private _publishCalibratedEvent = false;
  private _calibrationEvent: CalibrationEvent;
  private _cpuFallbackEnabledElement?: CPUFallbackEnabledElement;
  // CPU fallback
  private useCPURendering: boolean;
  // Since WebGL natively supports 8 bit int and Float32, we should check if
  // extra configuration flags has been set to use native data type
  // which would save a lot of memory and speed up rendering but it is not
  // yet widely supported in all hardwares. This feature can be turned on
  // by setting useNorm16Texture or preferSizeOverAccuracy in the configuration
  private useNativeDataType = false;
  private cpuImagePixelData: PixelDataTypedArray;
  private cpuRenderingInvalidated: boolean;
  private csImage: IImage;

  // TODO: These should not be here and will be nuked
  public modality: string; // this is needed for tools
  public scaling: Scaling;

  // Camera properties
  private initialViewUp: Point3;

  /**
   * Constructor for the StackViewport class
   * @param props - ViewportInput
   */
  constructor(props: ViewportInput) {
    super(props);
    this.scaling = {};
    this.modality = null;
    this.useCPURendering = getShouldUseCPURendering();
    this.useNativeDataType = this._shouldUseNativeDataType();
    this._configureRenderingPipeline();

    this.useCPURendering
      ? this._resetCPUFallbackElement()
      : this._resetGPUViewport();

    this.imageIds = [];
    this.currentImageIdIndex = 0;
    this.targetImageIdIndex = 0;
    this.cameraFocalPointOnRender = [0, 0, 0];
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
    this.useNativeDataType = this._shouldUseNativeDataType();
    this.useCPURendering = value ?? getShouldUseCPURendering();

    for (const [funcName, functions] of Object.entries(
      this.renderingPipelineFunctions
    )) {
      this[funcName] = this.useCPURendering ? functions.cpu : functions.gpu;
    }

    this.useCPURendering
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

    const viewPlaneNormal = <Point3>[0, 0, -1];
    this.initialViewUp = <Point3>[0, -1, 0];

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
   * Centers Pan and resets the zoom for stack viewport.
   */
  public resetCamera: (resetPan?: boolean, resetZoom?: boolean) => boolean;

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
  public getRenderer: () => any;

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
  public getActors: () => Array<ActorEntry>;
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
  public setActors: (actors: Array<ActorEntry>) => void;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, add a list of actors to the viewport
   * @param actors - An array of ActorEntry objects.
   */
  public addActors: (actors: Array<ActorEntry>) => void;

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

  private setInterpolationType: (interpolationType: InterpolationType) => void;

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
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      imageData: actor.getMapper().getInputData(),
      metadata: { Modality: this.modality },
      scaling: this.scaling,
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: { ...this.csImage.calibration, ...this.calibration },
      preScale: {
        ...this.csImage.preScale,
      },
    };
  }

  private getImageDataCPU(): CPUIImageData | undefined {
    const { metadata } = this._cpuFallbackEnabledElement;

    const spacing = metadata.spacing;

    return {
      dimensions: metadata.dimensions,
      spacing,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: { Modality: this.modality },
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
        indexToWorld: (point: Point3) => {
          const canvasPoint = pixelToCanvas(this._cpuFallbackEnabledElement, [
            point[0],
            point[1],
          ]);
          return this.canvasToWorldCPU(canvasPoint);
        },
      },
      scalarData: this.cpuImagePixelData,
      hasPixelSpacing: this.hasPixelSpacing,
      calibration: { ...this.csImage.calibration, ...this.calibration },
      preScale: {
        ...this.csImage.preScale,
      },
    };
  }

  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   * @returns frameOfReferenceUID : string representing frame of reference id
   */
  public getFrameOfReferenceUID = (): string | undefined => {
    // Get the current image that is displayed in the viewport
    const imageId = this.getCurrentImageId();

    if (!imageId) {
      return;
    }

    // Use the metadata provider to grab its imagePlaneModule metadata
    const imagePlaneModule = metaData.get('imagePlaneModule', imageId);

    // If nothing exists, return undefined
    if (!imagePlaneModule) {
      return;
    }

    // Otherwise, provide the FrameOfReferenceUID so we can map
    // annotations made on VolumeViewports back to StackViewports
    // and vice versa
    return imagePlaneModule.frameOfReferenceUID;
  };

  /**
   * Returns the raw/loaded image being shown inside the stack viewport.
   */
  public getCornerstoneImage = (): IImage => {
    return this.csImage;
  };

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
      // @ts-ignore for now until vtk is updated
      mapper.setPreferSizeOverAccuracy(true);
    }

    if (imageData.getPointData().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false);
    }

    return actor;
  };

  /** Gets the number of slices */
  public getNumberOfSlices = (): number => {
    return this.imageIds.length;
  };

  /**
   * Retrieves the metadata from the metadata provider, and optionally adds the
   * scaling to the viewport if modality is PET and scaling metadata is provided.
   *
   * @param imageId - a string representing the imageId for the image
   * @returns imagePlaneModule and imagePixelModule containing the metadata for the image
   */
  private buildMetadata(image: IImage) {
    const imageId = image.imageId;

    const {
      pixelRepresentation,
      bitsAllocated,
      bitsStored,
      highBit,
      photometricInterpretation,
      samplesPerPixel,
    } = metaData.get('imagePixelModule', imageId);

    // we can grab the window center and width from the image object
    // since it the loader already has used the metadata provider
    // to get the values
    const { windowWidth, windowCenter, voiLUTFunction } = image;

    const { modality } = metaData.get('generalSeriesModule', imageId);
    const imageIdScalingFactor = metaData.get('scalingModule', imageId);
    const calibration = metaData.get(MetadataModules.CALIBRATION, imageId);

    if (modality === 'PT' && imageIdScalingFactor) {
      this._addScalingToViewport(imageIdScalingFactor);
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
      imagePlaneModule,
      imagePixelModule: {
        bitsAllocated,
        bitsStored,
        samplesPerPixel,
        highBit,
        photometricInterpretation,
        pixelRepresentation,
        windowWidth,
        windowCenter,
        modality,
        voiLUTFunction: voiLUTFunctionEnum,
      },
    };
  }

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
    this._calibrationEvent = <CalibrationEvent>{
      scale,
      calibration,
    };

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
      rotation,
    }: StackViewportProperties = {},
    suppressEvents = false
  ): void {
    this.viewportStatus = this.csImage
      ? ViewportStatus.PRE_RENDER
      : ViewportStatus.LOADING;

    if (this.globalDefaultProperties == null) {
      this.setDefaultProperties({
        colormap,
        voiRange,
        VOILUTFunction,
        invert,
        interpolationType,
        rotation,
      });
    }

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

    if (typeof rotation !== 'undefined') {
      // TODO: check with VTK about rounding errors here.
      if (this.getRotation() !== rotation) {
        this.setRotation(rotation);
      }
    }
  }

  /**
   * Retrieve the viewport default properties
   * @param imageId If given, we retrieve the default properties of an image index if it exists
   * If not given,we return the global properties of the viewport
   * @returns viewport properties including voi, invert, interpolation type, rotation, flip
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
      rotation: this.getRotation(),
    };
  };

  /**
   * Retrieve the viewport properties
   * @returns viewport properties including voi, invert, interpolation type, rotation, flip
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
    const rotation = this.getRotation();

    return {
      colormap,
      voiRange,
      VOILUTFunction,
      interpolationType,
      invert,
      rotation,
      isComputedVOI: !voiUpdatedWithSetProperties,
    };
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

    if (this.getRotation() !== 0) {
      this.setRotation(0);
    }

    const transferFunction = this.getTransferFunction();
    setTransferFunctionNodes(
      transferFunction,
      this.initialTransferFunctionNodes
    );
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

    if (this.getRotation() !== 0) {
      this.setRotation(0);
    }
    this.setInterpolationType(InterpolationType.LINEAR);
    this.setInvertColor(false);

    this.render();
  }

  private _setPropertiesFromCache(): void {
    const { interpolationType, invert } = this;

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

    this.setVOI(voiRange);
    this.setInterpolationType(interpolationType);
    this.setInvertColor(invert);
  }

  private getCameraCPU(): Partial<ICamera> {
    const { metadata, viewport } = this._cpuFallbackEnabledElement;
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
      rotation: this.getRotation(),
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
    } = this.getCamera();

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

  private setRotation(rotation: number): void {
    const previousCamera = this.getCamera();

    this.useCPURendering
      ? this.setRotationCPU(rotation)
      : this.setRotationGPU(rotation);

    // New camera after rotation
    const camera = this.getCamera();

    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      rotation,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  }

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

  private setRotationGPU(rotation: number): void {
    const pan = this.getPan();
    this.setPan([0, 0]);
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
    this.setPan(pan);
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
      };

      const { lower, upper } = windowLevelUtil.toLowHighRange(wwToUse, wcToUse);
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

      transferFunction = transferFunctionCreator(voiRangeToUse);

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

    const ptScaling = <PTScaling>{};

    if (suvlbm) {
      ptScaling.suvbwToSuvlbm = suvlbm / suvbw;
    }

    if (suvbsa) {
      ptScaling.suvbwToSuvbsa = suvbsa / suvbw;
    }

    this.scaling.PT = ptScaling;
  }

  /**
   * Calculates number of components based on the dicom metadata
   *
   * @param photometricInterpretation - string dicom tag
   * @returns number representing number of components
   */
  private _getNumCompsFromPhotometricInterpretation(
    photometricInterpretation: string
  ): number {
    // TODO: this function will need to have more logic later
    // see http://dicom.nema.org/medical/Dicom/current/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.2
    let numberOfComponents = 1;
    if (
      photometricInterpretation === 'RGB' ||
      photometricInterpretation.indexOf('YBR') !== -1 ||
      photometricInterpretation === 'PALETTE COLOR'
    ) {
      numberOfComponents = 3;
    }

    return numberOfComponents;
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

    const { imagePlaneModule, imagePixelModule } = this.buildMetadata(image);

    let rowCosines, columnCosines;

    rowCosines = <Point3>imagePlaneModule.rowCosines;
    columnCosines = <Point3>imagePlaneModule.columnCosines;

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = <Point3>[1, 0, 0];
      columnCosines = <Point3>[0, 1, 0];
    }

    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    );
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    );
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    let origin = imagePlaneModule.imagePositionPatient;
    // if null or undefined
    if (origin == null) {
      origin = [0, 0, 0];
    }

    const xSpacing =
      imagePlaneModule.columnPixelSpacing || image.columnPixelSpacing;
    const ySpacing = imagePlaneModule.rowPixelSpacing || image.rowPixelSpacing;
    const xVoxels = image.columns;
    const yVoxels = image.rows;

    // Note: For rendering purposes, we use the EPSILON as the z spacing.
    // This is purely for internal implementation logic since we are still
    // technically rendering 3D objects with vtk.js, but the abstracted intention
    //  of the stack viewport is to render 2D images
    const zSpacing = EPSILON;
    const zVoxels = 1;

    const numComps =
      image.numComps ||
      this._getNumCompsFromPhotometricInterpretation(
        imagePixelModule.photometricInterpretation
      );

    return {
      bitsAllocated: imagePixelModule.bitsAllocated,
      numComps,
      origin,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal] as Mat3,
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
      imagePixelModule,
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
    numComps,
    pixelArray,
  }) {
    const values = new pixelArray.constructor(pixelArray.length);

    // Todo: I guess nothing should be done for use16bit?
    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: numComps,
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
    numComps,
    pixelArray,
  }): void {
    this._imageData = this.createVTKImageData({
      origin,
      direction,
      dimensions,
      spacing,
      numComps,
      pixelArray,
    });
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
    imageIds: Array<string>,
    currentImageIdIndex = 0
  ): Promise<string> {
    this._throwIfDestroyed();

    this.imageIds = imageIds;
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

    triggerEvent(eventTarget, Events.STACK_VIEWPORT_NEW_STACK, eventDetail);

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
    return (
      (isSameXSpacing ||
        (image.columnPixelSpacing === null && xSpacing === 1.0)) &&
      (isSameYSpacing ||
        (image.rowPixelSpacing === null && ySpacing === 1.0)) &&
      xVoxels === image.columns &&
      yVoxels === image.rows &&
      isEqual(imagePlaneModule.rowCosines, <Point3>rowCosines) &&
      isEqual(imagePlaneModule.columnCosines, <Point3>columnCosines) &&
      (!this.useNativeDataType ||
        dataType === image.getPixelData().constructor.name)
    );
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

        const pixelData = image.getPixelData();

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
        preScale: {
          enabled: true,
        },
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
    const csImgFrame = (<any>this.csImage)?.imageFrame;
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

    triggerEvent(this.element, Events.STACK_NEW_IMAGE, eventDetail);
    this._updateActorToDisplayImageId(image);

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

    /**
     * If use16bittexture is specified, the CSWIL will automatically choose the
     * array type when no targetBuffer is provided. When CSWIL is initialized,
     * the use16bit should match the settings of cornerstone3D (either preferSizeOverAccuracy
     * or norm16 textures need to be enabled)
     *
     * If use16bittexture is not specified, we force the Float32Array for now
     */
    const additionalDetails = { imageId, imageIdIndex };
    const options = {
      targetBuffer: {
        type: this.useNativeDataType ? undefined : 'Float32Array',
      },
      preScale: {
        enabled: true,
      },
      useRGBA: false,
      transferSyntaxUID,
      priority: 5,
      requestType: RequestType.Interaction,
      additionalDetails,
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
    const metadata = this.getImageDataMetadata(image) as ImageDataMetaData;

    const viewport = getDefaultViewport(
      this.canvas,
      image,
      this.modality,
      this._cpuFallbackEnabledElement.viewport.colormap
    );

    const { windowCenter, windowWidth } = viewport.voi;
    this.voiRange = windowLevelUtil.toLowHighRange(windowWidth, windowCenter);

    this._cpuFallbackEnabledElement.image = image;
    this._cpuFallbackEnabledElement.metadata = {
      ...metadata,
    };
    this.cpuImagePixelData = image.getPixelData();

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

  /**
   * This method is used to add images to the stack viewport.
   * It takes an array of stack inputs, each containing an imageId and an actor UID.
   * For each stack input, it retrieves the image from the cache and creates a VTK image data object.
   * It then creates an actor mapper for the image data and adds it to the list of actors.
   * Finally, it sets the actors for the stack viewport.
   *
   * @param  stackInputs - An array of stack inputs, each containing an image ID and an actor UID.
   */
  public async addImages(stackInputs: Array<IStackInput>): Promise<void> {
    const actors = this.getActors();
    stackInputs.forEach((stackInput) => {
      const image = cache.getImage(stackInput.imageId);

      const { origin, dimensions, direction, spacing, numComps } =
        this.getImageDataMetadata(image);

      const imagedata = this.createVTKImageData({
        origin,
        dimensions,
        direction,
        spacing,
        numComps,
        pixelArray: image.getPixelData(),
      });

      const imageActor = this.createActorMapper(imagedata);
      if (imageActor) {
        actors.push({ uid: stackInput.actorUID, actor: imageActor });
        if (stackInput.callback) {
          stackInput.callback({ imageActor, imageId: stackInput.imageId });
        }
      }
    });
    this.setActors(actors);
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

    const activeCamera = this.getRenderer().getActiveCamera();

    // Cache camera props so we can trigger one camera changed event after
    // The full transition.
    const previousCameraProps = _cloneDeep(this.getCamera());
    if (sameImageData && !this.stackInvalidated) {
      // 3a. If we can reuse it, replace the scalar data under the hood
      this._updateVTKImageDataFromCornerstoneImage(image);

      // Since the 3D location of the imageData is changing as we scroll, we need
      // to modify the camera position to render this properly. However, resetting
      // causes problem related to zoom and pan tools: upon rendering of a new slice
      // the pan and zoom will get reset. To solve this, 1) we store the camera
      // properties related to pan and zoom 2) reset the camera to correctly place
      // it in the space 3) restore the pan, zoom props.
      const cameraProps = this.getCamera();

      const panCache = vec3.subtract(
        vec3.create(),
        this.cameraFocalPointOnRender,
        cameraProps.focalPoint
      );

      // Reset the camera to point to the new slice location, reset camera doesn't
      // modify the direction of projection and viewUp
      this.resetCameraNoEvent();

      // set the flip and view up back to the previous value since the restore camera props
      // rely on the correct flip value
      this.setCameraNoEvent({
        flipHorizontal: previousCameraProps.flipHorizontal,
        flipVertical: previousCameraProps.flipVertical,
        viewUp: previousCameraProps.viewUp,
      });

      const { focalPoint } = this.getCamera();
      this.cameraFocalPointOnRender = focalPoint;

      // This is necessary to initialize the clipping range and it is not related
      // to our custom slabThickness.
      // @ts-ignore: vtkjs incorrect typing
      activeCamera.setFreezeFocalPoint(true);

      // We shouldn't restore the focalPoint, position and parallelScale after reset
      // if it is the first render or we have completely re-created the vtkImageData
      this._restoreCameraProps(
        cameraProps,
        previousCameraProps,
        panCache as Point3
      );

      this._setPropertiesFromCache();

      return;
    }

    const {
      origin,
      direction,
      dimensions,
      spacing,
      numComps,
      imagePixelModule,
    } = this.getImageDataMetadata(image);

    // 3b. If we cannot reuse the vtkImageData object (either the first render
    // or the size has changed), create a new one

    const pixelArray = image.getPixelData();
    this._createVTKImageData({
      origin,
      direction,
      dimensions,
      spacing,
      numComps,
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

    this.setCameraNoEvent({ viewUp, viewPlaneNormal });

    // Setting this makes the following comment about resetCameraNoEvent not modifying viewUp true.
    this.initialViewUp = viewUp;

    // Reset the camera to point to the new slice location, reset camera doesn't
    // modify the direction of projection and viewUp
    this.resetCameraNoEvent();

    this.triggerCameraEvent(this.getCamera(), previousCameraProps);

    // This is necessary to initialize the clipping range and it is not related
    // to our custom slabThickness.
    // @ts-ignore: vtkjs incorrect typing
    activeCamera.setFreezeFocalPoint(true);

    const monochrome1 =
      imagePixelModule.photometricInterpretation === 'MONOCHROME1';

    // invalidate the stack so that we can set the voi range
    this.stackInvalidated = true;

    this.setVOI(this._getInitialVOIRange(image), {
      forceRecreateLUTFunction: !!monochrome1,
    });

    this.initialInvert = !!monochrome1;

    // should carry over the invert color from the previous image if has been applied
    this.setInvertColor(this.invert || this.initialInvert);

    // Saving position of camera on render, to cache the panning
    this.cameraFocalPointOnRender = this.getCamera().focalPoint;
    this.stackInvalidated = false;

    if (this._publishCalibratedEvent) {
      this.triggerCalibrationEvent();
    }
  }

  private _getInitialVOIRange(image: IImage) {
    if (this.voiRange && this.voiUpdatedWithSetProperties) {
      return this.globalDefaultProperties.voiRange;
    }
    const { windowCenter, windowWidth } = image;

    let voiRange = this._getVOIRangeFromWindowLevel(windowWidth, windowCenter);

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

    if (!this.csImage.preScale?.scalingParameters?.suvbw) {
      return false;
    }

    return true;
  }

  private _getDefaultPTPrescaledVOIRange() {
    return { lower: 0, upper: 5 };
  }

  private _getVOIRangeFromWindowLevel(
    windowWidth: number | number[],
    windowCenter: number | number[]
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
      return windowLevelUtil.toLowHighRange(width, center);
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

  private resetCameraCPU(resetPan, resetZoom) {
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

  private resetCameraGPU(resetPan, resetZoom): boolean {
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
    return super.resetCamera(resetPan, resetZoom, resetToCenter);
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

  /**
   * Restores the camera props such zooming and panning after an image is
   * changed, if needed (after scroll)
   *
   * @param parallelScale - camera parallel scale
   */
  private _restoreCameraProps(
    { parallelScale: prevScale }: ICamera,
    previousCamera: ICamera,
    panCache: Point3
  ): void {
    const renderer = this.getRenderer();

    // get the focalPoint and position after the reset
    const { position, focalPoint } = this.getCamera();

    const newPosition = vec3.subtract(vec3.create(), position, panCache);
    const newFocal = vec3.subtract(vec3.create(), focalPoint, panCache);

    // Restoring previous state x,y and scale, keeping the new z
    // we need to break the flip operations since they also work on the
    // camera position and focal point
    this.setCameraNoEvent({
      parallelScale: prevScale,
      position: newPosition as Point3,
      focalPoint: newFocal as Point3,
    });

    const camera = this.getCamera();

    this.triggerCameraEvent(camera, previousCamera);

    // Invoking render
    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    };

    renderer.invokeEvent(RESET_CAMERA_EVENT);
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

  private canvasToWorldCPU = (canvasPos: Point2): Point3 => {
    if (!this._cpuFallbackEnabledElement.image) {
      return;
    }
    // compute the pixel coordinate in the image
    const [px, py] = canvasToPixel(this._cpuFallbackEnabledElement, canvasPos);

    // convert pixel coordinate to world coordinate
    const { origin, spacing, direction } = this.getImageData();

    const worldPos = vec3.fromValues(0, 0, 0);

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    // Calculate the world coordinate of the pixel
    vec3.scaleAndAdd(worldPos, origin, iVector, px * spacing[0]);
    vec3.scaleAndAdd(worldPos, worldPos, jVector, py * spacing[1]);

    return [worldPos[0], worldPos[1], worldPos[2]] as Point3;
  };

  private worldToCanvasCPU = (worldPos: Point3): Point2 => {
    // world to pixel
    const { spacing, direction, origin } = this.getImageData();

    const iVector = direction.slice(0, 3) as Point3;
    const jVector = direction.slice(3, 6) as Point3;

    const diff = vec3.subtract(vec3.create(), worldPos, origin);

    const worldPoint: Point2 = [
      vec3.dot(diff, iVector) / spacing[0],
      vec3.dot(diff, jVector) / spacing[1],
    ];

    // pixel to canvas
    const canvasPoint = pixelToCanvas(
      this._cpuFallbackEnabledElement,
      worldPoint
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

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ];

    // set clipping range back to original to be able
    vtkCamera.setClippingRange(crange[0], crange[1]);

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasCoordWithDPR = <Point2>[
      canvasCoord[0] / devicePixelRatio,
      canvasCoord[1] / devicePixelRatio,
    ];

    return canvasCoordWithDPR;
  };

  private _getVOIRangeForCurrentImage() {
    const { windowCenter, windowWidth } = this.csImage;

    return this._getVOIRangeFromWindowLevel(windowWidth, windowCenter);
  }

  private _getValidVOILUTFunction(voiLUTFunction: any) {
    if (Object.values(VOILUTFunctionType).indexOf(voiLUTFunction) === -1) {
      voiLUTFunction = VOILUTFunctionType.LINEAR;
    }
    return voiLUTFunction;
  }

  /**
   * Returns the index of the imageId being renderer
   *
   * @returns currently shown imageId index
   */
  public getCurrentImageIdIndex = (): number => {
    return this.currentImageIdIndex;
  };

  public getSliceIndex = (): number => {
    return this.currentImageIdIndex;
  };

  /**
   * Checks to see if this target is or could be shown in this viewport
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    if (!super.isReferenceViewable(viewRef, options)) {
      return false;
    }

    let { imageURI } = options;
    const { referencedImageId, sliceIndex } = viewRef;

    if (viewRef.volumeId && !referencedImageId) {
      return options.asVolume === true;
    }

    let testIndex = this.getCurrentImageIdIndex();
    if (options.withNavigation && typeof sliceIndex === 'number') {
      testIndex = sliceIndex;
    }
    const imageId = this.imageIds[testIndex];
    if (!imageId) {
      return false;
    }
    if (!imageURI) {
      // Remove the dataLoader scheme since that can change
      const colonIndex = imageId.indexOf(':');
      imageURI = imageId.substring(colonIndex + 1);
    }
    return referencedImageId.endsWith(imageURI);
  }

  /**
   * Gets a standard target to show this image instance.
   */
  public getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const { sliceIndex: sliceIndex = this.currentImageIdIndex } =
      viewRefSpecifier;
    return {
      ...super.getViewReference(viewRefSpecifier),
      referencedImageId: `${this.imageIds[sliceIndex as number]}`,
      sliceIndex: sliceIndex,
    };
  }

  public getReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    const { sliceIndex: sliceIndex = this.currentImageIdIndex } = specifier;
    if (Array.isArray(sliceIndex)) {
      throw new Error('Use of slice ranges for stacks not supported');
    }
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

  /**
   * Returns the list of image Ids for the current viewport
   * @returns list of strings for image Ids
   */
  public getImageIds = (): Array<string> => {
    return this.imageIds;
  };

  /**
   * Returns the currently rendered imageId
   * @returns string for imageId
   */
  public getCurrentImageId = (): string => {
    return this.imageIds[this.currentImageIdIndex];
  };

  /**
   * Returns true if the viewport contains the given imageId
   * @param imageId - imageId
   * @returns boolean if imageId is in viewport
   */
  public hasImageId = (imageId: string): boolean => {
    return this.imageIds.includes(imageId);
  };

  /**
   * Returns true if the viewport contains the given imageURI (no data loader scheme)
   * @param imageURI - imageURI
   * @returns boolean if imageURI is in viewport
   */
  public hasImageURI = (imageURI: string): boolean => {
    const imageIds = this.imageIds;
    for (let i = 0; i < imageIds.length; i++) {
      if (imageIdToURI(imageIds[i]) === imageURI) {
        return true;
      }
    }

    return false;
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
    const colormap = getColormap(colormapData.name, colormapData);

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
    const imagePlaneModule = metaData.get(MetadataModules.IMAGE_PLANE, imageId);

    this.calibration ||= imagePlaneModule.calibration;
    const newImagePlaneModule: ImagePlaneModule = {
      ...imagePlaneModule,
    };

    if (!newImagePlaneModule.columnPixelSpacing) {
      newImagePlaneModule.columnPixelSpacing = 1;
      this.hasPixelSpacing = this.calibration?.scale > 0;
    }

    if (!newImagePlaneModule.rowPixelSpacing) {
      newImagePlaneModule.rowPixelSpacing = 1;
      this.hasPixelSpacing = this.calibration?.scale > 0;
    }

    if (!newImagePlaneModule.columnCosines) {
      newImagePlaneModule.columnCosines = [0, 1, 0];
    }

    if (!newImagePlaneModule.rowCosines) {
      newImagePlaneModule.rowCosines = [1, 0, 0];
    }

    if (!newImagePlaneModule.imagePositionPatient) {
      newImagePlaneModule.imagePositionPatient = [0, 0, 0];
    }

    if (!newImagePlaneModule.imageOrientationPatient) {
      newImagePlaneModule.imageOrientationPatient = new Float32Array([
        1, 0, 0, 0, 1, 0,
      ]);
    }

    return newImagePlaneModule;
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
      cpu: (resetPan = true, resetZoom = true): boolean => {
        this.resetCameraCPU(resetPan, resetZoom);
        return true;
      },
      gpu: (resetPan = true, resetZoom = true): boolean => {
        this.resetCameraGPU(resetPan, resetZoom);
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
