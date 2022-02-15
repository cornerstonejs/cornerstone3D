import MouseCursor, { standardCursorNames } from './MouseCursor'
import ImageMouseCursor from './ImageMouseCursor'
import SVGMouseCursor from './SVGMouseCursor'
import * as elementCursor from './elementCursor'
import { setCursorForElement } from './elementCursor'
import { registerCursor, svgCursorNames } from './SVGCursorDescriptor'
import type { SVGCursorDescriptor } from './SVGCursorDescriptor'

const cursorNames = [...svgCursorNames, ...standardCursorNames]

export {
  MouseCursor,
  ImageMouseCursor,
  SVGMouseCursor,
  elementCursor,
  registerCursor,
  cursorNames,
  setCursorForElement,
}

export type { SVGCursorDescriptor }
