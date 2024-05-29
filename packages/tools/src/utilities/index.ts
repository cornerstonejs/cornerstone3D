import { utilities } from '@cornerstonejs/core';

import {
  getAnnotationNearPoint,
  getAnnotationNearPointOnEnabledElement,
} from './getAnnotationNearPoint.js';

// Lodash/common JS functionality
import debounce from './debounce.js';
import throttle from './throttle.js';
import isObject from './isObject.js';
import clip from './clip.js';
import calibrateImageSpacing from './calibrateImageSpacing.js';
import {
  getCalibratedLengthUnitsAndScale,
  getCalibratedProbeUnitsAndValue,
  getCalibratedAspect,
} from './getCalibratedUnits.js';
import triggerAnnotationRenderForViewportIds from './triggerAnnotationRenderForViewportIds.js';
import triggerAnnotationRenderForToolGroupIds from './triggerAnnotationRenderForToolGroupIds.js';
import triggerAnnotationRender from './triggerAnnotationRender.js';
import jumpToSlice from './viewport/jumpToSlice.js';

import pointInShapeCallback from './pointInShapeCallback.js';
import { getSphereBoundsInfo } from './getSphereBoundsInfo.js';
import scroll from './scroll.js';
import { pointToString } from './pointToString.js';
import annotationFrameRange from './annotationFrameRange.js';
import pointInSurroundingSphereCallback from './pointInSurroundingSphereCallback.js';
import getViewportForAnnotation from './getViewportForAnnotation.js';
import {
  annotationHydration,
  getClosestImageIdForStackViewport,
} from './annotationHydration.js';
// name spaces
import * as contours from './contours/index.js';
import * as segmentation from './segmentation/index.js';
import * as drawing from './drawing/index.js';
import * as math from './math/index.js';
import * as planar from './planar/index.js';
import * as viewportFilters from './viewportFilters/index.js';
import * as orientation from './orientation/index.js';
import * as cine from './cine/index.js';
import * as boundingBox from './boundingBox/index.js';
import * as planarFreehandROITool from './planarFreehandROITool/index.js';
import * as rectangleROITool from './rectangleROITool/index.js';
import { stackPrefetch, stackContextPrefetch } from './stackPrefetch/index.js';
import * as viewport from './viewport/index.js';
import * as touch from './touch/index.js';
import * as dynamicVolume from './dynamicVolume/index.js';
import * as polyDataUtils from './polyData/utils.js';
import * as voi from './voi/index.js';
import * as contourSegmentation from './contourSegmentation/index.js';

const roundNumber = utilities.roundNumber;

// Events
import { triggerEvent } from '@cornerstonejs/core';

export {
  math,
  planar,
  viewportFilters,
  drawing,
  debounce,
  dynamicVolume,
  throttle,
  orientation,
  isObject,
  touch,
  triggerEvent,
  calibrateImageSpacing,
  getCalibratedLengthUnitsAndScale,
  getCalibratedProbeUnitsAndValue,
  getCalibratedAspect,
  segmentation,
  contours,
  triggerAnnotationRenderForViewportIds,
  triggerAnnotationRenderForToolGroupIds,
  triggerAnnotationRender,
  pointInShapeCallback,
  getSphereBoundsInfo,
  getAnnotationNearPoint,
  getViewportForAnnotation,
  getAnnotationNearPointOnEnabledElement,
  jumpToSlice,
  pointInSurroundingSphereCallback,
  viewport,
  cine,
  clip,
  boundingBox,
  rectangleROITool,
  planarFreehandROITool,
  stackPrefetch,
  stackContextPrefetch,
  scroll,
  roundNumber,
  pointToString,
  polyDataUtils,
  voi,
  annotationFrameRange,
  contourSegmentation,
  annotationHydration,
  getClosestImageIdForStackViewport,
};
