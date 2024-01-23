import { glMatrix, mat4, vec2, vec3 } from 'gl-matrix';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  eventTarget,
  StackViewport,
  getEnabledElement,
  Enums,
  getEnabledElementByIds,
  cache,
  utilities as csUtils,
  Types,
  getRenderingEngine,
} from '@cornerstonejs/core';
import Events from '../../enums/Events';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';
import { Annotation } from '../../types';
import { ContourAnnotation } from '../../types/ContourAnnotation';
import { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
// import * as math from '../../utilities/math';
import {
  math,
  throttle,
  roundNumber,
  triggerAnnotationRenderForViewportIds,
  getCalibratedScale,
  getCalibratedAreaUnits,
} from '../../utilities';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { triggerAnnotationModified } from '../../stateManagement/annotation/helpers/state';
import { AnnotationCompletedEventType } from '../../types/EventTypes';
import testSourcePolyline from './testSourcePolyline';
import testTargetPolyline from './testTargetPolyline';

(window as any).math = math;
let attachedEventListenersCount = 0;

const getDistPointLine = (p1, q1, point) => {
  const vecLineDir = vec2.normalize(
    vec2.create(),
    vec2.sub(vec2.create(), q1, p1)
  );
  const vecPoint = vec2.sub(vec2.create(), point, q1);
  const dot = vec2.dot(vecLineDir, vecPoint);
  console.log('>>>>> :: dot:', dot);
};

setTimeout(() => {
  const p1 = vec2.fromValues(312.17647063655795, 234.94852936344205);
  const q1 = vec2.fromValues(311.9411765229378, 235.18382347706222);
  const p2 = vec2.fromValues(312.24999999572145, 235.3749999957214);
  const q2 = vec2.fromValues(312, 235.125);

  const distP2 = getDistPointLine(p1, p1, p2);
  const distQ2 = getDistPointLine(p1, p1, q2);

  (window as any).vec2 = vec2;
  (window as any).p1 = p1;
  (window as any).q1 = q1;
  (window as any).p2 = p2;
  (window as any).q2 = q2;

  const intersection = math.lineSegment.intersectLine(
    p1 as Types.Point2,
    q1 as Types.Point2,
    p2 as Types.Point2,
    q2 as Types.Point2
  );
  console.log('>>>>> :: intersection:', intersection);
}, 2000);

function enable(): void {
  if (attachedEventListenersCount++ > 0) {
    return;
  }

  // const { viewport } = getEnabledElement(element);

  // if (!(viewport instanceof StackViewport)) {
  //   return;
  // }

  // eventTarget.addEventListener(
  //   Events.ANNOTATION_ADDED,
  //   _annotationAdded as EventListener
  // );

  eventTarget.addEventListener(
    Events.ANNOTATION_COMPLETED,
    _annotationCompleted as EventListener
  );

  eventTarget.addEventListener(
    Events.ANNOTATION_MODIFIED,
    _annotationModified as EventListener
  );
}

function disable(): void {
  if (attachedEventListenersCount === 0 || attachedEventListenersCount-- > 1) {
    return;
  }

  // const { viewport } = getEnabledElement(element);

  // if (!(viewport instanceof StackViewport)) {
  //   return;
  // }

  // eventTarget.removeEventListener(
  //   Events.ANNOTATION_ADDED,
  //   _annotationAdded as EventListener
  // );

  eventTarget.removeEventListener(
    Events.ANNOTATION_COMPLETED,
    _annotationCompleted as EventListener
  );

  eventTarget.removeEventListener(
    Events.ANNOTATION_MODIFIED,
    _annotationModified as EventListener
  );
}

// function _annotationAdded(evt) {
//   console.log('>>>>> annotationAdded :: evt', evt);
// }

function _isContourSegmentationAnnotation(
  annotation: Annotation
): annotation is ContourSegmentationAnnotation {
  return !!(<ContourSegmentationAnnotation>annotation).data?.segmentation;
}

function filterContourSegmentationAnnotations(
  annotations: Annotation[],
  viewPlaneNormal: Types.Point3
) {
  return annotations.filter((annotation) =>
    _isContourSegmentationAnnotation(annotation)
  );
}

/**
 * Check if two contour segmentation annotations are coplanar.
 *
 * A plane may be represented by a normal and a distance then to know if they
 * are coplanar we need to:
 *   - check if the normals of the two annotations are pointing to the same
 *   direction or to opposite directions (dot product equal to 1 or -1
 *   respectively)
 *   - Get one point from each polyline and project it onto the normal to get
 *   the distance from the origin (0, 0, 0).
 */
function _areCoplanarContours(
  firstAnnotation: ContourAnnotation,
  secondAnnotation: ContourAnnotation
) {
  const { viewPlaneNormal: firstViewPlaneNormal } = firstAnnotation.metadata;
  const { viewPlaneNormal: secondViewPlaneNormal } = secondAnnotation.metadata;
  const dot = vec3.dot(firstViewPlaneNormal, secondViewPlaneNormal);
  const parallelPlanes = glMatrix.equals(1, Math.abs(dot));

  if (!parallelPlanes) {
    return false;
  }

  const { polyline: firstPolyline } = firstAnnotation.data.contour;
  const { polyline: secondPolyline } = secondAnnotation.data.contour;

  // Choose one of the normals and calculate the distance of a point from each
  // polyline along that normal. Both normal cannot be used with absolute dot
  // product values because one of the view planes may be flipped or one of the
  // points may be at the same distance but in the opposite direction
  const firstDistance = vec3.dot(firstViewPlaneNormal, firstPolyline[0]);
  const secondDistance = vec3.dot(firstViewPlaneNormal, secondPolyline[0]);

  return glMatrix.equals(firstDistance, secondDistance);
}

function _areContoursFromSameSegmentIndex(
  firstAnnotation: ContourSegmentationAnnotation,
  secondAnnotation: ContourSegmentationAnnotation
) {
  const { segmentation: firstSegmentation } = firstAnnotation.data;
  const { segmentation: secondSegmentation } = secondAnnotation.data;

  return (
    firstSegmentation.segmentationRepresentationUID ===
      secondSegmentation.segmentationRepresentationUID &&
    firstSegmentation.segmentIndex === secondSegmentation.segmentIndex
  );
}

function _getPolylineAABB(polyline: Types.Point2[]): Types.AABB2 {
  const startTimeGetAABB = performance.now();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0, len = polyline.length; i < len; i++) {
    const [x, y] = polyline[i];

    // No Math.min/max calls for better performance
    minX = minX < x ? minX : x;
    minY = minY < y ? minY : y;
    maxX = maxX > x ? maxX : x;
    maxY = maxY > y ? maxY : y;
  }

  console.log('>>>>> time :: getAABB:', performance.now() - startTimeGetAABB);
  return { minX, maxX, minY, maxY };
}

