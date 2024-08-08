import CPUIImageData from './CPUIImageData';
import { ActorEntry } from './IActor';
import ICamera from './ICamera';
import IImageData from './IImageData';
import { IStackInput } from './IStackInput';
import { IViewport } from './IViewport';
import Point2 from './Point2';
import Point3 from './Point3';
import { Scaling } from './ScalingParameters';
import StackViewportProperties from './StackViewportProperties';

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
   * Returns the image and its properties currently being displayed in the viewport.
   * @returns An object containing image data and properties.
   */
  getImageData(): IImageData | CPUIImageData;

  /**
   * Returns the current camera settings.
   * @returns An object representing the camera settings.
   */
  getCamera(): ICamera;

  /**
   * Sets the camera based on the provided camera object.
   * @param cameraInterface - The camera settings to apply.
   * @param storeAsInitialCamera - Optional boolean to store this camera setting as the initial state.
   */
  setCamera(cameraInterface: ICamera, storeAsInitialCamera?: boolean): void;

  /**
   * Gets the current rotation angle of the viewport.
   * @returns The rotation angle in degrees.
   */
  getRotation(): number;

  /**
   * Unsets the colormap for the current viewport.
   */
  unsetColormap(): void;

  getImageIds(): Array<string>;

  setStack(imageIds: string[], imageIdIndex?: number): void;

  /**
   * Resets the camera settings to the default state.
   * @param options - Optional settings to specify reset behavior.
   * @returns A boolean indicating whether the camera was reset successfully.
   */
  resetCamera(options?: any): boolean;

  /**
   * Converts canvas coordinates to world coordinates.
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   */
  canvasToWorld(canvasPos: Point2): Point3;

  /**
   * Converts world coordinates to canvas coordinates.
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   */
  worldToCanvas(worldPos: Point3): Point2;

  /**
   * Returns the renderer responsible for rendering the viewport.
   * @returns The renderer object.
   */
  getRenderer(): any;

  /**
   * Returns the default actor in the viewport.
   * @returns An actor entry object.
   */
  getDefaultActor(): ActorEntry;

  /**
   * Returns all actors in the viewport.
   * @returns An array of actor entry objects.
   */
  getActors(): Array<ActorEntry>;

  /**
   * Returns the actor entry for the given actor UID.
   * @param actorUID - The unique ID of the actor.
   * @returns An actor entry object.
   */
  getActor(actorUID: string): ActorEntry;

  /**
   * Sets the actors in the viewport.
   * @param actors - An array of actor entry objects to set.
   */
  setActors(actors: Array<ActorEntry>): void;

  /**
   * Adds a list of actors to the viewport.
   * @param actors - An array of actor entry objects to add.
   */
  addActors(actors: Array<ActorEntry>): void;

  /**
   * Adds a single actor to the viewport.
   * @param actorEntry - The actor entry object to add.
   */
  addActor(actorEntry: ActorEntry): void;

  /**
   * Removes all actors from the viewport.
   */
  removeAllActors(): void;

  getFrameOfReferenceUID(): string;

  addImages(images: Array<IStackInput>): void;

  modality: string; // this is needed for tools
  scaling: Scaling;

  // this flag is used to check
  // if the viewport used the same actor/mapper to render the image
  // or because of the new image inconsistency, a new actor/mapper was created
  stackActorReInitialized: boolean;

  renderImageObject(image: any): void;

  setProperties(
    properties: StackViewportProperties,
    suppressEvents?: boolean
  ): void;

  getImageData(): IImageData | CPUIImageData;
}
