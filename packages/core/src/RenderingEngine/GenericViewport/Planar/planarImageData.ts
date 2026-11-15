import { vec3 } from 'gl-matrix';
import * as metaData from '../../../metaData';
import type { CPUIImageData, IImage, Point3 } from '../../../types';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';

/**
 * The image data of a stack image as the planar viewports give it from
 * `getImageData`, for the GPU and the CPU image paths.
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
    scaling: image.scaling,
    hasPixelSpacing: Boolean(image.rowPixelSpacing || image.columnPixelSpacing),
    calibration,
    preScale: image.preScale,
    voxelManager: image.voxelManager,
  };
}