function getValidContourSegmentationAnnotations(
  sourceAnnotation: ContourSegmentationAnnotation
): ContourSegmentationAnnotation[] {
  const { annotationUID: sourceAnnotationUID } = sourceAnnotation;
  const { FrameOfReferenceUID, toolName } = sourceAnnotation.metadata;

  return <ContourSegmentationAnnotation[]>(
    getAnnotations(toolName, FrameOfReferenceUID).filter(
      (targetAnnotation) =>
        targetAnnotation.annotationUID &&
        !targetAnnotation.parentAnnotationUID &&
        targetAnnotation.annotationUID !== sourceAnnotationUID &&
        _isContourSegmentationAnnotation(targetAnnotation) &&
        _areContoursFromSameSegmentIndex(targetAnnotation, sourceAnnotation) &&
        _areCoplanarContours(targetAnnotation, sourceAnnotation)
    )
  );
}

function _annotationModified(evt) {
  console.log('>>>>> modified :: evt:', evt);
}

const projectedPolylinesCache = new Map();

function getProjectedPolyline(
  annotation: ContourAnnotation,
  viewport: Types.IViewport
) {
  const { annotationUID } = annotation;
  let projectedPolyline = projectedPolylinesCache.get(annotationUID);

  if (projectedPolyline) {
    return projectedPolyline;
  }

  const startTimeProjectPoints = performance.now();
  const { polyline } = annotation.data.contour;

  projectedPolyline = polyline.map((point) => viewport.worldToCanvas(point));

  console.log(
    `>>>>> time :: projectPoints ${projectedPolyline.length}:`,
    performance.now() - startTimeProjectPoints
  );

  projectedPolylinesCache.set(annotationUID, projectedPolyline);

  return projectedPolyline;
}

