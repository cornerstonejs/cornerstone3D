import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import cache from '../cache/cache';
import { MetadataModules, OrientationAxis } from '../enums';
import * as metaData from '../metaData';
import type {
  IImageVolume,
  OrientationVectors,
  Point3,
  ViewReference,
} from '../types';
import {
  createPlanarVolumeSliceBasis,
  getPlanarVolumeSliceGrid,
} from '../RenderingEngine/Viewports/Planar/planarSliceBasis';
import {
  getPlanarAcquisitionOrientation,
  normalizePlanarOrientation,
} from '../RenderingEngine/Viewports/Planar/planarRenderPathSelector';
import { getGridSliceIndex } from './volumeSliceGrid';
import { getVolumeGeometryFromImageIds } from './generateVolumePropsFromImageIds';

/** The orientations of a view whose slice grid `getVolumeSliceGrid` gives. */
type VolumeSliceGridOrientation =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.SAGITTAL
  | OrientationAxis.CORONAL
  | OrientationVectors;

/**
 * The volume and the view of `getVolumeSliceGrid`: the volume by its id, when
 * it is in the cache, or by its image ids, and the orientation of the view.
 */
type VolumeSliceGridOptions = {
  /** The id of a volume in the cache (`cache.getVolume`). */
  volumeId?: string;
  /**
   * The image ids of the volume, when it is not in the cache: their
   * `imagePlaneModule` metadata gives its geometry, and no pixel is loaded.
   */
  imageIds?: string[];
  /** The orientation of the view, as a planar mount takes it. ACQUISITION by default. */
  orientation?: VolumeSliceGridOrientation;
};

/**
 * The slice grid of a view of a volume, as a planar viewport in volume mode
 * shows that volume in that orientation: the slices that a scroll steps
 * through, their index and their position, and the slice that a mount with
 * no start opens on.
 */
type VolumeSliceGridInfo = {
  /** The frame of reference of the volume. */
  frameOfReferenceUID?: string;
  /** The view plane normal of the view, a unit vector toward the camera. */
  viewPlaneNormal: Point3;
  /** The view up of the view. */
  viewUp: Point3;
  /** The number of slices of the view: `getNumberOfSlices()` of the viewport. */
  numberOfSlices: number;
  /** The distance in mm between two adjacent slices, along the normal. */
  step: number;
  /** The slice that a mount with no start opens on: `getSliceIndex()` after it. */
  defaultSliceIndex: number;
  /** The focal point of the default slice: the camera focal point after such a mount. */
  defaultSliceWorldPoint: Point3;
  /**
   * The focal point of slice `sliceIndex` (kept between 0 and
   * `numberOfSlices - 1`), the focal point that `setImageIdIndex(sliceIndex)`
   * gives with no pan.
   */
  getSliceWorldPoint(sliceIndex: number): Point3;
  /** The index of the slice nearest to a world point. */
  getSliceIndex(worldPoint: Point3): number;
  /**
   * A view reference of slice `sliceIndex` (the default slice when not
   * given) by its point and its plane: the frame of reference, the focal
   * point, the view plane normal and the view up. It names no volume and no
   * slice index, so a mount of any volume of the frame of reference in this
   * orientation takes it as `initialViewReference` and starts on its slice
   * nearest to the point.
   */
  getViewReference(sliceIndex?: number): ViewReference;
};

/**
 * A volume of the geometry of a series of images, with no pixel data: what
 * the slice grid reads of a volume.
 */
function createGeometryVolume(imageIds: string[]): IImageVolume {
  const { dimensions, spacing, origin, direction, sortedImageIds } =
    getVolumeGeometryFromImageIds(imageIds);
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);

  return {
    dimensions,
    spacing,
    origin,
    direction,
    imageData,
    imageIds: sortedImageIds,
    metadata: {
      FrameOfReferenceUID: metaData.get(
        MetadataModules.IMAGE_PLANE,
        imageIds[0]
      )?.frameOfReferenceUID,
    },
  } as unknown as IImageVolume;
}

function getGridVolume(options: VolumeSliceGridOptions): IImageVolume {
  const { volumeId, imageIds } = options;

  if (volumeId) {
    const volume = cache.getVolume(volumeId);

    if (!volume) {
      throw new Error(
        `getVolumeSliceGrid: the volume ${volumeId} is not in the cache; give its image ids instead`
      );
    }

    return volume;
  }

  if (!imageIds?.length) {
    throw new Error('getVolumeSliceGrid: give a volumeId or imageIds');
  }

  return createGeometryVolume(imageIds);
}

