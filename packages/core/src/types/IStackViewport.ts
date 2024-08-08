import CPUIImageData from './CPUIImageData';
import { ActorEntry } from './IActor';
import ICamera from './ICamera';
import IImage from './IImage';
import IImageData from './IImageData';
import { IStackInput } from './IStackInput';
import { IViewport } from './IViewport';
import Point2 from './Point2';
import Point3 from './Point3';
import { Scaling } from './ScalingParameters';
import StackViewportProperties from './StackViewportProperties';
import {
  ViewReference,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
} from '../types/IViewport';

export default interface IStackViewport extends IViewport {
  /**
   * Sets whether to use CPU rendering.
   * @param value - A boolean indicating whether to use CPU rendering.
   */
  setUseCPURendering(value: boolean): void;

  /**
   * Updates the rendering pipeline based on the current rendering mode.
   */
  updateRenderingPipeline(): void;

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   * @returns IImageData: dimensions, direction, scalarData, vtkImageData, metadata, scaling
   */
  getImageData(): IImageData | CPUIImageData;

  /**
   * If the user has selected CPU rendering, return the CPU camera, otherwise
   * return the default camera
   * @returns The camera object.
   */
  getCamera(): ICamera;

  /**
   * Set the camera based on the provided camera object.
   * @param cameraInterface - The camera interface that will be used to render the scene.
   * @param storeAsInitialCamera - Optional boolean to store this camera setting as the initial state.
   */
  setCamera(cameraInterface: ICamera, storeAsInitialCamera?: boolean): void;

  /**
   * Gets the current rotation angle of the viewport.
   * @returns The rotation angle in degrees.
   */
  getRotation(): number;

  /**
   * It sets the colormap to the default colormap.
   */
  unsetColormap(): void;

  /**
   * Returns the list of image Ids for the current viewport
   * @returns list of strings for image Ids
   */
  getImageIds(): Array<string>;

  /**
   * Sets the imageIds to be visualized inside the stack viewport. It accepts
   * list of imageIds, the index of the first imageId to be viewed. It is a
   * asynchronous function that returns a promise resolving to imageId being
   * displayed in the stack viewport.
   * @param imageIds - list of strings, that represents list of image Ids
   * @param currentImageIdIndex - number representing the index of the initial image to be displayed
   * @returns A promise resolving to the imageId being displayed
   */
  setStack(imageIds: string[], imageIdIndex?: number): Promise<string>;

  /**
   * Centers Pan and resets the zoom for stack viewport.
   * @param options - Optional settings to specify reset behavior.
   * @returns A boolean indicating whether the camera was reset successfully.
   */
  resetCamera(options?: any): boolean;

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s camera.
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   */
  canvasToWorld(canvasPos: Point2): Point3;

  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   */
  worldToCanvas(worldPos: Point3): Point2;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, returns the `vtkRenderer` responsible for rendering the `Viewport`.
   * @returns The `vtkRenderer` for the `Viewport`.
   */
  getRenderer(): any;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the default
   * actor which is the first actor in the renderer.
   * @returns An actor entry.
   */
  getDefaultActor(): ActorEntry;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, return the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  getActors(): Array<ActorEntry>;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, it returns the actor entry for the given actor UID.
   * @param actorUID - The unique ID of the actor you want to get.
   * @returns An ActorEntry object.
   */
  getActor(actorUID: string): ActorEntry;

  /**
   * If the renderer is CPU-based, throw an error; otherwise, set the
   * actors in the viewport.
   * @param actors - An array of ActorEntry objects.
   */
  setActors(actors: Array<ActorEntry>): void;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, add a list of actors to the viewport
   * @param actors - An array of ActorEntry objects.
   */
  addActors(actors: Array<ActorEntry>): void;

  /**
   * If the renderer is CPU based, throw an error. Otherwise, add the
   * actor to the viewport
   * @param actorEntry - The ActorEntry object that was created by the user.
   */
  addActor(actorEntry: ActorEntry): void;

  /**
   * It throws an error if the renderer is CPU based. Otherwise, it removes the actors from the viewport.
   */
  removeAllActors(): void;

  /**
   * Returns the frame of reference UID, if the image doesn't have imagePlaneModule
   * metadata, it returns undefined, otherwise, frameOfReferenceUID is returned.
   * @returns frameOfReferenceUID : string representing frame of reference id
   */
  getFrameOfReferenceUID(): string;

  /**
   * This method is used to add images to the stack viewport.
   * @param stackInputs - An array of stack inputs, each containing an image ID and an actor UID.
   * @param immediateRender - Optional boolean to trigger immediate rendering.
   * @param suppressEvents - Optional boolean to suppress events.
   */
  addImages(
    images: Array<IStackInput>,
    immediateRender?: boolean,
    suppressEvents?: boolean
  ): void;

