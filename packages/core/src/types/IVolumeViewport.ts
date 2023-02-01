import Point2 from './Point2';
import Point3 from './Point3';
import { IViewport } from './IViewport';
import { IVolumeInput } from './IVolumeInput';
import FlipDirection from './FlipDirection';
import IImageData from './IImageData';
import { BlendModes, OrientationAxis } from '../enums';
import { VolumeViewportProperties } from '.';

/**
 * Interface for the Volume Viewport
 */
export default interface IVolumeViewport extends IViewport {
  useCPURendering: boolean;
  getFrameOfReferenceUID: () => string;
  getProperties: () => any;
  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   */
  worldToCanvas: (worldPos: Point3) => Point2;
  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to calculate the slice index.
   */
  getCurrentImageIdIndex: () => number;

  /**
   * Checks if the viewport has a volume actor with the given volumeId
   */
  hasVolumeId: (volumeId: string) => boolean;

  /**
   * if the volume viewport has imageURI (no loader schema)
   * in one of its volume actors
   */
  hasImageURI: (imageURI: string) => boolean;

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to find which imageId is
   * currently being viewed.
   */
  getCurrentImageId: () => string;
  /**
   * Sets the properties for the viewport. If no volumeId is provided
   * it applies the properties to the default volume actor (first volume)
   */
  setProperties(
    { voiRange }: VolumeViewportProperties,
    volumeId?: string,
    suppressEvents?: boolean
  ): void;
  /**
   * Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   */
  setVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   */
  addVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  /**
   * It removes the volume actor from the Viewport. If the volume actor is not in
   * the viewport, it does nothing.
   */
  removeVolumeActors(actorUIDs: Array<string>, immediate?: boolean): void;

  /**
   * Given a point in world coordinates, return the intensity at that point
   */
  getIntensityFromWorld(point: Point3): number;
  /**
   * getBounds gets the visible bounds of the viewport
   */
  getBounds(): any;
  /**
   * Flip the viewport along the desired axis
   */
  flip(flipDirection: FlipDirection): void;
  /**
   * Reset the camera for the volume viewport
   */
  resetCamera(
    resetPan?: boolean,
    resetZoom?: boolean,
    resetToCenter?: boolean
  ): boolean;
  /**
   * Sets the blendMode for actors of the viewport.
   */
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: Array<string>,
    immediate?: boolean
  ): void;
  /**
   * Sets the slab thickness for actors of the viewport.
   */
  setSlabThickness(
    slabThickness: number,
    filterActorUIDs?: Array<string>
  ): void;
  /**
   * Gets the slab thickness option in the `Viewport`'s `options`.
   */
  getSlabThickness(): number;
  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   * Note: since the volume viewport supports fusion, to get the
   * image data for a specific volume, use the optional volumeId
   * argument.
   */
  getImageData(volumeId?: string): IImageData | undefined;

  setOrientation(orientation: OrientationAxis): void;
}
