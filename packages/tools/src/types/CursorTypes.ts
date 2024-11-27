export type SVGPoint = {
  x: number;
  y: number;
};

export type SVGCursorDescriptor = {
  name?: string; // The name from CursorSVG object
  iconContent: string;
  iconSize?: number;
  viewBox: {
    x: number;
    y: number;
  };
  mousePoint?: {
    x: number;
    y: number;
  };
  mousePointerGroupString?: string;
};