function getTargetAnnotation(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  contourSegmentationAnnotations: ContourSegmentationAnnotation[]
): ContourSegmentationAnnotation {
  const sourcePolyline = getProjectedPolyline(sourceAnnotation, viewport);
  // const sourceStartPoint = sourcePolyline[0];
  const sourceAABB = _getPolylineAABB(sourcePolyline);

  for (let i = 0; i < contourSegmentationAnnotations.length; i++) {
    const targetAnnotation = contourSegmentationAnnotations[i];
    const targetPolyline = getProjectedPolyline(targetAnnotation, viewport);
    // const containsStartPoint = math.polyline.containsPoint(
    //   targetPolyline,
    //   sourceStartPoint
    // );

    // const targetAABB = _getPolylineAABB(targetPolyline);
    // const intersectAABB = math.aabb.intersectAABB(sourceAABB, targetAABB);
    // console.log('>>>>> intersectAABB:', intersectAABB);
    const polylinesIntersect = math.polyline.intersectPolyline(
      sourcePolyline,
      targetPolyline
    );
    // console.log('>>>>> polylinesIntersect:', polylinesIntersect);
    // const polylinesIntersect =
    //   math.aabb.intersectAABB(sourceAABB, targetAABB) &&
    //   // math.polyline.containsPoint(targetPolyline, sourceStartPoint) &&
    //   math.polyline.intersectPolyline(sourcePolyline, targetPolyline);

    if (polylinesIntersect) {
      return targetAnnotation;
    }
  }
}

function testPerformance() {
  const totalTimes = [];
  for (let i = 0; i < 10; i++) {
    const startTime = performance.now();
    const intersect = math.polyline.intersectPolyline(
      testSourcePolyline,
      testTargetPolyline
    );
    const totalTime = performance.now() - startTime;
    // prettier-ignore
    console.log(`>>>>> time :: intersectPolyline (${testSourcePolyline.length}, ${testTargetPolyline.length}, ${intersect}):`, totalTime);
    totalTimes.push(totalTime);
  }
  // prettier-ignore
  const avgTime = totalTimes.reduce((acc, cur) => acc + cur, 0) / totalTimes.length;
  console.log('>>>>> totalTime (avg): ', avgTime);
}

function getContourAnnotationNormal(
  annotation: ContourAnnotation
): Types.Point3 {
  const { polyline } = annotation.data.contour;
  return math.polyline.getNormal3(polyline);
}

enum ContourDirection {
  CW = 1,
  CCW = -1,
}

function getContourAnnotationDirection(
  annotation: ContourAnnotation
): ContourDirection {
  const { viewPlaneNormal } = annotation.metadata;
  const { polyline } = annotation.data.contour;
  const annotationNormal = math.polyline.getNormal3(polyline);
  const dotNormals = vec3.dot(annotationNormal, viewPlaneNormal);

  console.log('>>>>> viewPlaneNormal:', viewPlaneNormal);
  console.log('>>>>> annotationNormal:', annotationNormal);
  console.log('>>>>> dotNormals:', dotNormals);

  // dotNormals shall be -1 for clockwise contours because it is taking the
  // dot product against the viewPlaneNormal (reversed) instead of slice normal.
  return glMatrix.equals(1, dotNormals)
    ? ContourDirection.CCW
    : ContourDirection.CW;
}

