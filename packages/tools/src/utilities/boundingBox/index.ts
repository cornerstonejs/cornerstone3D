import extend2DBoundingBoxInViewAxis from './extend2DBoundingBoxInViewAxis';
import {
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
} from './getBoundingBoxAroundShape';

export {
  extend2DBoundingBoxInViewAxis,
  getBoundingBoxAroundShapeIJK,
  getBoundingBoxAroundShapeWorld,
  // backwards compatibility
  getBoundingBoxAroundShapeIJK as getBoundingBoxAroundShape,
};
