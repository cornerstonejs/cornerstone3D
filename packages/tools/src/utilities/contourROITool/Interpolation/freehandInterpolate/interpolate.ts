import { StackViewport, triggerEvent } from '@cornerstonejs/core';
import getToolData from '../getToolData';
import generateInterpolationData from './generateInterpolationData';
import TOOL_NAMES from '../toolNames';
import type { InterpolationViewportData } from '../InterpolationTypes';
import { InterpolationROIAnnotation } from '../../../../types/ToolSpecificAnnotationTypes';
import { AnnotationInterpolationCompletedEventDetail } from '../../../../types/EventTypes';
import { annotation } from '../../../../index';
import EventTypes from '../../../../enums/Events';

const dP = 0.2; // Aim for < 0.2mm between interpolated nodes when super-sampling.

/**
 * interpolate - Interpolate missing contours in the ROIContours.
 * If input is tool data collection, it is expected to be sorted in the order of stack image in which it was drawn
 *
 * @param viewportData - Object
 * @returns null
 */
function interpolate(viewportData: InterpolationViewportData) {
  setTimeout(() => {
    startInterpolation(viewportData);
  }, 1);
}

/**
 * Start the actual interpolation from the list
 * @param viewportData - Object
 * @returns null
 */
function startInterpolation(viewportData: InterpolationViewportData) {
  const toolData = viewportData.annotation;
  const { interpolationData, interpolationList } = generateInterpolationData(
    toolData,
    viewportData
  );

  const eventData = {
    toolName: toolData.metadata.toolName,
    toolType: toolData.metadata.toolName,
    viewport: viewportData.viewport,
  };
  for (let i = 0; i < interpolationList.length; i++) {
    if (interpolationList[i]) {
      _linearlyInterpolateBetween(
        interpolationList[i].list,
        interpolationList[i].pair,
        interpolationData,
        eventData
      );
    }
  }

  const { id, renderingEngineId, element } = viewportData.viewport;

  const eventDetails: AnnotationInterpolationCompletedEventDetail = {
    annotation: toolData,
    element,
    viewportId: id,
    renderingEngineId,
  };

  if (interpolationList.length) {
    triggerEvent(
      viewportData.viewport.element,
      EventTypes.ANNOTATION_INTERPOLATION_PROCESS_COMPLETED,
      eventDetails
    );
  }
}

/**
 * _linearlyInterpolateBetween - Linearly interpolate all the slices in the
 * indices array between the contourPair.
 *
 * @param indicies - Number[], An array of slice indices to interpolate.
 * @param annotationPair - Number[], The slice indicies of the reference contours.
 * @param interpolationData - object
 * @param eventData - object
 * @returns null
 */

function _linearlyInterpolateBetween(
  indicies,
  annotationPair,
  interpolationData,
  eventData
) {
  const c1 = _generateClosedContour(
    interpolationData[annotationPair[0]].annotations[0].data.polyline
  );
  const c2 = _generateClosedContour(
    interpolationData[annotationPair[1]].annotations[0].data.polyline
  );

  const { c1Interp, c2Interp } = _generateInterpolationContourPair(c1, c2);

  // Using the newly constructed contours, interpolate each ROI.
  indicies.forEach(function (index) {
    _linearlyInterpolateContour(
      c1Interp,
      c2Interp,
      index,
      annotationPair,
      interpolationData,
      c1.x.length > c2.x.length,
      eventData
    );
  });
}

/**
 * _linearlyInterpolateContour - Inserts a linearly interpolated contour at
 * specified slice index.
 *
 * @param c1Interp - object, The first reference contour.
 * @param c2Interp - object,  The second reference contour.
 * @param sliceIndex - Number, The slice index to interpolate.
 * @param annotationPair - Number[], The slice indicies of the reference contours.
 * @param interpolationData - object[], Data for the slice location of contours
 *                                  for the ROIContour.
 * @param c1HasMoreNodes - boolean, True if c1 has more nodes than c2.
 * @param eventData - object
 * @returns null
 */
