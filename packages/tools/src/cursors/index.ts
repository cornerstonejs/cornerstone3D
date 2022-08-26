import MouseCursor, { standardCursorNames } from './MouseCursor';
import ImageMouseCursor from './ImageMouseCursor';
import SVGMouseCursor from './SVGMouseCursor';
import * as elementCursor from './elementCursor';
import setCursorForElement from './setCursorForElement';
import {
  registerCursor,
  svgCursorNames,
  CursorSVG,
} from './SVGCursorDescriptor';

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