/**
 * The slice grid of a view of a volume, as a planar viewport in volume mode
 * shows it, before any viewport shows it: the number of slices, the step
 * between them, the default slice (the one that a mount with no start opens
 * on, `floor(N / 2)` in view order), and the world point of each slice. It
 * runs the code of the viewport: the orientation as a mount resolves it, the
 * slice basis and the slice grid of `volume-slice-navigation`. So
 * `numberOfSlices`, `defaultSliceIndex` and `defaultSliceWorldPoint` are
 * what `getNumberOfSlices()`, `getSliceIndex()` and the camera focal point
 * of a viewport give after a mount of the volume in that orientation with no
 * start, and a view reference of `getViewReference(k)` as
 * `initialViewReference` starts a mount on slice k.
 *
 * The volume is one of the cache (`volumeId`; its pixels need not be
 * loaded) or the images of a series (`imageIds`), whose geometry comes from
 * the `imagePlaneModule` metadata of each image: `imageOrientationPatient`,
 * `pixelSpacing`, `rows`, `columns` and `frameOfReferenceUID` of the first
 * image, and `imagePositionPatient` of every image. No pixel is loaded.
 *
 * The orientation is ACQUISITION (the default), AXIAL, SAGITTAL, CORONAL or
 * view vectors (`{ viewPlaneNormal, viewUp }`). A name of a standard
 * orientation is the acquisition view when the images are in that plane
 * within half a slice, as a mount takes it. A reformat name
 * (`AXIAL_REFORMAT`, ...) is not taken: its vectors depend on the view on
 * display.
 *
 * The answer reads `rendering.sliceStepMeasure` of the configuration at the
 * time of the call, as the viewport does.
 *
 * @param options - The volume (`volumeId` or `imageIds`) and the orientation.
 * @returns The slice grid of the view.
 */
function getVolumeSliceGrid(
  options: VolumeSliceGridOptions
): VolumeSliceGridInfo {
  const requested = options.orientation ?? OrientationAxis.ACQUISITION;

  if (
    typeof requested === 'string' &&
    ![
      OrientationAxis.ACQUISITION,
      OrientationAxis.AXIAL,
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
    ].includes(requested)
  ) {
    throw new Error(
      `getVolumeSliceGrid: the orientation ${requested} is not taken; give ACQUISITION, AXIAL, SAGITTAL, CORONAL or view vectors`
    );
  }

  const imageVolume = getGridVolume(options);
  const orientation = normalizePlanarOrientation(
    requested,
    imageVolume.imageIds?.length
      ? getPlanarAcquisitionOrientation(imageVolume.imageIds, true)
      : undefined,
    imageVolume
  );
  const getSliceBasis = (imageIdIndex?: number) =>
    createPlanarVolumeSliceBasis({
      canvasWidth: 1,
      canvasHeight: 1,
      imageIdIndex,
      imageVolume,
      orientation,
    });
  const defaultSlice = getSliceBasis();
  const viewPlaneNormal = [
    ...defaultSlice.sliceBasis.viewPlaneNormal,
  ] as Point3;
  const viewUp = [...defaultSlice.sliceBasis.viewUp] as Point3;
  const grid = getPlanarVolumeSliceGrid(imageVolume, viewPlaneNormal);
  const frameOfReferenceUID = imageVolume.metadata?.FrameOfReferenceUID;
  const getSliceWorldPoint = (sliceIndex: number) =>
    [...getSliceBasis(sliceIndex).sliceBasis.sliceCenterWorld] as Point3;
  const defaultSliceIndex = defaultSlice.currentImageIdIndex;

  return {
    frameOfReferenceUID,
    viewPlaneNormal,
    viewUp,
    numberOfSlices: grid.maxSliceIndex + 1,
    step: grid.step,
    defaultSliceIndex,
    defaultSliceWorldPoint: [
      ...defaultSlice.sliceBasis.sliceCenterWorld,
    ] as Point3,
    getSliceWorldPoint,
    getSliceIndex: (worldPoint: Point3) =>
      getGridSliceIndex(
        grid,
        worldPoint[0] * viewPlaneNormal[0] +
          worldPoint[1] * viewPlaneNormal[1] +
          worldPoint[2] * viewPlaneNormal[2]
      ),
    getViewReference: (sliceIndex = defaultSliceIndex) => ({
      FrameOfReferenceUID: frameOfReferenceUID,
      cameraFocalPoint: getSliceWorldPoint(sliceIndex),
      viewPlaneNormal: [...viewPlaneNormal] as Point3,
      viewUp: [...viewUp] as Point3,
    }),
  };
}

export default getVolumeSliceGrid;
export type {
  VolumeSliceGridInfo,
  VolumeSliceGridOptions,
  VolumeSliceGridOrientation,
};
