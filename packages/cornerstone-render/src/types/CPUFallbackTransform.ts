import Point2 from './Point2';
import TransformMatrix2D from './TransformMatrix2D';

interface CPUFallbackTransform {
  reset: () => void;
  clone: () => CPUFallbackTransform;
  multiply: (matrix: TransformMatrix2D) => void;
  getMatrix: () => TransformMatrix2D;
  invert: () => void;
  rotate: (rad: number) => void;
  translate: (x: number, y: number) => void;
  scale: (sx: number, sy: number) => void;
  transformPoint: (point: Point2) => Point2;
}

export default CPUFallbackTransform;
