import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import {
  VolumeViewport,
  VolumeViewport3D,
  CONSTANTS,
} from '@cornerstonejs/core';
import { jumpToSlice } from '../viewport';
import { polyDataUtils, viewport } from '..';

/**
 * Create a surface actor with vtkClipClosedSurface filter
 * @param points
 * @param polys
 * @param viewport
 * @returns
 */
function createSurfaceActor(points, polys, viewport) {
  if (viewport instanceof VolumeViewport3D) {
    throw new Error('Invalid viewport type');
  }

  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(points, 3);

  const triangles = vtkCellArray.newInstance({
    values: Float32Array.from(polys),
  });
  polyData.setPolys(triangles);

  const mapper = vtkMapper.newInstance({});
  const clippingFilter = vtkClipClosedSurface.newInstance({
    clippingPlanes: [],
    activePlaneId: 2,
    passPointData: false,
  });
  clippingFilter.setInputData(polyData);
  clippingFilter.setGenerateOutline(true);
  clippingFilter.setGenerateFaces(false);
  clippingFilter.update();
  const filteredData = clippingFilter.getOutputData();
  mapper.setInputData(filteredData);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  return { clippingFilter, actor };
}

/**
 * Create clipping planes using viewport current position
 * @param viewport
 * @returns
 */
function createClippingPlanesFromViewportPosition(viewport) {
  const vtkPlanes = [vtkPlane.newInstance(), vtkPlane.newInstance()];
  const slabThickness = CONSTANTS.RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
  const { viewPlaneNormal, focalPoint } = viewport.getCamera();

  viewport.setOrientationOfClippingPlanes(
    vtkPlanes,
    slabThickness,
    viewPlaneNormal,
    focalPoint
  );
  return vtkPlanes;
}

/**
 * Extract a contour from a surface
 *
 * @remarks
 * This function will use a mapper from a viewport to retrieve its clipping planes
 * and use them to cut the surface and extract its resulting contours
 * @param mapper
 * @param clippingFilter
 * @returns
 */
export function extractContourFromSurface(viewport, mapper, clippingFilter) {
  const vtkPlanes = createClippingPlanesFromViewportPosition(viewport);

  clippingFilter.setClippingPlanes(vtkPlanes);
  try {
    clippingFilter.update();
    const polyData = clippingFilter.getOutputData();
    return polyDataUtils.getPolyDataPoints(polyData);
  } catch (e) {
    console.error('Error clipping surface', e);
  }
}

/**
 * Creates an array of contours, one for each slice, from a surface
 *
 * @remarks
 * This function creates a surface actor and use a given viewport to iterate
 * through each slice and use its modified clipping planes to cut a surface
 * and extract its contours
 *
 * @param points
 * @param polys
 * @param viewport
 * @returns
 */
export async function getContoursForSlices({ points, polys }, viewport) {
  const mapper = viewport.getDefaultActor()?.actor?.getMapper();
  if (!mapper) {
    return;
  }
  const { clippingFilter } = createSurfaceActor(points, polys, viewport);
  const numberOfSlices = viewport.getImageIds().length;
  const isVolumeViewport = viewport instanceof VolumeViewport;
  const contours = [];
  for (let i = 0; i < numberOfSlices; i++) {
    const index = isVolumeViewport ? numberOfSlices - i - 1 : i;
    await jumpToSlice(viewport.element, {
      imageIndex: index,
      debounceLoading: false,
    });
    const contour = extractContourFromSurface(viewport, mapper, clippingFilter);
    if (contour) {
      contours.push(contour);
    }
  }
  return contours;
}