function _linearlyInterpolateContour(
  c1Interp,
  c2Interp,
  sliceIndex,
  annotationPair,
  interpolationData,
  c1HasMoreNodes,
  eventData
) {
  const zInterp =
    (sliceIndex - annotationPair[0]) / (annotationPair[1] - annotationPair[0]);
  const interpolated3DPoints = _generateInterpolatedOpenContour(
    c1Interp,
    c2Interp,
    zInterp,
    c1HasMoreNodes
  );

  const c1Metadata = interpolationData[annotationPair[0]].annotations[0];

  if (interpolationData[sliceIndex].annotations) {
    _editInterpolatedContour(
      interpolated3DPoints,
      sliceIndex,
      c1Metadata,
      eventData
    );
  } else {
    _addInterpolatedContour(
      interpolated3DPoints,
      sliceIndex,
      c1Metadata,
      eventData
    );
  }
}

/**
 * _addInterpolatedContour - Adds a new contour to the imageId.
 *
 * @param interpolated3DPoints - object, The polygon to add to the ROIContour.
 * @param sliceIndex - Number, The slice index to interpolate..
 * @param referencedToolData - The toolData of another polygon in the
 * ROIContour, to assign appropriate metadata to the new polygon.
 * @param eventData - object
 * @returns null
 */
function _addInterpolatedContour(
  interpolated3DPoints: { x: number[]; y: number[]; z: number[] },
  sliceIndex: number,
  referencedToolData,
  eventData
) {
  const points = [];
  const { viewport } = eventData;

  for (let i = 0; i < interpolated3DPoints.x.length; i++) {
    points.push([
      interpolated3DPoints.x[i],
      interpolated3DPoints.y[i],
      interpolated3DPoints.z[i],
    ]);
  }

  const interpolatedAnnotation = getToolData(
    eventData,
    points,
    referencedToolData
  );

  if (eventData.viewport instanceof StackViewport) {
    const imageIds = eventData.viewport.getImageIds();
    interpolatedAnnotation.metadata.referencedImageId = imageIds[sliceIndex];
  }
  interpolatedAnnotation.metadata.referencedSliceIndex = sliceIndex;
  annotation.state.addAnnotation(
    interpolatedAnnotation,
    viewport.element,
    true
  );
}

/**
 * _editInterpolatedContour - Edits an interpolated polygon on the imageId
 * that corresponds to the specified ROIContour.
 *
 * @param interpolated3DPoints - object, The polygon to add to the ROIContour.
 * @param sliceIndex - Number, The slice index to interpolate.
 * @param referencedToolData - type, The toolData of another polygon in the
 * ROIContour, to assign appropriate metadata to the new polygon.
 * @param eventData - object
 * @returns null
 */
function _editInterpolatedContour(
  interpolated3DPoints: { x: number[]; y: number[]; z: number[] },
  sliceIndex,
  referencedToolData,
  eventData
) {
  const { viewport } = eventData;
  const annotations = annotation.state.getAnnotations(
    TOOL_NAMES.CONTOUR_ROI_TOOL,
    viewport.element
  );

  // Find the index of the polygon on this slice corresponding to
  // The ROIContour.
  let toolDataIndex;

  for (let i = 0; i < annotations.length; i++) {
    const annotation = annotations[i] as InterpolationROIAnnotation;
    if (
      annotation.interpolationUID === referencedToolData.interpolationUID &&
      annotation.metadata.referencedSliceIndex === sliceIndex
    ) {
      toolDataIndex = i;
      break;
    }
  }

  const oldToolData = annotations[toolDataIndex] as InterpolationROIAnnotation;
  const points = [];

  for (let i = 0; i < interpolated3DPoints.x.length; i++) {
    points.push([
      interpolated3DPoints.x[i],
      interpolated3DPoints.y[i],
      interpolated3DPoints.z[i],
    ]);
  }
  const interpolatedAnnotation = getToolData(eventData, points, oldToolData);
  interpolatedAnnotation.metadata.referencedImageId =
    oldToolData.metadata.referencedImageId;
  interpolatedAnnotation.metadata.referencedSliceIndex =
    oldToolData.metadata.referencedSliceIndex;
  // To update existing annotation, not intend to add or remove
  interpolatedAnnotation.annotationUID = oldToolData.annotationUID;
  // Skip triggering events on removal of interpolated roi's.
  annotation.state.removeAnnotation(oldToolData.annotationUID, true);
  annotation.state.addAnnotation(
    interpolatedAnnotation,
    viewport.element,
    true
  );
}

