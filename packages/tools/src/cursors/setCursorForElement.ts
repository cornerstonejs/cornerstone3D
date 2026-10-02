import { setElementCursor } from './elementCursor';
import MouseCursor from './MouseCursor';
import SVGMouseCursor from './SVGMouseCursor';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'cursors.setCursorForElement'
);

/**
 * Set the cursor for an HTML element. cursorNames can be either
 * cornerstone3DTools cursors or standard cursors.
 *
 * @param element - The element to set the cursor on.
 * @param cursorName - The name of the cursor to set. This can be
 * any cursor name either Cornerstone-specific cursor names or the standard
 * CSS cursor names.
 */
function setCursorForElement(
  element: HTMLDivElement,
  cursorName: string
): void {
  let cursor = SVGMouseCursor.getDefinedCursor(cursorName, true);
  if (!cursor) {
    cursor = MouseCursor.getDefinedCursor(cursorName);
  }

  if (!cursor) {
    cs3dLogger.info(
      `Cursor ${cursorName} is not defined either as SVG or as a standard cursor.`
    );
    cursor = MouseCursor.getDefinedCursor(cursorName);
  }

  setElementCursor(element, cursor);
}

export default setCursorForElement;