function processContours(
  viewport: Types.IViewport,
  sourceAnnotation: ContourSegmentationAnnotation,
  targetAnnotation: ContourSegmentationAnnotation
) {
  const sourcePolyline = getProjectedPolyline(sourceAnnotation, viewport);
  const targetPolyline = getProjectedPolyline(targetAnnotation, viewport);

  // DEBUG /////////////////////////////////////////////////////////////////////
  // prettier-ignore
  // const sourcePolyline: Types.Point2[] = [[12, 1], [9, 1], [7, 0], [6, 5]].reverse() as Types.Point2[]; // CCW (wrong)
  // prettier-ignore
  // const targetPolyline: Types.Point2[] = [[1, 1], [0, 4], [3, 5], [10, 3], [5, 0]]; // CW
  // const targetPolyline: Types.Point2[] = [[1, 1], [0, 4], [3, 5], [7, 3.5], [10, 3], [5, 0]]; // CW

  const sourceStartPoint = sourcePolyline[0];
  // const mergePolylines = true;
  const mergePolylines = math.polyline.containsPoint(
    targetPolyline,
    sourceStartPoint
  );

  const newPolylines = [];

  if (mergePolylines) {
    console.log('>>>>> MERGE');
    const mergedPolyline = math.polyline.mergePolylines(
      targetPolyline,
      sourcePolyline
    );
    // console.log('>>>>> mergedPolyline:', mergedPolyline);

    newPolylines.push(mergedPolyline);
    // triggerAnnotationModified(targetAnnotation, viewport.element);
  } else {
    console.log('>>>>> SUBTRACT');
    const subtractedPolylines = math.polyline.subtractPolylines(
      targetPolyline,
      sourcePolyline
    );
    // console.log('>>>>> subtractedPolylines:', subtractedPolylines);

    subtractedPolylines.forEach((newPolyline) =>
      newPolylines.push(newPolyline)
    );
  }

  removeAnnotation(sourceAnnotation.annotationUID);
  removeAnnotation(targetAnnotation.annotationUID);

  const { element } = viewport;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine } = enabledElement;

  newPolylines.forEach((newPolyline) => {
    const newAnnotation = {
      ...targetAnnotation,
      annotationUID: csUtils.uuidv4() as string,
    };

    newAnnotation.data.contour.polyline = newPolyline.map((p) =>
      viewport.canvasToWorld(p)
    );

    addAnnotation(newAnnotation, element);
  });

  const { toolName } = targetAnnotation.metadata;
  const viewportIdsToRender = getViewportIdsWithToolToRender(element, toolName);

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

// function processContoursDebug(
//   viewport: Types.IViewport,
//   sourceAnnotation: ContourSegmentationAnnotation,
//   targetAnnotation: ContourSegmentationAnnotation
// ) {
//   const debugSourceAnnotation: ContourSegmentationAnnotation = JSON.parse(
//     JSON.stringify(sourceAnnotation)
//   );
//   const debugTargetAnnotation: ContourSegmentationAnnotation = JSON.parse(
//     JSON.stringify(targetAnnotation)
//   );
//
//   debugSourceAnnotation.data.contour = [
//     [12, 1],
//     [6, 5],
//   ] as Types.Point2[];
//
//   processContours(viewport, debugSourceAnnotation, debugTargetAnnotation);
// }