/**
 * _generateInterpolatedOpenContour - Interpolate an open contour between c1ir
 * and c2ir at the zInterp position.
 *
 * @param c1ir - object, The interpolated c1 contour with
 *                                  superfluous nodes removed.
 * @param c2ir - object, The interpolated c2 contour with
 *                                  superfluous nodes removed.
 * @param zInterp - Number, The z- coordinate of the desired
 *                                  interpolation.
 * @param c1HasMoreNodes - boolean, True if c1 has more original nodes
 *                                  than c2.
 * @returns object, The interpolated contour at z=zInterp.
 */
function _generateInterpolatedOpenContour(c1ir, c2ir, zInterp, c1HasMoreNodes) {
  const cInterp = {
    x: [],
    y: [],
    z: [],
  };

  const indicies = c1HasMoreNodes ? c1ir.I : c2ir.I;

  for (let i = 0; i < c1ir.x.length; i++) {
    if (indicies[i]) {
      cInterp.x.push(c1ir.x[i] + (c2ir.x[i] - c1ir.x[i]) * zInterp);
      cInterp.y.push(c1ir.y[i] + (c2ir.y[i] - c1ir.y[i]) * zInterp);
      cInterp.z.push(c1ir.z[i] + (c2ir.z[i] - c1ir.z[i]) * zInterp);
    }
  }

  return cInterp;
}

/**
 * _generateInterpolationContourPair - generates two aligned contours with an
 * equal number of nodes from which an intermediate contour may be interpolated.
 *
 * @param c1 - The first contour.
 * @param c2 - The second contour.
 * @returns -  An object containing the two contours.
 */
function _generateInterpolationContourPair(c1, c2) {
  const cumPerim1 = _getCumulativePerimeter(c1);
  const cumPerim2 = _getCumulativePerimeter(c2);

  const interpNodes = Math.max(
    Math.ceil(cumPerim1[cumPerim1.length - 1] / dP),
    Math.ceil(cumPerim2[cumPerim2.length - 1] / dP)
  );

  const cumPerim1Norm = _normalisedCumulativePerimeter(cumPerim1);
  const cumPerim2Norm = _normalisedCumulativePerimeter(cumPerim2);

  const numNodes1 = interpNodes + c2.x.length;
  const numNodes2 = interpNodes + c1.x.length;

  // concatinate p && cumPerimNorm
  const perim1Interp = _getInterpolatedPerim(numNodes1, cumPerim1Norm);
  const perim2Interp = _getInterpolatedPerim(numNodes2, cumPerim2Norm);

  const perim1Ind = _getIndicatorArray(c1, numNodes1);
  const perim2Ind = _getIndicatorArray(c2, numNodes2);

  const nodesPerSegment1 = _getNodesPerSegment(perim1Interp, perim1Ind);
  const nodesPerSegment2 = _getNodesPerSegment(perim2Interp, perim2Ind);

  const c1i = _getSuperSampledContour(c1, nodesPerSegment1);
  const c2i = _getSuperSampledContour(c2, nodesPerSegment2);

  // Keep c2i fixed and shift the starting node of c1i to minimise the total length of segments.
  _shiftSuperSampledContourInPlace(c1i, c2i);

  return _reduceContoursToOriginNodes(c1i, c2i);
}

/**
 * _reduceContoursToOriginNodes - Removes any nodes from the contours that don't
 * correspond to an original contour node.
 *
 * @param c1i - The first super-sampled contour.
 * @param c2i - The second super-sampled contour.
 * @returns  An object containing the two reduced contours.
 */
function _reduceContoursToOriginNodes(c1i, c2i) {
  const c1Interp = {
    x: [],
    y: [],
    z: [],
    I: [],
  };
  const c2Interp = {
    x: [],
    y: [],
    z: [],
    I: [],
  };

  for (let i = 0; i < c1i.x.length; i++) {
    if (c1i.I[i] || c2i.I[i]) {
      c1Interp.x.push(c1i.x[i]);
      c1Interp.y.push(c1i.y[i]);
      c1Interp.z.push(c1i.z[i]);
      c1Interp.I.push(c1i.I[i]);

      c2Interp.x.push(c2i.x[i]);
      c2Interp.y.push(c2i.y[i]);
      c2Interp.z.push(c2i.z[i]);
      c2Interp.I.push(c2i.I[i]);
    }
  }

  return {
    c1Interp,
    c2Interp,
  };
}

