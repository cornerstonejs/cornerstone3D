import MouseCursor, { standardCursorNames } from './MouseCursor.js';
import ImageMouseCursor from './ImageMouseCursor.js';
import SVGMouseCursor from './SVGMouseCursor.js';
import * as elementCursor from './elementCursor.js';
import setCursorForElement from './setCursorForElement.js';
import {
  registerCursor,
  svgCursorNames,
  CursorSVG,
} from './SVGCursorDescriptor.js';

// Todo: this should be enum
const CursorNames = [...svgCursorNames, ...standardCursorNames];

export {
  MouseCursor,
  ImageMouseCursor,
  SVGMouseCursor,
  elementCursor,
  registerCursor,
  CursorNames,
  CursorSVG,
  setCursorForElement,
};