function _annotationCompleted(evt: AnnotationCompletedEventType) {
  console.clear();

  // testPerformance();
  // return;

  console.log('>>>>> completed :: evt:', evt);
  const sourceAnnotation = evt.detail
    .annotation as ContourSegmentationAnnotation;
  const { renderingEngineId, viewportId } = evt.detail;
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport(viewportId);

  if (!_isContourSegmentationAnnotation(sourceAnnotation)) {
    return;
  }

  const starTimeFilterAnnotations = performance.now();
  const contourSegmentationAnnotations =
    getValidContourSegmentationAnnotations(sourceAnnotation);
  // prettier-ignore
  console.log('>>>>> time :: filterAnnotations:', performance.now() - starTimeFilterAnnotations);
  console.log('>>>>> targetAnnotations:', contourSegmentationAnnotations);

  if (!contourSegmentationAnnotations.length) {
    return;
  }

  const starTimeGetTarget = performance.now();
  const targetAnnotation = getTargetAnnotation(
    viewport,
    sourceAnnotation,
    contourSegmentationAnnotations
  );

  // prettier-ignore
  console.log('>>>>> time :: getTarget:', performance.now() - starTimeGetTarget);
  console.log('>>>>> targetAnnotation:', targetAnnotation);

  if (!targetAnnotation) {
    return;
  }

  // const direction = getContourAnnotationDirection(sourceAnnotation);
  // if (direction === ContourDirection.CW) {
  //   console.log('MERGE');
  // } else {
  //   console.log('DELETE');
  // }

  processContours(viewport, sourceAnnotation, targetAnnotation);
  // processContoursDebug(viewport, sourceAnnotation, targetAnnotation);

  // math.polyline.getFirstIntersectionWithPolyline;

  // .find((annotation) => _contoursIntersect(annotation, sourceAnnotation));

  // sourceAnnotation.childrenAnnotationUIDs =
  // sourceAnnotation.childrenAnnotationUIDs ?? [];
  //
  // annotations.forEach((annotation) => {
  // annotation.parentAnnotationUID = sourceAnnotationUID;
  // sourceAnnotation.childrenAnnotationUIDs.push(annotation.annotationUID);
  // });
  //
  // // toolNames.forEach((toolName) => {
  // //   const toolAnnotations = annotationsByTool[toolName];
  // //   const toolContourSegAnnotations =
  // //     filterContourSegmentationAnnotations(toolAnnotations);
  // //
  // //   annotations = annotations.concat(toolContourSegAnnotations);
  // // });
  //
  // // .filter(
  // //   (annotation) => isContourSegmentationAnnotation(annotation)
  // // );
  //
  // console.log('>>>>> annotationCompleted :: evt', evt);
  // console.log('>>>>> annotations:', annotations);
  // console.log('>>>>> childrenAnnotations:', [
  // ...sourceAnnotation.childrenAnnotationUIDs,
  // ]);
}

/**
 *  When the image is rendered, check what tools can be rendered for this element.
 *
 * - First we get all tools which are active, passive or enabled on the element.
 * - If any of these tools have a `renderAnnotation` method, then we render them.
 * - Note that these tools don't necessarily have to be instances of  `AnnotationTool`,
 *   Any tool may register a `renderAnnotation` method (e.g. a tool that displays an overlay).
 *
 * @param evt - The normalized IMAGE_RENDERED event.
 */
