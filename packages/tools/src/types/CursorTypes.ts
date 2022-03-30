export type SVGPoint = {
  x: number;
  y: number;
};

export type SVGCursorDescriptor = {
  iconContent: string;
  iconSize: number;
  viewBox: SVGPoint;
  mousePoint: SVGPoint;
  mousePointerGroupString: string;
};
