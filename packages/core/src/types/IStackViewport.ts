import type {
  IViewport,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from './IViewport';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { ActorEntry } from './IActor';
import type CPUIImageData from './CPUIImageData';
import type ICamera from './ICamera';
import type { ResetCameraOptions } from './ICamera';
import type IImage from './IImage';
import type IImageData from './IImageData';
import type { IStackInput } from './IStackInput';
import type Point2 from './Point2';
import type Point3 from './Point3';
import type { Scaling } from './ScalingParameters';
import type StackViewportProperties from './StackViewportProperties';
import type { ViewportStatus } from '../enums';
import type Mat3 from './Mat3';
import type { ImagePixelModule } from './ImagePixelModule';
import type { ImagePlaneModule } from './ImagePlaneModule';

/**
 * The metadata of one image that a stack viewport builds its image data from.
 */
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

/**
 * Public interface of the legacy stack viewport, `StackViewport`.
 */
interface IStackViewport extends IViewport {
  modality: string;
  scaling: Scaling;
  stackActorReInitialized: boolean;
  setUseCPURendering(value: boolean): void;
  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: dimensions, direction, scalarData, vtkImageData, metadata, scaling
   */
  getImageData: () => IImageData | CPUIImageData;
  /**
   * If the user has selected CPU rendering, return the CPU camera, otherwise
   * return the default camera
   * @returns The camera object.
   */
  getCamera: () => ICamera;
  /**
   * Set the camera based on the provided camera object.
   * @param cameraInterface - The camera interface that will be used to
   * render the scene.
   */
  setCamera: (cameraInterface: ICamera, storeAsInitialCamera?: boolean) => void;
  /**
   * It sets the colormap to the default colormap.
   */
  unsetColormap: () => void;
  /**
   * Resets the camera for the stack viewport.
   * This method adjusts the camera to fit the image in the viewport,
   * potentially resetting pan, zoom, and other view parameters.
   *
   * @param options - Optional configuration for the reset operation
   * @param options.resetPan - Whether to reset the pan (default: true)
   * @param options.resetZoom - Whether to reset the zoom (default: true)
   * @param options.resetToCenter - Whether to centre the camera (default: true).
   *   The CPU fallback ignores this option.
   * @param options.resetAspectRatio - Whether to apply the aspect ratio of the
   *   viewport options, instead of the one of the camera (default: true)
   * @param options.storeAsInitialCamera - Whether to keep the result as the
   *   baseline of the zoom and of the pan (default: true). The CPU fallback
   *   ignores this option.
   * @returns boolean - True if the camera was reset successfully, false otherwise
   */
  resetCamera: (
    options?: ResetCameraOptions & { suppressEvents?: boolean }
  ) => boolean;
  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s camera.
   *
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  worldToCanvas: (worldPos: Point3) => Point2;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the default
   * actor which is the first actor in the renderer.
   * @returns An actor entry.
   */
  getDefaultActor: () => ActorEntry;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  getActors: () => ActorEntry[];
  /**
   * If the renderer is CPU based, throw an error. Otherwise, it returns the actor entry for the given actor UID.
   * @param actorUID - The unique ID of the actor you want to get.
   * @returns An ActorEntry object.
   */
  getActor: (actorUID: string) => ActorEntry;
  /**
   * If the renderer is CPU-based, throw an error; otherwise, set the
   * actors in the viewport.
   * @param actors - An array of ActorEntry objects.
   */
  setActors: (actors: ActorEntry[]) => void;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, add a list of actors to the viewport
   * @param actors - An array of ActorEntry objects.
   */
  addActors: (actors: ActorEntry[]) => void;
  /**
   * If the renderer is CPU based, throw an error. Otherwise, add the
   * actor to the viewport
   * @param actorEntry - The ActorEntry object that was created by the
   * user.
   */
  addActor: (actorEntry: ActorEntry) => void;
  /**
   * It throws an error if the renderer is CPU based. Otherwise, it removes the actors from the viewport.
   */
  removeAllActors: () => void;
  /**
   * Get render passes for this viewport.
   * If sharpening or smoothing is enabled, returns appropriate render passes.
   * @returns Array of VTK render passes or null if no custom passes are needed
   */
  getRenderPasses: () => unknown[];
  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize: () => void;
  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   * @returns frameOfReferenceUID : string representing frame of reference id
   */
  getFrameOfReferenceUID: (sliceIndex?: number) => string;
  /**
   * Returns the raw/loaded image being shown inside the stack viewport.
   */
  getCornerstoneImage: () => IImage;
  /** Gets the number of slices */
  getNumberOfSlices: () => number;
  /**
   * Update the default properties of the viewport and add properties by imageId if specified
   * @param ViewportProperties - The properties to set
   * @param imageId If given, we set the default properties only for this image index, if not
   * the default properties will be set for all imageIds
   */
  setDefaultProperties(
    ViewportProperties: StackViewportProperties,
    imageId?: string
  ): void;
  /**
   * Remove the global default properties of the viewport or remove default properties for an imageId if specified
   * @param imageId If given, we remove the default properties only for this imageID, if not
   * the global default properties will be removed
   */
  clearDefaultProperties(imageId?: string): void;
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
  setProperties(
    options?: StackViewportProperties,
    suppressEvents?: boolean
  ): void;
  /**
   * Retrieve the viewport default properties
   * @param imageId If given, we retrieve the default properties of an image index if it exists
   * If not given,we return the global properties of the viewport
   * @returns viewport properties including voi, invert, interpolation type,
   */
  getDefaultProperties: (imageId?: string) => StackViewportProperties;
  /**
   * Retrieve the viewport properties
   * @returns viewport properties including voi, invert, interpolation type,
   */
  getProperties: () => StackViewportProperties;
  resetCameraForResize: () => boolean;
  /**
   * Reset the viewport properties to the default values
   */
  resetProperties(): void;
  resetToDefaultProperties(): void;
  /**
   * Calculates image metadata based on the image object. It calculates normal
   * axis for the images, and output image metadata
   *
   * @param image - stack image containing cornerstone image
   * @returns image metadata: bitsAllocated, number of components, origin,
   *  direction, dimensions, spacing, number of voxels.
   */
  getImageDataMetadata(image: IImage): ImageDataMetaData;
  /**
   * Gets the view reference data for a given image slice.  This uses the
   * image plane module to read a default focal point/normal, and also returns
   * the referenced image id and the frame of reference uid.
   */
  getImagePlaneReferenceData(sliceIndex?: number): ViewReference;
  createVTKImageData(options: {
    origin: unknown;
    direction: unknown;
    dimensions: unknown;
    spacing: unknown;
    numberOfComponents: unknown;
    pixelArray: unknown;
  }): vtkImageDataType;
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
  setStack(imageIds: string[], currentImageIdIndex?: number): Promise<string>;
  /**
   * Mounts display sets on the viewport, mirroring the GenericViewport
   * `setDisplaySets` API. Each `displaySetId` is resolved through the registered
   * generic-viewport dataset metadata (see `genericViewportDisplaySetMetadataProvider`)
   * to its `imageIds`; the first entry is loaded as the stack. Resolution and
   * loading run inside {@link mountDisplaySets}, which records the mounted
   * entries after `setStack` so {@link getDisplaySets} reports them.
   *
   * @param entries - display set entries to mount; the first is used as the stack source.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
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
  renderImageObject: (image: unknown) => void;
  /**
   * This method is used to add images to the stack viewport.
   * It takes an array of stack inputs, each containing an imageId and an actor UID.
   * For each stack input, it retrieves the image from the cache and creates a VTK image data object.
   * It then creates an actor mapper for the image data and adds it to the list of actors.
   * Finally, it sets the actors for the stack viewport.
   *
   * @param  stackInputs - An array of stack inputs, each containing an image ID and an actor UID.
   */
  addImages(stackInputs: IStackInput[]): void;
  /**
   * It scrolls the stack of imageIds by the delta amount provided. If the debounce
   * flag is set, it will only scroll the stack if the delta is greater than the
   * debounceThreshold which is 40 milliseconds by default.
   * @param delta - number of indices to scroll, it can be positive or negative
   * @param debounce - whether to debounce the scroll event
   * @param loop - whether to loop the stack
   */
  scroll(delta: number, debounce?: boolean, loop?: boolean): void;
  /**
   * Loads the image based on the provided imageIdIndex. It is an Async function which
   * returns a promise that resolves to the imageId.
   *
   * @param imageIdIndex - number represents imageId index in the list of
   * provided imageIds in setStack
   */
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  /**
   * Calibrates the image with new metadata that has been added for imageId. To calibrate
   * a viewport, you should add your calibration data manually to
   * calibratedPixelSpacingMetadataProvider and call viewport.calibrateSpacing
   * for it get applied.
   *
   * @param imageId - imageId to be calibrated
   */
  calibrateSpacing(imageId: string): void;
  jumpToWorld(worldPos: Point3): boolean;
  /**
   * Returns the index of the imageId being renderer
   *
   * @returns currently shown imageId index
   */
  getCurrentImageIdIndex: () => number;
  /**
   * returns the slice index of the view
   * @returns slice index
   */
  getSliceIndex: () => number;
  /**
   * Returns information about the current slice view.
   * @returns An object containing the slice index and slice axis.
   * @throws Error if the view is oblique.
   */
  getSliceInfo(): {
    sliceIndex: number;
    slicePlane: number;
    width: number;
    height: number;
  };
  /**
   * Determines if a given ViewReference is viewable in this StackViewport.
   *
   * @param viewRef - The ViewReference to check.
   * @param options - Additional options for compatibility checking.
   * @returns True if the ViewReference is viewable, false otherwise.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /**
   * Gets a standard target to show this image instance.
   * Returns undefined if the requested slice index is not available.
   *
   * If using sliceIndex for requesting a specific reference, the slice index MUST come
   * from the stack of image ids.  Using slice index from a volume or from a different
   * stack of images ids, EVEN if they contain the same set of images will result in
   * random images being chosen.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  /**
   * Applies the view reference, which may navigate the slice index and apply
   * other camera modifications.
   * Assumes that the slice index is correct for this viewport
   */
  setViewReference(viewRef: ViewReference): void;
  /**
   * Returns the imageId string for the specified view, using the
   * `imageId:<imageId>` URN format.
   */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  /**
   *
   * Returns the imageIdIndex that is targeted to be loaded, in case of debounced
   * loading (with scroll), the targetImageIdIndex is the latest imageId
   * index that is requested to be loaded but debounced.
   */
  getTargetImageIdIndex: () => number;
  getSliceIndexForImage(reference: string | ViewReference): number;
  /**
   * Returns the list of image Ids for the current viewport
   * @returns list of strings for image Ids
   */
  getImageIds: () => string[];
  /**
   * Returns the currently rendered imageId
   * @returns string for imageId
   */
  getCurrentImageId: (index?: number) => string;
  /**
   * Returns true if the viewport contains the given imageId
   * @param imageId - imageId
   * @returns boolean if imageId is in viewport
   */
  hasImageId: (imageId: string) => boolean;
  /**
   * Returns true if the viewport contains the given imageURI (no data loader scheme)
   * @param imageURI - imageURI
   * @returns boolean if imageURI is in viewport
   */
  hasImageURI: (imageURI: string) => boolean;
  customRenderViewportToCanvas: () => {
    canvas: HTMLCanvasElement;
    element: HTMLDivElement;
    viewportId: string;
    renderingEngineId: string;
    viewportStatus: ViewportStatus;
  };
  isInAcquisitionPlane(): boolean;
}

export type { IStackViewport as default };
