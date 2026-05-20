import extend2DBoundingBoxInViewAxis from './extend2DBoundingBoxInViewAxis';
import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from './getBoundingBoxAroundShape';
import normalizeFloatingPointIndexBounds from './normalizeFloatingPointIndexBounds';

export {
  extend2DBoundingBoxInViewAxis,
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
  normalizeFloatingPointIndexBounds,
  // backwards compatibility
  getBoundingBoxAroundShapeIJK as getBoundingBoxAroundShape,
};
