import vtkBoundingBox from '@kitware/vtk.js/Common/DataModel/BoundingBox';
import type { Bounds } from '@kitware/vtk.js/types';
import { mat4, vec3 } from 'gl-matrix';
import * as metaData from '../../../metaData';
import type { CPUIImageData, IImage, Point3 } from '../../../types';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { getPlanarImageScaling } from './planarOrientationAndScaling';

/**
 * The image data of a stack image as the planar viewports give it from
 * `getImageData`, for the GPU and the CPU image paths.
 *
 * `scaling` is the scaling of the image, or for a PT image without one the
 * PT scaling of its scaling module, as a volume of the same series gives it.
 */
export function buildPlanarImageData(
  image: IImage,
  frameOfReferenceUID?: string
): CPUIImageData {
  const metadata = getImageDataMetadata(image);
  const { dimensions, direction, modality, origin, spacing } = metadata;
  // getImageDataMetadata().calibration is the DICOM calibration module; the USER
  // calibration (CalibrationLine -> calibratedPixelSpacing provider) is stored
  // separately, so merge it on top — mirroring legacy StackViewport.getImageData()
  // (`calibration: { ...csImage.calibration, ...this.calibration }`). Without this,
  // native getImageData().calibration ignores user calibration and length tools never
  // rescale after calibrateImageSpacing().
  const userCalibration = metaData.get(
    'calibratedPixelSpacing',
    image.imageId
  ) as Record<string, unknown> | undefined;
  const calibration = userCalibration
    ? { ...metadata.calibration, ...userCalibration }
    : metadata.calibration;
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const scalarData =
    image.voxelManager?.getScalarData() || image.getPixelData?.();

  return {
    dimensions,
    spacing,
    origin,
    direction,
    metadata: {
      Modality: modality,
      FrameOfReferenceUID: frameOfReferenceUID,
    },
    imageData: {
      getDirection: () => direction,
      getDimensions: () => dimensions,
      getScalarData: () => scalarData,
      getSpacing: () => spacing,
      getBounds: () => getPlanarImageBounds(metadata),
      worldToIndex: (point: Point3) => {
        const diff = vec3.subtract(
          vec3.create(),
          point as unknown as vec3,
          origin as unknown as vec3
        );

        return [
          vec3.dot(diff, rowVector as unknown as vec3) / spacing[0],
          vec3.dot(diff, columnVector as unknown as vec3) / spacing[1],
          0,
        ] as Point3;
      },
      indexToWorld: (point: Point3) => {
        const worldPoint = [...origin] as Point3;

        vec3.scaleAndAdd(
          worldPoint as unknown as vec3,
          worldPoint as unknown as vec3,
          rowVector as unknown as vec3,
          point[0] * spacing[0]
        );
        vec3.scaleAndAdd(
          worldPoint as unknown as vec3,
          worldPoint as unknown as vec3,
          columnVector as unknown as vec3,
          point[1] * spacing[1]
        );

        return worldPoint;
      },
    },
    scalarData,
    scaling:
      image.scaling ??
      (modality === 'PT' ? getPlanarImageScaling(image.imageId) : undefined),
    hasPixelSpacing: Boolean(image.rowPixelSpacing || image.columnPixelSpacing),
    calibration,
    preScale: image.preScale,
    voxelManager: image.voxelManager,
  };
}

/**
 * The index to world matrix of the image data of a stack image, as
 * `getIndexToWorld` of the vtkImageData of the legacy stack viewport gives
 * it: the matrix of the direction, spacing and origin.
 */
function getPlanarIndexToWorldMatrix(
  imageData: Pick<CPUIImageData, 'direction' | 'spacing' | 'origin'>
): mat4 {
  const { direction, spacing, origin } = imageData;

  return mat4.fromValues(
    direction[0] * spacing[0],
    direction[1] * spacing[0],
    direction[2] * spacing[0],
    0,
    direction[3] * spacing[1],
    direction[4] * spacing[1],
    direction[5] * spacing[1],
    0,
    direction[6] * spacing[2],
    direction[7] * spacing[2],
    direction[8] * spacing[2],
    0,
    origin[0],
    origin[1],
    origin[2],
    1
  );
}

/**
 * The world to index matrix of the image data of a stack image, as
 * `getWorldToIndex` of the vtkImageData of the legacy stack viewport gives
 * it: the inverse of the matrix of the direction, spacing and origin.
 */
export function getPlanarWorldToIndexMatrix(
  imageData: Pick<CPUIImageData, 'direction' | 'spacing' | 'origin'>
): mat4 {
  return mat4.invert(mat4.create(), getPlanarIndexToWorldMatrix(imageData));
}

/**
 * The world bounds `[xMin, xMax, yMin, yMax, zMin, zMax]` of the image data
 * of a stack image, as `getBounds` of the vtkImageData of the legacy stack
 * viewport gives them: the box around the voxels of the image, half a voxel
 * past the centre of the outer ones, from the origin, direction, spacing and
 * dimensions.
 */
function getPlanarImageBounds(
  imageData: Pick<
    CPUIImageData,
    'dimensions' | 'direction' | 'spacing' | 'origin'
  >
): Bounds {
  const [columns, rows, slices] = imageData.dimensions;

  return vtkBoundingBox.transformBounds(
    [-0.5, columns - 0.5, -0.5, rows - 0.5, -0.5, slices - 0.5],
    getPlanarIndexToWorldMatrix(imageData),
    [...vtkBoundingBox.INIT_BOUNDS]
  );
}
