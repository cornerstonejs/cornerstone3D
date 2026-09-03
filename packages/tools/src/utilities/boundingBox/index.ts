import extend2DBoundingBoxInViewAxis from './extend2DBoundingBoxInViewAxis';
import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from './getBoundingBoxAroundShape';
import snapIndexBounds from './snapIndexBounds';

export {
  extend2DBoundingBoxInViewAxis,
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
  snapIndexBounds,
  // backwards compatibility
  getBoundingBoxAroundShapeIJK as getBoundingBoxAroundShape,
};
