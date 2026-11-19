'use client';

export function toDisplay(viewport, point: number[]) {
  return viewport.getVtkDisplayCoords(point);
}
