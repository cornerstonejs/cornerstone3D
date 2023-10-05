import { getEnabledElement, Enums } from '@cornerstonejs/core';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { VolumeViewport3D } from '@cornerstonejs/core';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

const polyDataCache = new Map();

/**
 * Transforms a point into an string, by converting the numbers with five decimals
 * @param point
 * @returns
 */
function pointToString(point) {
  return (
    parseFloat(point[0]).toFixed(5) +
    ',' +
    parseFloat(point[1]).toFixed(5) +
    ',' +
    parseFloat(point[2]).toFixed(5) +
    ','
  );
}

function getNearestPoint(nextToFind, points, pointsUsed) {
  function getPoint(idx) {
    return [points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2]];
  }
  const reference = getPoint(nextToFind);
  let winner = -1;
  let minDistance = 10000000;
  pointsUsed.forEach((pointUsed) => {
    const point = getPoint(pointUsed);
    const distance =
      Math.abs(reference[0] - point[0]) +
      Math.abs(reference[1] - point[1]) +
      Math.abs(reference[2] - point[2]);
    if (minDistance > distance) {
      minDistance = distance;
      winner = pointUsed;
    }
  });
  if (minDistance < 1) {
    return winner;
  } else {
    return -1;
  }
}

function getAvailablePoints(tupleArray) {
  const availablePoints = [];
  for (let i = 0; i < tupleArray.length; i++) {
    if (tupleArray[i]) {
      availablePoints.push(i);
    }
  }
  return availablePoints;
}
function getFirstAvailable(tupleArray) {
  for (let i = 0; i < tupleArray.length; i++) {
    if (tupleArray[i]) {
      return tupleArray[i][0];
    }
  }
  return -1;
}
/**
 * Converts a contour polydata into a closed polygon
 * @param polyData
 * @returns
 */
function convertContourToPolygon(polyData) {
  const newPolyData = vtkPolyData.newInstance();
  const points = polyData.getPoints().getData();
  newPolyData.getPoints().setData(points, 3);

  const linesData = polyData.getLines().getData();
  const numberOfPoints = polyData.getNumberOfPoints();
  // creating array of tuples
  let idx = 0;
  const tupleArray = [];
  while (idx < linesData.length) {
    const size = linesData[idx];
    idx++;
    const tuple = [];
    for (let i = 0; i < size; i++) {
      tuple.push(linesData[idx + i]);
    }
    tupleArray[tuple[0]] = tuple;
    idx = idx + size;
  }

  const polyArray = [];
  // uniting all tuples in polygons
  const pointsInserted = 0;
  while (pointsInserted < numberOfPoints) {
    const poly = [];
    let nextToFind;
    if (polyArray.length) {
      nextToFind = getNearestPoint(
        polyArray[polyArray.length - 1],
        points,
        getAvailablePoints(tupleArray)
      );
    } else {
      nextToFind = getFirstAvailable(tupleArray);
    }
    if (nextToFind === -1) {
      break;
    }
    poly.push(nextToFind);
    while (tupleArray[nextToFind]) {
      const indexToAdd = tupleArray[nextToFind][1];
      if (tupleArray[indexToAdd]) {
        poly.push(indexToAdd);
      }
      tupleArray[nextToFind] = undefined;
      nextToFind = indexToAdd;
    }
    polyArray.push(...poly);
  }

  polyArray.unshift(polyArray.length);
  const polygon = vtkCellArray.newInstance({
    values: Uint32Array.from(polyArray),
  });
  newPolyData.setPolys(polygon);
  return newPolyData;
}

/**
 * Updates the clipping planes ofa surface and caches the resulting poly data
 * @param evt
 */
function updateClippingPlanes(evt) {
  const { actorEntry, focalPoint, vtkPlanes } = evt.detail;
  if (actorEntry?.clippingFilter) {
    const mapper = actorEntry.actor.getMapper();
    const focalIndex = pointToString(focalPoint);
    let actorCache = polyDataCache.get(actorEntry.uid);
    if (!actorCache) {
      actorCache = new Map();
      polyDataCache.set(actorEntry.uid, actorCache);
    }
    let polyData = actorCache.get(focalIndex);
    if (!polyData) {
      const clippingFilter = actorEntry.clippingFilter;
      clippingFilter.setClippingPlanes(vtkPlanes);
      try {
        clippingFilter.update();
        polyData = clippingFilter.getOutputData();
        //polyData = convertContourToPolygon(polyData);
        actorCache.set(focalIndex, polyData);
      } catch {
        console.error('Error clipping surface');
      }
    }
    mapper.setInputData(polyData);
  }
}

function addSurfaceToElement(
  element: HTMLDivElement,
  surface: any,
  actorUID: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const points = surface.getPoints();
  const polys = surface.getPolys();
  const color = surface.getColor();

  const polydata = vtkPolyData.newInstance();
  polydata.getPoints().setData(points, 3);

  const triangles = vtkCellArray.newInstance({
    values: Float32Array.from(polys),
  });
  polydata.setPolys(triangles);

  const mapper = vtkMapper.newInstance({});
  let clippingFilter;
  if (!(viewport instanceof VolumeViewport3D)) {
    clippingFilter = vtkClipClosedSurface.newInstance({
      clippingPlanes: [],
      activePlaneId: 2,
      passPointData: false,
    });
    clippingFilter.setInputData(polydata);
    clippingFilter.setGenerateOutline(true);
    clippingFilter.setGenerateFaces(false);
    clippingFilter.update();
    const filteredData = clippingFilter.getOutputData();
    mapper.setInputData(filteredData);
  } else {
    mapper.setInputData(polydata);
  }

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  actor.getProperty().setColor(color[0] / 255, color[1] / 255, color[2] / 255);
  //actor.getProperty().setLineWidth(10);
  viewport.addActor({
    actor,
    uid: actorUID,
    clippingFilter,
  });

  element.addEventListener(
    Enums.Events.UPDATE_CLIPPING_PLANES,
    updateClippingPlanes
  );
}

export default addSurfaceToElement;
