import type { Types } from '@cornerstonejs/core';
import type { SVGDrawingHelper } from '../types';

import _getHash from './_getHash';
import setAttributesIfNecessary from './setAttributesIfNecessary';
import { registerTextBox } from '../utilities/drawing/textBoxOverlapRegistry';

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

  // Register this text box so future placements can avoid overlapping it.
  if (svgDrawingHelper.svgLayerElement) {
    registerTextBox(svgDrawingHelper.svgLayerElement, textGroupBoundingBox);
  }

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
  const {
    padding,
    color,
    fontFamily,
    fontSize,
    background,
    textBoxBorderRadius,
    textBoxMargin,
  } = options;

  let textGroupBoundingBox;
  const [x, y] = [position[0] + padding, position[1] + padding];
  const backgroundStyles = {
    color: background,
    textBoxBorderRadius,
    textBoxMargin,
  };
  const svgns = 'http://www.w3.org/2000/svg';
  const svgNodeHash = _getHash(annotationUID, 'text', textUID);
  const existingTextGroup = svgDrawingHelper.getSvgNode(svgNodeHash);

  // Todo: right now textBox gets a re-render even if the textBox has not changed
  // and evenIf the attributes are not set again since they are the same.
  if (existingTextGroup) {
    // TODO: Iterate each node and update color? font-size?
    const textElement = existingTextGroup.querySelector('text');
    const textSpans = Array.from(textElement.children) as Array<SVGElement>;

    for (let i = 0; i < textSpans.length; i++) {
      const textSpanElement = textSpans[i];
      const text = textLines[i] || '';

      textSpanElement.textContent = text;
    }

    // if the textLines have changed size, we need to create textSpans for them
    if (textLines.length > textSpans.length) {
      for (let i = 0; i < textLines.length - textSpans.length; i++) {
        const textLine = textLines[i + textSpans.length];
        const textSpan = _createTextSpan(textLine);

        textElement.appendChild(textSpan);
      }

      existingTextGroup.appendChild(textElement);
      svgDrawingHelper.appendNode(existingTextGroup, svgNodeHash);
    }

    const textAttributes = {
      fill: color,
      'font-size': fontSize,
      'font-family': fontFamily,
    };

    const textGroupAttributes = {
      transform: `translate(${x} ${y})`,
    };

    // Todo: for some reason this does not work to not re-render the textBox
    setAttributesIfNecessary(textAttributes, textElement);
    setAttributesIfNecessary(textGroupAttributes, existingTextGroup);

    // Add data attribute for annotation UID
    existingTextGroup.setAttribute('data-annotation-uid', annotationUID);
    textGroupBoundingBox = _drawTextBackground(
      existingTextGroup,
      backgroundStyles
    );

    svgDrawingHelper.setNodeTouched(svgNodeHash);
  } else {
    const textGroup = document.createElementNS(svgns, 'g');
    // Add data attribute for annotation UID
    textGroup.setAttribute('data-annotation-uid', annotationUID);

    textGroup.setAttribute('transform', `translate(${x} ${y})`);

    //
    const textElement = _createTextElement(svgDrawingHelper, options);
    for (let i = 0; i < textLines.length; i++) {
      const textLine = textLines[i];
      const textSpan = _createTextSpan(textLine);

      textElement.appendChild(textSpan);
    }

    textGroup.appendChild(textElement);
    svgDrawingHelper.appendNode(textGroup, svgNodeHash);
    textGroupBoundingBox = _drawTextBackground(textGroup, backgroundStyles);
  }

  // `getBBox()` is returned in the group's local coordinates and does not include
  // the group's translate transform, so we offset x/y manually. Keep width/height
  // as-is to reflect the actual rendered text box size for link anchoring.
  return Object.assign({}, textGroupBoundingBox, {
    x: x + textGroupBoundingBox.x,
    y: y + textGroupBoundingBox.y,
    height: textGroupBoundingBox.height,
    width: textGroupBoundingBox.width,
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

  textSpanElement.setAttribute('x', '0');
  textSpanElement.setAttribute('dy', '1.2em');
  textSpanElement.textContent = text;

  return textSpanElement;
}

function _drawTextBackground(group: SVGGElement, backgroundStyles) {
  const {
    color,
    textBoxBorderRadius = 0,
    textBoxMargin = 0,
  } = backgroundStyles;
  let element = group.querySelector('rect.background');
  const textElement = group.querySelector('text').getBBox();

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
  // use the text box dimensions to apply the textBoxMargin
  const bBox = group.getBBox();

  const attributes = {
    x: `${bBox.x}`,
    y: `${bBox.y}`,
    width: `${textElement.width + Number(textBoxMargin) * 2}`,
    height: `${textElement.height + Number(textBoxMargin) * 2}`,
    fill: color,
    rx: textBoxBorderRadius,
    ry: textBoxBorderRadius,
  };

  if (textBoxMargin) {
    // Add offset to the text spans to centre them within the textBoxMargin
    const tSpans = Array.from(
      group.querySelector('text').querySelectorAll('tspan')
    );
    tSpans.forEach((tspan, i) => {
      i === 0 && tspan.setAttribute('y', textBoxMargin);
      tspan.setAttribute('x', textBoxMargin);
    });
  }

  setAttributesIfNecessary(attributes, element);

  return bBox;
}

export default drawTextBox;