/**
 * _shiftSuperSampledContourInPlace - Shifts the indicies of c1i around to
 * minimize: SUM (|c1i[i]-c2i[i]|) from 0 to N.
 *
 * @param c1i - The contour to shift.
 * @param c2i - The reference contour.
 * modifies c1i
 * @returns null
 */
function _shiftSuperSampledContourInPlace(c1i, c2i) {
  const c1iLength = c1i.x.length;

  const optimal = {
    startingNode: 0,
    totalSquaredXYLengths: Infinity,
  };

  for (let startingNode = 0; startingNode < c1iLength; startingNode++) {
    let node = startingNode;

    // NOTE: 1) Ignore calculating Z, as the sum of all squared Z distances will always be a constant.
    // NOTE: 2) Don't need actual length, so don't worry about square rooting.
    let totalSquaredXYLengths = 0;

    for (let iteration = 0; iteration < c1iLength; iteration++) {
      totalSquaredXYLengths +=
        (c1i.x[node] - c2i.x[iteration]) ** 2 +
        (c1i.y[node] - c2i.y[iteration]) ** 2 +
        (c1i.z[node] - c2i.z[iteration]) ** 2;

      node++;

      if (node === c1iLength) {
        node = 0;
      }
    }

    if (totalSquaredXYLengths < optimal.totalSquaredXYLengths) {
      optimal.totalSquaredXYLengths = totalSquaredXYLengths;
      optimal.startingNode = startingNode;
    }
  }

  const node = optimal.startingNode;

  _shiftCircularArray(c1i.x, node);
  _shiftCircularArray(c1i.y, node);
  _shiftCircularArray(c1i.z, node);
  _shiftCircularArray(c1i.I, node);
}

/**
 * _shiftCircularArray - Shift the circular array by the count.
 *
 * @param arr - Array, The array.
 * @param count - Number, The shift.
 * @returns The shifted array.
 */
function _shiftCircularArray(arr, count) {
  count -= arr.length * Math.floor(count / arr.length);
  const slicedArray = arr.splice(0, count);
  arr.push(...slicedArray);
  return arr;
}

/**
 * _getSuperSampledContour - Generates a super sampled contour with additional
 * nodes added per segment.
 *
 * @param c - object, The original contour.
 * @param nodesPerSegment - Number[], An array of the number of nodes to add
 *                                    per line segment.
 * @returns object, The super sampled contour.
 */
function _getSuperSampledContour(c, nodesPerSegment) {
  const ci = {
    x: [],
    y: [],
    z: [],
    I: [],
  };

  // Length - 1, produces 'open' polygon.
  for (let n = 0; n < c.x.length - 1; n++) {
    // Add original node.
    ci.x.push(c.x[n]);
    ci.y.push(c.y[n]);
    ci.z.push(c.z[n]);
    ci.I.push(true);

    // Add linearly interpolated nodes.
    const xSpacing = (c.x[n + 1] - c.x[n]) / (nodesPerSegment[n] + 1);
    const ySpacing = (c.y[n + 1] - c.y[n]) / (nodesPerSegment[n] + 1);
    const zSpacing = (c.z[n + 1] - c.z[n]) / (nodesPerSegment[n] + 1);

    // Add other nodesPerSegment - 1 other nodes (as already put in original node).
    for (let i = 0; i < nodesPerSegment[n] - 1; i++) {
      ci.x.push(ci.x[ci.x.length - 1] + xSpacing);
      ci.y.push(ci.y[ci.y.length - 1] + ySpacing);
      ci.z.push(ci.z[ci.z.length - 1] + zSpacing);
      ci.I.push(false);
    }
  }

  return ci;
}

/**
 * _getNodesPerSegment - Returns an array of the number of interpolated nodes
 * to be added along each line segment of a polygon.
 *
 * @param perimInterp - Number[], Normalized array of original and added nodes.
 * @param perimInd - boolean[], The indicator array describing the location of
 *                            the original contour's nodes.
 * @returns Number[], An array containing the number of nodes to be
 *                    added per original line segment.
 */
