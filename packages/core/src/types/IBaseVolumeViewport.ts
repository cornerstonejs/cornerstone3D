import type {
  IViewport,
  PlaneRestriction,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from './IViewport';
import type { BlendModes, OrientationAxis } from '../enums';
import type FlipDirection from './FlipDirection';
import type IImageData from './IImageData';
import type { IVolumeInput } from './IVolumeInput';
import type OrientationVectors from './OrientationVectors';
import type Point3 from './Point3';
import type VolumeViewportProperties from './VolumeViewportProperties';

/**
 * Public interface of the legacy volume viewports, `BaseVolumeViewport`.
 */
export interface IBaseVolumeViewport extends IViewport {
  useCPURendering: boolean;
  /**
   * Update the default properties for the volume viewport on the volume
   * @param ViewportProperties - The properties to set
   * @param volumeId - The volume id to set the default properties for (if `undefined`, we set the global default viewport properties)
   */
  setDefaultProperties(
    ViewportProperties: VolumeViewportProperties,
    volumeId?: string
  ): void;
  /**
   * Remove the global default properties of the viewport or remove default properties for a volumeId if specified
   * @param volumeId If given, we remove the default properties only for this volumeId, if not
   * the global default properties will be removed
   */
  clearDefaultProperties(volumeId?: string): void;
  /**
   * Gets a view target, allowing comparison between view positions as well
   * as restoring views later.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  /**
   * Find out if this viewport would show this view
   *
   * @param options - allows specifying whether the view COULD display this with
   *                  some modification - either navigation or displaying as volume.
   * @returns true if the target is compatible with this view
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /**
   * Scrolls the viewport in the given direction/amount
   */
  scroll(delta?: number): void;
  isInAcquisitionPlane(): boolean;
  /**
   * This will apply a camera orientation that is compatible with inPlaneVector1 and 2
   *
   * 1. If inPlaneVector1 and inPlaneVector2 are compatible with, no change.
   * 2. If dot products of the current view plane normal and inPlaneVector 1 and 2 are zero, no change
   *
   */
  setBestOrentation(inPlaneVector1: Point3, inPlaneVector2: Point3): void;
  /**
   * Sets the view reference given a referenced plane and the current
   * view plane normal being applied.
   * This will use the existing normal if compatible, otherwise will calculate
   * a new view plane normal as the referenced plane normal, or else the
   * cross product of the existing view plane normal and the inPlaneVector1
   */
  setViewPlane(planeRestriction: PlaneRestriction): void;
  /**
   * Navigates to the specified view reference.
   */
  setViewReference(viewRef: ViewReference): void;
  /**
   * Sets the properties for the volume viewport on the volume
   * and if setProperties is called for the first time, the properties will also become the default one.
   * (if fusion, it sets it for the first volume in the fusion)
   *
   * @param VolumeViewportProperties - The properties to set
   * @param [VolumeViewportProperties.voiRange] - Sets the lower and upper voi
   * @param [VolumeViewportProperties.VOILUTFunction] - Sets the voi mode (LINEAR, or SAMPLED_SIGMOID)
   * @param [VolumeViewportProperties.invert] - Inverts the color transfer function
   * @param [VolumeViewportProperties.colormap] - Sets the colormap
   * @param [VolumeViewportProperties.preset] - Sets the colormap preset
   * @param volumeId - The volume id to set the properties for (if undefined, the first volume)
   * @param suppressEvents - If true, the viewport will not emit events
   */
  setProperties(
    options?: VolumeViewportProperties,
    volumeId?: string,
    suppressEvents?: boolean
  ): void;
  /**
   * Get render passes for this viewport.
   * If sharpening or smoothing is enabled, returns appropriate render passes.
   * @returns Array of VTK render passes or null if no custom passes are needed
   */
  getRenderPasses: () => unknown[];
  /**
   * Reset the viewport properties to the default values
   */
  resetToDefaultProperties(volumeId: string): void;
  setSampleDistanceMultiplier(multiplier: number): void;
  /**
   * Retrieve the viewport default properties
   * @param volumeId If given, we retrieve the default properties of a volumeId if it exists
   * If not given,we return the global properties of the viewport
   * @returns default viewport properties including voi, invert, interpolation type, colormap
   */
  getDefaultProperties: (volumeId?: string) => VolumeViewportProperties;
  /**
   * Retrieve the viewport properties
   * @param volumeId - The volume id to get the properties for (if undefined, the first volume)
   * @returns viewport properties including voi, interpolation type: TODO: slabThickness, invert
   */
  getProperties: (
    volumeId?: string
  ) => VolumeViewportProperties | undefined | null;
  /**
   * Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  /**
   * Mounts display sets on the viewport, mirroring the GenericViewport
   * `setDisplaySets` API. The `displaySetId` is resolved through the registered
   * generic-viewport dataset metadata (see `genericViewportDisplaySetMetadataProvider`)
   * to its `imageIds`; a volume is created/cached from them (if not already
   * present) and loaded via `setVolumes`. Per-entry `options` (e.g. `callback`,
   * `blendMode`, `slabThickness`) are forwarded to the volume input. Resolution
   * and loading run inside {@link mountDisplaySets}, which records the mounted
   * entries after `setVolumes` so {@link getDisplaySets} reports them.
   *
   * @param entries - display set entries to mount; the first provides the volume.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate?: boolean,
    suppressEvents?: boolean
  ): Promise<void>;
  /**
   * It removes the volume actor from the Viewport. If the volume actor is not in
   * the viewport, it does nothing.
   * @param actorUIDs - Array of actor UIDs to remove. In case of simple volume it will
   * be the volume Id, but in case of Segmentation it will be `{volumeId}-{representationType}`
   * since the same volume can be rendered in multiple representations.
   * @param immediate - If true, the Viewport will be rendered immediately
   */
  removeVolumeActors(actorUIDs: string[], immediate?: boolean): void;
  /**
   * It sets the orientation for the camera, the orientation can be one of the
   * following: axial, sagittal, coronal, acquisition. Use the `Enums.OrientationAxis`
   * to set the orientation. The "acquisition" orientation is the orientation that
   * the volume was acquired in (scan axis).
   *
   * @param orientation - The orientation to set the camera to.
   * @param immediate - Whether the `Viewport` should be rendered as soon as the camera is set.
   */
  setOrientation(
    orientation: OrientationAxis | OrientationVectors,
    immediate?: boolean,
    suppressEvents?: boolean
  ): void;
  /**
   * Gets the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently from the camera provided or the viewport.
   *
   * @returns the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   */
  getRotation: () => number;
  /**
   * gets the visible bounds of the viewport in the world coordinate system
   */
  getBounds(): number[];
  /**
   * Flip the viewport along the desired axis
   * @param flipDirection - FlipDirection
   */
  flip(flipDirection: FlipDirection): void;
  /**
   * Checks if the viewport has a volume actor with the given volumeId
   * @param volumeId - the volumeId to look for
   * @returns Boolean indicating if the volume is present in the viewport
   */
  hasVolumeId(volumeId: string): boolean;
  /**
   * Checks if the viewport has a volume with the given volumeURI.
   *
   * @param volumeURI - The URI of the volume to check for.
   * @returns A boolean indicating whether the viewport contains a volume with the given URI.
   */
  hasVolumeURI(volumeURI: string): boolean;
  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   * Note: since the volume viewport supports fusion, to get the
   * image data for a specific volume, use the optional volumeId
   * argument.
   *
   * @param volumeId - The volumeId of the volume to get the image for.
   * @returns IImageData
   */
  getImageData(volumeId?: string): IImageData | undefined;
  hasImageURI: (imageURI: string) => boolean;
  /**
   * Gets the largest slab thickness from all actors in the viewport.
   *
   * @returns slabThickness - The slab thickness.
   */
  getSlabThickness(): number;
  /**
   * Given a point in world coordinates, return the intensity at that point
   * @param point - The point in world coordinates to get the intensity
   * from.
   * @returns The intensity value of the voxel at the given point.
   */
  getIntensityFromWorld(point: Point3): number;
  /**
   * Returns the list of image Ids for the current viewport
   *
   * @param volumeId - volumeId
   * @returns list of strings for image Ids
   */
  getImageIds: (volumeId?: string) => string[];
  getCurrentImageId(): string | undefined;
  /**
   * Gets the volumeId to use for references.
   * Returns undefined if the specified volume is NOT in this viewport.
   */
  getVolumeId(specifier?: ViewReferenceSpecifier): string;
  /**
   * For a volume viewport, the reference id will be a URN starting with
   * `volumeId:<volumeId>`, followed by additional arguments to specify
   * the view orientation.  This will end up being a unique string that
   * identifies the view reference being shown.  It is different from the
   * view reference in that the values are all incorporated into a string to
   * allow using it as a parameter key.
   */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate?: boolean
  ): void;
  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void;
  resetSlabThickness(): void;
  resetProperties(volumeId?: string): void;
  /**
   * Returns an array of all volumeIds currently in the viewport.
   *
   * @returns An array of strings representing all volumeIds.
   */
  getAllVolumeIds(): string[];
}
