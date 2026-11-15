import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { type Types, utilities } from '@cornerstonejs/core';
import {
  createSliceImageData,
  getSliceRenderingCamera,
  type SliceRenderingCamera,
  type SliceRenderingViewport,
} from './volumeLabelmapSliceData';

type ResampledSliceGeometry = {
  origin: Types.Point3;
  xDirection: Types.Point3;
  yDirection: Types.Point3;
  zDirection: Types.Point3;
  spacing: Types.Point2;
  width: number;
  height: number;
  sliceIndex: number;
};

type PlanarSliceImageData = {
  imageData: vtkImageData;
  sliceIndex: number;
};

/**
 * Returns the geometry of the labelmap slice for a view that is not aligned
 * with the rows and columns of the volume, or undefined when the view plane
 * does not cut the volume.
 */
function getResampledSliceGeometry(
  viewport: SliceRenderingViewport,
  volume: Types.IImageVolume,
  camera: SliceRenderingCamera | undefined = getSliceRenderingCamera(viewport)
): ResampledSliceGeometry | undefined {
  if (!camera) {
    return;
  }

  return utilities.getVolumeSliceGeometry(volume, camera);
}

/**
 * Creates the labelmap slice image for a view that is not aligned with the
 * rows and columns of the volume: a view rotated in its own plane, or an
 * oblique view. The image lies in the view plane, in world coordinates.
 */
function createResampledSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport,
  camera: SliceRenderingCamera | undefined = getSliceRenderingCamera(viewport)
): PlanarSliceImageData | undefined {
  const geometry = getResampledSliceGeometry(viewport, volume, camera);

  if (!geometry) {
    return;
  }

  const { pixelData } = utilities.sampleVolumeSlice({ volume, geometry });
  const dataType = vtkDataArray.getDataType(pixelData as never);
  const scalarArray = vtkDataArray.newInstance({
    dataType,
    name: 'Pixels',
    numberOfComponents: 1,
    values: pixelData,
  });
  const imageData = vtkImageData.newInstance();

  imageData.set({ dataType, numberOfComponents: 1 }, true);
  imageData.setDimensions(geometry.width, geometry.height, 1);
  imageData.setSpacing([geometry.spacing[0], geometry.spacing[1], 1]);
  imageData.setDirection(
    new Float32Array([
      ...geometry.xDirection,
      ...geometry.yDirection,
      ...geometry.zDirection,
    ])
  );
  imageData.setOrigin(geometry.origin);
  imageData.getPointData().setScalars(scalarArray);
  imageData.modified();

  return {
    imageData,
    sliceIndex: geometry.sliceIndex,
  };
}

/**
 * Creates the labelmap slice image for a planar viewport. A view aligned with
 * the rows and columns of the volume copies one slice of voxels. Any other
 * view takes the nearest voxel for each pixel of the view plane, also a view
 * with a small tilt that the aligned copy would accept.
 */
function createPlanarSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport,
  camera: SliceRenderingCamera | undefined = getSliceRenderingCamera(viewport)
): PlanarSliceImageData | undefined {
  if (!camera) {
    return;
  }

  // Only a view plane inside one slice of voxels gets the exact copy.
  const alignedSlice =
    utilities.getExactSliceAxis(volume, camera.viewPlaneNormal) !== undefined
      ? createSliceImageData(volume, viewport, camera)
      : undefined;

  if (alignedSlice) {
    return {
      imageData: alignedSlice.imageData,
      sliceIndex: alignedSlice.state.sliceIndex,
    };
  }

  return createResampledSliceImageData(volume, viewport, camera);
}

/**
 * Whether a planar viewport can show a labelmap slice of the volume in a view
 * that is not aligned with the rows and columns of the volume.
 */
function canCreateResampledSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport,
  camera: SliceRenderingCamera | undefined = getSliceRenderingCamera(viewport)
): boolean {
  return !!getResampledSliceGeometry(viewport, volume, camera);
}

export {
  canCreateResampledSliceImageData,
  createPlanarSliceImageData,
  createResampledSliceImageData,
  getResampledSliceGeometry,
};
export type { PlanarSliceImageData, ResampledSliceGeometry };
