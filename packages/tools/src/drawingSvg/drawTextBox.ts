import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import _draw from './_draw';

/**
 * Draws a textBox.
 *
 * @param textLines - The text to display.
 * @param position - The x/y position of the textbox
 * @param options - Options for the textBox.
 * @returns Bounding box; can be used for isPointNearTool
 */
function drawTextBox(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  textUID: string,
  textLines: Array<string>,
  position: Types.Point2,
  options = {}
): SVGRect {
  const mergedOptions = Object.assign(
    {
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '14px',
      color: 'rgb(255, 255, 0)',
      background: '',
      padding: 25,
      centerX: false,
      centerY: true,
    },
    options
  );

  // Draw each of the text lines on top of the background box
  const textGroupBoundingBox = _drawTextGroup(
    svgDrawingHelper,
    annotationUID,
    textUID,
    textLines,
    position,
    mergedOptions
  );

  return textGroupBoundingBox;
}

function _drawTextGroup(
  svgDrawingHelper: SVGDrawingHelper,
  annotationUID: string,
  textUID: string,
  textLines: Array<string> = [''],
  position: Types.Point2,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: Record<string, any>
): SVGRect {
  const { padding, color, fontFamily, fontSize, background } = options;

  const [x, y] = [position[0] + padding, position[1] + padding];
  const textGroupAttributes = {
    'data-annotation-uid': annotationUID,
    transform: `translate(${x} ${y})`,
  };

  const { element: existingTextGroup, isNew } = _draw(
    'g',
    svgDrawingHelper,
    annotationUID,
    textUID,
    textGroupAttributes
  );
  let textElement: SVGElement | null = existingTextGroup.querySelector('text');
  if (textElement === null) {
    textElement = _createTextElement(svgDrawingHelper, options);
  }
  const textSpans = Array.from(textElement.children) as Array<SVGElement>;
  const textAttributes = {
    fill: color,
    'font-size': fontSize,
    'font-family': fontFamily,
  };

  // TODO: Iterate each node and update color? font-size?
  for (let i = 0; i < textSpans.length; i++) {
    const textSpanElement = textSpans[i];
    const text = textLines[i] || '';
    if (text !== textSpanElement.textContent) {
      textSpanElement.textContent = text;
    }
  }
  // if the textLines have changed size, we need to create textSpans for them
  if (textLines.length > textSpans.length) {
    for (let i = 0; i < textLines.length - textSpans.length; i++) {
      const textLine = textLines[i + textSpans.length];
      const textSpan = _createTextSpan(textLine);
      textElement.appendChild(textSpan);
    }
    existingTextGroup.appendChild(textElement);
  }
  setAttributesIfNecessary(textAttributes, textElement);
  const textGroupBoundingBox = _drawTextBackground(
    existingTextGroup,
    background
  );
  // if (updated && !isNew) {
  //   svgDrawingHelper.setNodeTouched(existingTextGroup.getAttribute('data-id'));
  // }
  // We translate the group using `position`
  // which means we also need to pluck those values when returning
  // the bounding box
  return Object.assign({}, textGroupBoundingBox, {
    x,
    y,
    height: textGroupBoundingBox.height + padding,
    width: textGroupBoundingBox.width + padding,
  });
}

function _createTextElement(
  svgDrawingHelper: SVGDrawingHelper,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: Record<string, any>
): SVGElement {
  const { color, fontFamily, fontSize } = options;
  const svgns = 'http://www.w3.org/2000/svg';
  const textElement = document.createElementNS(svgns, 'text');
  const noSelectStyle =
    'user-select: none; pointer-events: none; -webkit-tap-highlight-color:  rgba(255, 255, 255, 0);';
  const dropShadowStyle = `filter:url(#shadow-${svgDrawingHelper.svgLayerElement.id});`;
  const combinedStyle = `${noSelectStyle}${dropShadowStyle}`;

  textElement.setAttribute('x', '0');
  textElement.setAttribute('y', '0');
  textElement.setAttribute('fill', color);
  textElement.setAttribute('font-family', fontFamily);
  textElement.setAttribute('font-size', fontSize);
  textElement.setAttribute('style', combinedStyle);
  textElement.setAttribute('pointer-events', 'visible');

  return textElement;
}

function _createTextSpan(text): SVGElement {
  const svgns = 'http://www.w3.org/2000/svg';
  const textSpanElement = document.createElementNS(svgns, 'tspan');

  // TODO: centerX
  // (parent width / 2) - my width
  // TODO: centerY

  textSpanElement.setAttribute('x', '0');
  textSpanElement.setAttribute('dy', '1.2em');
  textSpanElement.textContent = text;

  return textSpanElement;
}

function _drawTextBackground(group: SVGGElement, color: string) {
  let element = group.querySelector('rect.background');

  // If we have no background color, remove any element that exists and return
  // the bounding box of the text
  if (!color) {
    if (element) {
      group.removeChild(element);
    }

    return group.getBBox();
  }

  // Otherwise, check if we have a <rect> element. If not, create one
  if (!element) {
    element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    element.setAttribute('class', 'background');
    group.insertBefore(element, group.firstChild);
  }

  // Get the text groups's bounding box and use it to draw the background rectangle
  const bBox = group.getBBox();

  const attributes = {
    x: `${bBox.x}`,
    y: `${bBox.y}`,
    width: `${bBox.width}`,
    height: `${bBox.height}`,
    fill: color,
  };

  setAttributesIfNecessary(attributes, element);

  return bBox;
}

export default drawTextBox;