// function _imageChangeEventListener(evt) {
//   const eventData = evt.detail;
//   const { viewportId, renderingEngineId } = eventData;
//   const { viewport } = getEnabledElementByIds(
//     viewportId,
//     renderingEngineId
//   ) as { viewport: Types.IStackViewport };
//
//   const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
//
//   if (!toolGroup) {
//     return;
//   }
//
//   let toolGroupSegmentationRepresentations =
//     SegmentationState.getSegmentationRepresentations(toolGroup.id) || [];
//
//   toolGroupSegmentationRepresentations =
//     toolGroupSegmentationRepresentations.filter(
//       (representation) => representation.type === Representations.Labelmap
//     );
//
//   if (!toolGroupSegmentationRepresentations?.length) {
//     return;
//   }
//
//   const segmentationRepresentations = {};
//   toolGroupSegmentationRepresentations.forEach((representation) => {
//     const segmentation = SegmentationState.getSegmentation(
//       representation.segmentationId
//     );
//
//     if (!segmentation) {
//       return;
//     }
//
//     const labelmapData =
//       segmentation.representationData[Representations.Labelmap];
//
//     if (isVolumeSegmentation(labelmapData)) {
//       return;
//     }
//
//     const { imageIdReferenceMap } =
//       labelmapData as LabelmapSegmentationDataStack;
//
//     segmentationRepresentations[representation.segmentationRepresentationUID] =
//       {
//         imageIdReferenceMap,
//       };
//   });
//
//   const representationList = Object.keys(segmentationRepresentations);
//   const currentImageId = viewport.getCurrentImageId();
//   const actors = viewport.getActors();
//
//   const segmentationFound = actors.find((actor) => {
//     if (!representationList.includes(actor.uid)) {
//       return false;
//     }
//
//     return true;
//   });
//
//   if (!segmentationFound) {
//     // If the segmentation is not found, it could be because of some special cases
//     // where we are in the process of updating the volume conversion to a stack while
//     // the data is still coming in. In such situations, we should trigger the render
//     // to ensure that the segmentation actors are created, even if the data arrives late.
//     triggerSegmentationRender(toolGroup.id);
//
//     // we should return here, since there is no segmentation actor to update
//     // we will hit this function later on after the actor is created
//     return;
//   }
//
//   actors.forEach((actor) => {
//     if (!representationList.includes(actor.uid)) {
//       return;
//     }
//     const segmentationActor = actor.actor;
//
//     const { imageIdReferenceMap } = segmentationRepresentations[actor.uid];
//
//     const derivedImageId = imageIdReferenceMap.get(currentImageId);
//
//     const segmentationImageData = segmentationActor.getMapper().getInputData();
//
//     if (!derivedImageId) {
//       // this means that this slice doesn't have a segmentation for this representation
//       // this can be a case where the segmentation was added to certain slices only
//       // so we can keep the actor but empty out the imageData
//       const scalarArray = vtkDataArray.newInstance({
//         name: 'Pixels',
//         numberOfComponents: 1,
//         values: new Uint8Array(segmentationImageData.getNumberOfPoints()),
//       });
//
//       const imageData = vtkImageData.newInstance();
//       imageData.getPointData().setScalars(scalarArray);
//       segmentationActor.getMapper().setInputData(imageData);
//       return;
//     }
//
//     const derivedImage = cache.getImage(derivedImageId);
//
//     const { dimensions, spacing, direction } =
//       viewport.getImageDataMetadata(derivedImage);
//
//     const currentImage = cache.getImage(currentImageId);
//     const { origin: currentOrigin } =
//       viewport.getImageDataMetadata(currentImage);
//
//     // IMPORTANT: We need to make sure that the origin of the segmentation
//     // is the same as the current image origin. This is because due to some
//     // floating point precision issues, when coming from volume to stack
//     // the origin of the segmentation can be slightly different from the
//     // current image origin. This can cause the segmentation to be rendered
//     // in the wrong location.
//     // Todo: This will not work for segmentations that are not in the same frame
//     // of reference or derived from the same image. This can happen when we have
//     // a segmentation that happens to exist in the same space as the image but is
//     // not derived from it. We need to find a way to handle this case, but don't think
//     // it makes sense to do it for the stack viewport, as the volume viewport is designed to handle this case.
//     const originToUse = currentOrigin;
//
//     segmentationImageData.setOrigin(originToUse);
//     segmentationImageData.modified();
//
//     if (
//       segmentationImageData.getDimensions()[0] !== dimensions[0] ||
//       segmentationImageData.getDimensions()[1] !== dimensions[1]
//     ) {
//       // IMPORTANT: Not sure why we can't just update the dimensions
//       // and the orientation of the image data and then call modified
//       // I tried calling modified on everything, but seems like we should remove
//       // and add the actor again below
//       viewport.removeActors([actor.uid]);
//       viewport.addImages(
//         [
//           {
//             imageId: derivedImageId,
//             actorUID: actor.uid,
//             callback: ({ imageActor }) => {
//               const scalarArray = vtkDataArray.newInstance({
//                 name: 'Pixels',
//                 numberOfComponents: 1,
//                 values: [...derivedImage.getPixelData()],
//               });
//
//               const imageData = vtkImageData.newInstance();
//
//               imageData.setDimensions(dimensions[0], dimensions[1], 1);
//               imageData.setSpacing(spacing);
//               imageData.setDirection(direction);
//               imageData.setOrigin(originToUse);
//               imageData.getPointData().setScalars(scalarArray);
//
//               imageActor.getMapper().setInputData(imageData);
//             },
//           },
//         ],
//         true,
//         false
//       );
//
//       triggerSegmentationRender(toolGroup.id);
//       return;
//     }
//
//     utilities.updateVTKImageDataWithCornerstoneImage(
//       segmentationImageData,
//       derivedImage
//     );
//     viewport.render();
//
//     // This is put here to make sure that the segmentation is rendered
//     // for the initial image as well after that we don't need it since
//     // stack new image is called when changing slices
//     if (evt.type === Enums.Events.IMAGE_RENDERED) {
//       // unsubscribe after the initial render
//       viewport.element.removeEventListener(
//         Enums.Events.IMAGE_RENDERED,
//         _imageChangeEventListener as EventListener
//       );
//     }
//   });
// }

export default {
  enable,
  disable,
};