function _getNodesPerSegment(perimInterp, perimInd) {
  const idx = [];

  for (let i = 0; i < perimInterp.length; ++i) {
    idx[i] = i;
  }
  idx.sort(function (a, b) {
    return perimInterp[a] < perimInterp[b] ? -1 : 1;
  });

  const perimIndSorted = [];

  for (let i = 0; i < perimInd.length; i++) {
    perimIndSorted.push(perimInd[idx[i]]);
  }

  const indiciesOfOriginNodes = perimIndSorted.reduce(function (
    arr,
    elementValue,
    i
  ) {
    if (elementValue) {
      arr.push(i);
    }
    return arr;
  },
  []);

  const nodesPerSegment = [];

  for (let i = 0; i < indiciesOfOriginNodes.length - 1; i++) {
    nodesPerSegment.push(
      indiciesOfOriginNodes[i + 1] - indiciesOfOriginNodes[i]
    );
  }

  return nodesPerSegment;
}

/**
 * _getIndicatorArray - Produces an array of the location of the original nodes
 * in a super sampled contour.
 *
 * @param contour - object, The original contour.
 * @param numNodes - Number, The number of nodes added.
 * @returns boolean[], The indicator array of original node locations.
 */
function _getIndicatorArray(contour, numNodes) {
  const perimInd = [];

  for (let i = 0; i < numNodes - 2; i++) {
    perimInd.push(false);
  }

  for (let i = 0; i < contour.x.length; i++) {
    perimInd.push(true);
  }

  return perimInd;
}

/**
 * _getInterpolatedPerim - Adds additional interpolated nodes to the
 * normalized perimeter array.
 *
 * @param numNodes - object, The number of nodes to add.
 * @param cumPerimNorm - The cumulative perimeter array.
 * @returns Number[], The array of nodes.
 */
function _getInterpolatedPerim(numNodes, cumPerimNorm) {
  const diff = 1 / (numNodes - 1);
  const linspace = [diff];

  // Length - 2 as we are discarding 0 an 1 for efficiency (no need to calculate them).
  for (let i = 1; i < numNodes - 2; i++) {
    linspace.push(linspace[linspace.length - 1] + diff);
  }

  return linspace.concat(cumPerimNorm);
}

/**
 * _normalizedCumulativePerimeter - Normalizes the cumulative perimeter array.
 *
 * @param cumPerim - An array of the cumulative perimeter at each of a contour.
 * @returns  The normalized array.
 */
function _normalisedCumulativePerimeter(cumPerim) {
  const cumPerimNorm = [];

  for (let i = 0; i < cumPerim.length; i++) {
    cumPerimNorm.push(cumPerim[i] / cumPerim[cumPerim.length - 1]);
  }

  return cumPerimNorm;
}

/**
 * _getCumulativePerimeter - Returns an array of the the cumulative perimeter at
 * each node of the contour.
 *
 * @param contour - The contour.
 * @returns Number[], An array of the cumulative perimeter at each node.
 */
function _getCumulativePerimeter(contour) {
  const cumulativePerimeter = [0];

  for (let i = 1; i < contour.x.length; i++) {
    const lengthOfSegment = Math.sqrt(
      (contour.x[i] - contour.x[i - 1]) ** 2 +
        (contour.y[i] - contour.y[i - 1]) ** 2 +
        (contour.z[i] - contour.z[i - 1]) ** 2
    );

    cumulativePerimeter.push(cumulativePerimeter[i - 1] + lengthOfSegment);
  }

  return cumulativePerimeter;
}

/**
 * _generateClosedContour - Generate a clockwise contour object from the points
 * of a clockwise or anti-clockwise polygon.
 *
 * @param  points - The points to generate the contour from.
 * @returns The generated contour object.
 */
function _generateClosedContour(points) {
  const c = {
    x: [],
    y: [],
    z: [],
  };

  // NOTE: For z positions we only need the relative difference for interpolation, thus use frame index as Z.
  for (let i = 0; i < points.length; i++) {
    c.x[i] = points[i][0];
    c.y[i] = points[i][1];
    c.z[i] = points[i][2];
  }

  // Push last node to create closed contour.
  c.x.push(c.x[0]);
  c.y.push(c.y[0]);
  c.z.push(c.z[0]);

  return c;
}

export default interpolate;
