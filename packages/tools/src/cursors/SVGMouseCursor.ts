import { ToolModes, AnnotationStyleStates } from '../enums';
import MouseCursor from './MouseCursor';
import ImageMouseCursor from './ImageMouseCursor';
import { getDefinedSVGCursorDescriptor } from './SVGCursorDescriptor';
import { getStyleProperty } from '../stateManagement/annotation/config/helpers';

import type { StyleSpecifier } from '../types/AnnotationStyle';
import type { SVGCursorDescriptor } from '../types';

const PROPERTY = 'color';
const STATE = AnnotationStyleStates.Highlighted;
const MODE = ToolModes.Active;

export default class SVGMouseCursor extends ImageMouseCursor {
  constructor(
    url: string,
    x?: number,
    y?: number,
    name?: string | undefined,
    fallback?: MouseCursor | undefined
  ) {
    super(url, x, y, name, fallback);
  }

  /**
   * Get a shared instance of the SVGMouseCursor class satisfying the given parameters.
   *
   * @param name - The name of the cursor (defined in SVGCursorDescriptor.ts);
   * @param pointer - Should be true to use the version of the cursor containing
   * a mouse pointer. Defaults to false (which does not add a pointer to the cursor);
   * @param color - The color of the cursor. Defaults to tool.style.colorHighlightedActive;
   * @returns a SVGMouseCursor instance or
   * undefined if no SVG cursor descriptor was found with the given name;
   */
  static getDefinedCursor(
    name: string,
    pointer = false,
    color?: string
  ): MouseCursor {
    if (!color) {
      color = getStyleProperty(PROPERTY, {} as StyleSpecifier, STATE, MODE);
    }
    const urn = getCursorURN(name, pointer, color);
    let cursor = super.getDefinedCursor(urn);
    if (!cursor) {
      const descriptor = getDefinedSVGCursorDescriptor(name);
      if (descriptor) {
        cursor = createSVGMouseCursor(
          descriptor,
          urn,
          pointer,
          color,
          super.getDefinedCursor('default')
        );
        super.setDefinedCursor(urn, cursor);
      }
    }
    return cursor;
  }
}

/*
 * Helpers
 */

function format(template: string, dictionary: Record<string, unknown>): string {
  const dict = Object(dictionary);
  const defined = Object.prototype.hasOwnProperty.bind(dict);
  return (template + '').replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return defined(key) ? dict[key] + '' : '';
  });
}

function getCursorURN(name: string, pointer: boolean, color: string) {
  const type = pointer ? 'pointer' : 'cursor';
  return `${type}:${name}/${color}`;
}

function createSVGMouseCursor(
  descriptor: SVGCursorDescriptor,
  name: string,
  pointer: boolean,
  color: string,
  fallback: MouseCursor
): SVGMouseCursor {
  const { x, y } = descriptor.mousePoint;
  return new SVGMouseCursor(
    createSVGIconUrl(descriptor, pointer, { color }),
    x,
    y,
    name,
    fallback
  );
}

function createSVGIconUrl(
  descriptor: SVGCursorDescriptor,
  pointer: boolean,
  options: Record<string, unknown>
): string {
  return URL.createObjectURL(createSVGIconBlob(descriptor, pointer, options));
}

function createSVGIconBlob(
  descriptor: SVGCursorDescriptor,
  pointer: boolean,
  options: Record<string, unknown>
): Blob {
  const svgString = (pointer ? createSVGIconWithPointer : createSVGIcon)(
    descriptor,
    options
  );
  return new Blob([svgString], { type: 'image/svg+xml' });
}

function createSVGIcon(
  descriptor: SVGCursorDescriptor,
  options: Record<string, unknown>
): string {
  const { iconContent, iconSize, viewBox } = descriptor;
  const svgString = `
    <svg data-icon="cursor" role="img" xmlns="http://www.w3.org/2000/svg"
      width="${iconSize}" height="${iconSize}" viewBox="0 0
      ${viewBox.x} ${viewBox.y}">
      ${iconContent}
    </svg>`;
  return format(svgString, options);
}

function createSVGIconWithPointer(
  descriptor: SVGCursorDescriptor,
  options: Record<string, unknown>
) {
  const { iconContent, iconSize, viewBox, mousePointerGroupString } =
    descriptor;
  const scale = iconSize / Math.max(viewBox.x, viewBox.y, 1);
  const svgSize = 16 + iconSize;
  const svgString = `
    <svg data-icon="cursor" role="img" xmlns="http://www.w3.org/2000/svg"
      width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
      <g>${mousePointerGroupString}</g>
      <g transform="translate(16, 16) scale(${scale})">${iconContent}</g>
    </svg>`;
  return format(svgString, options);
}