  /**
   * Renders the given Cornerstone image object in the viewport.
   * @param image - The Cornerstone image object to render.
   */
  renderImageObject(image: any): void;

  /**
   * Sets the properties for the viewport on the default actor. Properties include
   * setting the VOI, inverting the colors and setting the interpolation type, rotation
   * @param properties - The properties to set.
   * @param suppressEvents - Optional boolean to suppress events.
   */
  setProperties(
    properties: StackViewportProperties,
    suppressEvents?: boolean
  ): void;

  /**
   * Returns the currently rendered imageId
   * @returns string for imageId
   */
  getCurrentImageId(): string;

  /**
   * Calculates image metadata based on the image object.
   * @param image - stack image containing cornerstone image
   * @returns image metadata: bitsAllocated, number of components, origin, direction, dimensions, spacing, number of voxels.
   */
  getImageDataMetadata(image: IImage): any;

  /**
   * Resizes the viewport - only used in CPU fallback for StackViewport. The
   * GPU resizing happens inside the RenderingEngine.
   */
  resize(): void;

  /**
   * Update the default properties of the viewport and add properties by imageId if specified
   * setting the VOI, inverting the colors and setting the interpolation type, rotation
   * @param ViewportProperties - The properties to set
   * @param imageId - If given, we set the default properties only for this image index, if not
   * the default properties will be set for all imageIds
   */
  setDefaultProperties(
    ViewportProperties: StackViewportProperties,
    imageId?: string
  ): void;

  /**
   * Remove the global default properties of the viewport or remove default properties for an imageId if specified
   * @param imageId - If given, we remove the default properties only for this imageID, if not
   * the global default properties will be removed
   */
  clearDefaultProperties(imageId?: string): void;

  /**
   * Retrieve the viewport default properties
   * @param imageId - If given, we retrieve the default properties of an image index if it exists
   * If not given, we return the global properties of the viewport
   * @returns viewport properties including voi, invert, interpolation type,
   */
  getDefaultProperties(imageId?: string): StackViewportProperties;

  /**
   * Retrieve the viewport properties
   * @returns viewport properties including voi, invert, interpolation type,
   */
  getProperties(): StackViewportProperties;

  /**
   * Returns the index of the imageId being renderer
   * @returns currently shown imageId index
   */
  getCurrentImageIdIndex(): number;

  /**
   * Returns true if the viewport contains the given imageId
   * @param imageId - imageId
   * @returns boolean if imageId is in viewport
   */
  hasImageId(imageId: string): boolean;

  /**
   * Returns true if the viewport contains the given imageURI (no data loader scheme)
   * @param imageURI - imageURI
   * @returns boolean if imageURI is in viewport
   */
  hasImageURI(imageURI: string): boolean;

  /**
   * Custom rendering pipeline for the rendering for the CPU fallback
   */
  customRenderViewportToCanvas(): {
    canvas: HTMLCanvasElement;
    element: HTMLDivElement;
    viewportId: string;
    renderingEngineId: string;
  };

  /**
   * Returns the raw/loaded image being shown inside the stack viewport.
   */
  getCornerstoneImage(): IImage;

  /**
   * Reset the viewport properties to the his default values if possible
   */
  resetToDefaultProperties(): void;

  /**
   * Reset the viewport properties to the default metadata values
   */
  resetProperties(): void;

  /**
   * Loads the image based on the provided imageIdIndex. It is an Async function which
   * returns a promise that resolves to the imageId.
   * @param imageIdIndex - number represents imageId index in the list of provided imageIds in setStack
   */
  setImageIdIndex(imageIdIndex: number): Promise<string>;

  /**
   * Calibrates the image with new metadata that has been added for imageId. To calibrate
   * a viewport, you should add your calibration data manually to
   * calibratedPixelSpacingMetadataProvider and call viewport.calibrateSpacing
   * for it get applied.
   * @param imageId - imageId to be calibrated
   */
  calibrateSpacing(imageId: string): void;

  /**
   * Checks to see if this target is or could be shown in this viewport
   * @param viewRef - The view reference to check
   * @param options - Optional compatibility options
   * @returns A boolean indicating if the reference is viewable
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean | unknown;

  /**
   * Gets a standard target to show this image instance.
   * @param viewRefSpecifier - Optional view reference specifier
   * @returns A ViewReference object, or undefined if the requested slice index is not available
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;

  /**
   * Applies the view reference, which may navigate the slice index and apply
   * other camera modifications.
   * @param viewRef - The view reference to apply
   */
  setViewReference(viewRef: ViewReference): void;

  /**
   * Returns the imageId string for the specified view, using the
   * `imageId:<imageId>` URN format.
   * @param specifier - Optional view reference specifier
   * @returns A string representing the image ID
   */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;

  modality: string;
  scaling: Scaling;
  stackActorReInitialized: boolean;

  scroll(delta: number, debounceLoading?: boolean, loop?: boolean): void;
}
