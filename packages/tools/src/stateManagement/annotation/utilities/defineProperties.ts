import { Annotation } from '../../../types';

const checkAndDefineTextBoxProperty = (annotation: Annotation) => {
  if (!annotation.data) {
    annotation.data = {};
  }
  if (!annotation.data.handles) {
    annotation.data.handles = {};
  }
  if (!annotation.data.handles.textBox) {
    annotation.data.handles.textBox = {};
  }
  return annotation;
};

const checkAndDefineCachedStatsProperty = (annotation: Annotation) => {
  if (!annotation.data) {
    annotation.data = {};
  }
  if (!annotation.data.cachedStats) {
    annotation.data.cachedStats = {};
  }
  return annotation;
};

export { checkAndDefineTextBoxProperty, checkAndDefineCachedStatsProperty };
