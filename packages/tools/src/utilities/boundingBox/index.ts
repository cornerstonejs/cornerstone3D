import extend2DBoundingBoxInViewAxis from './extend2DBoundingBoxInViewAxis.js';
import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from './getBoundingBoxAroundShape.js';

export {
  extend2DBoundingBoxInViewAxis,
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
  // backwards compatibility
  getBoundingBoxAroundShapeIJK as getBoundingBoxAroundShape,
};
