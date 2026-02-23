import { describe, it, expect } from '@jest/globals';
import getTextBoxCoordsCanvas from './getTextBoxCoordsCanvas';
import { registerTextBox } from './textBoxOverlapRegistry';

function createViewportElement(width: number, height: number) {
  const element = document.createElement('div') as HTMLDivElement;
  Object.defineProperty(element, 'clientWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(element, 'clientHeight', {
    value: height,
    configurable: true,
  });

  const viewportElement = document.createElement('div');
  viewportElement.className = 'viewport-element';

  const svgLayer = document.createElement('div');
  svgLayer.className = 'svg-layer';
  viewportElement.appendChild(svgLayer);
  element.appendChild(viewportElement);

  return { element, svgLayer };
}

describe('getTextBoxCoordsCanvas', () => {
  const annotationPoints = [
    [100, 100],
    [120, 120],
  ] as [number, number][];
  const textLines = ['0123456789']; // width: 130, height: 67 by estimator

  it('returns the default right-side midpoint when no element is provided', () => {
    const coords = getTextBoxCoordsCanvas(annotationPoints);

    expect(coords[0]).toBe(120);
    expect(coords[1]).toBe(110);
  });

  it('nudges downward when the default textbox overlaps an existing one', () => {
    const { element, svgLayer } = createViewportElement(500, 400);

    registerTextBox(svgLayer, {
      x: 120,
      y: 70,
      width: 130,
      height: 67,
    });

    const coords = getTextBoxCoordsCanvas(
      annotationPoints,
      element,
      textLines
    );

    // blocker.y + blocker.height + gap(6)
    expect(coords[0]).toBe(120);
    expect(coords[1]).toBe(143);
  });

  it('falls back to upward nudging when downward placement runs out of space', () => {
    const { element, svgLayer } = createViewportElement(500, 400);
    const lowerPoints = [
      [100, 350],
      [120, 390],
    ] as [number, number][];

    registerTextBox(svgLayer, {
      x: 120,
      y: 330,
      width: 130,
      height: 67,
    });

    const coords = getTextBoxCoordsCanvas(
      lowerPoints,
      element,
      textLines
    );

    // blocker.y - candidate.height - gap(6)
    expect(coords[0]).toBe(120);
    expect(coords[1]).toBe(257);
  });

  it('keeps the original position when both downward and upward slots are exhausted', () => {
    const { element, svgLayer } = createViewportElement(500, 150);
    const topPoints = [
      [100, 60],
      [120, 80],
    ] as [number, number][];

    registerTextBox(svgLayer, {
      x: 120,
      y: 30,
      width: 130,
      height: 67,
    });

    const coords = getTextBoxCoordsCanvas(topPoints, element, textLines);

    // original candidate y = center(70) - h/2(33.5) = 36.5
    expect(coords[0]).toBe(120);
    expect(coords[1]).toBeCloseTo(36.5);
  });
});
