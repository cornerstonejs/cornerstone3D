import type { IBaseVolumeViewport } from './IBaseVolumeViewport';
import type { mat4 } from 'gl-matrix';
import type { BlendModes } from '../enums';
import type Point3 from './Point3';
import type { ViewReference, ViewReferenceSpecifier } from './IViewport';
import type { PixelDataTypedArray } from './PixelDataTypedArray';

/**
 * Public interface of the legacy orthographic volume viewport, `VolumeViewport`.
 */
interface IVolumeViewport extends IBaseVolumeViewport {
  /** Gets the number of slices the volume is broken up into in the camera direction */
  getNumberOfSlices: () => number;
  jumpToWorld(worldPos: Point3): boolean;
  /**
   * Gets the blend mode for the volume viewport. If filterActorUIDs is provided,
   * it will return the blend mode for the first matching actor. Otherwise, it returns
   * the blend mode of the first actor.
   *
   * @param filterActorUIDs - Optional array of actor UIDs to filter by
   * @returns The blend mode of the matched actor
   */
  getBlendMode(filterActorUIDs?: string[]): BlendModes;
  /**
   * Sets the blend mode for actors in the volume viewport. Can optionally filter which
   * actors to apply the blend mode to using filterActorUIDs.
   *
   * @param blendMode - The blend mode to set
   * @param filterActorUIDs - Optional array of actor UIDs to filter which actors to update
   * @param immediate - Whether to render the viewport immediately after setting the blend mode
   */
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: unknown[],
    immediate?: boolean
  ): void;
  resetCameraForResize: () => boolean;
  /**
   * Reset the camera for the volume viewport
   */
  resetCamera(options?: unknown): boolean;
  /**
   * It sets the slabThickness of the actors of the viewport. If filterActorUIDs are
   * provided, only the actors with the given UIDs will be affected. If no
   * filterActorUIDs are provided, all actors will be affected.
   *
   * @param slabThickness - The slab thickness to set.
   * @param filterActorUIDs - Optional argument to filter the actors to apply
   * the slab thickness to (if not provided, all actors will be affected).
   */
  setSlabThickness(slabThickness: number, filterActorUIDs?: unknown[]): void;
  /**
   * Uses the origin and focalPoint to calculate the slice index.
   
   
   
   * Resets the slab thickness of the actors of the viewport to the default value.
   */
  resetSlabThickness(): void;
  /**
   * Uses the slice range information to compute the current image id index.
   * Note that this may be offset from the origin location, or opposite in
   * direction to the distance from the origin location, as the index is a
   * complete index from minimum to maximum.
   *
   * @returns The slice index in the direction of the view.  This index is in
   * the same position/size/direction as the scroll utility.  That is,
   * ```scroll(dir)```
   * and
   * ```viewport.setView(viewport.getView({sliceIndex: viewport.getCurrentImageIdIndex()+dir}))```
   *
   * have the same affect, excluding end/looping conditions.
   */
  getCurrentImageIdIndex: (
    volumeId?: string,
    useSlabThickness?: boolean
  ) => number;
  /**
   * Returns the image index associated with the volume viewport in the current view, the difference
   * between this method and getCurrentImageIdIndex is that this method returns the index of the
   * slice in the volume in view direction so at the top (scrollbar top) of the viewport the index
   * will be 0 and at the bottom (scrollbar bottom) the index will be the number of slices - 1.
   * But the getCurrentImageIdIndex returns the index of current image in the imageIds
   * which is not guaranteed to be the same as the slice index in the view.
   *
   * @returns The image index.
   */
  getSliceIndex: () => number;
  /**
   * Returns detailed information about the current slice view in the volume viewport.
   * This method provides comprehensive data about the slice's position, orientation,
   * and dimensions within the volume.
   *
   * @returns An object containing the following properties:
   * @property sliceIndex - The current slice index in the view direction.
   * @property slicePlane - The axis along which the slicing is performed (0 for X, 1 for Y, 2 for Z).
   * @property width - The width of the slice in voxels.
   * @property height - The height of the slice in voxels.
   * @property sliceToIndexMatrix - A 4x4 matrix for transforming from slice coordinates to volume index coordinates.
   * @property indexToSliceMatrix - A 4x4 matrix for transforming from volume index coordinates to slice coordinates.
   *
   * @throws {Error} If the view is oblique or if the slice axis cannot be determined.
   */
  getSliceViewInfo(): {
    sliceIndex: number;
    slicePlane: number;
    width: number;
    height: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  };
  /**
   * Retrieves the pixel data for the current slice being displayed in the viewport.
   *
   * Note: this method cannot return the oblique planes pixel data as they
   * are interpolated in the gpu side
   *
   * @returns The pixel data for the current slice, which can be in any of the axial, sagittal
   * or coronal directions
   *
   */
  getCurrentSlicePixelData(): PixelDataTypedArray;
  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to find which imageId is
   * currently being viewed.
   *
   * @returns ImageId
   */
  getCurrentImageId: () => string | undefined;
  /**
   * Gets a view target, allowing comparison between view positions as well
   * as restoring views later.
   * Add the referenced image id.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  /**
   * Reset the viewport properties to the default values
   *
   
   * @param volumeId - Optional volume ID to specify which volume properties to reset.
   * If not provided, it will reset the properties of the default actor.
   *
   * @returns void
   */
  resetProperties(volumeId?: string): void;
  /**
   * Retrieves the clipping planes for the slices in the volume viewport.
   * @returns An array of vtkPlane objects representing the clipping planes, or an array of objects with normal and origin properties if raw is true.
   */
  getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: { normal: Point3; origin: Point3 }[];
  }[];
  /**
   * Returns an array of 3D coordinates representing the slice plane positions.
   * It starts by the focal point as a reference point on the current slice that
   * the camera is looking at, and then it calculates the slice plane positions
   * by moving the focal point in the direction of the view plane normal back and
   * forward, and snaps them to the slice.
   *
   * @returns An array of Point3 representing the slice plane coordinates.
   */
  getSlicePlaneCoordinates: () => { sliceIndex: number; point: Point3 }[];
}

export type { IVolumeViewport as default };
