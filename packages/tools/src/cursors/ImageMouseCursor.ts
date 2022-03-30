import { utilities } from '@cornerstonejs/core';
import MouseCursor from './MouseCursor';

const DEFAULT_NAME = 'image-cursor';

export default class ImageMouseCursor extends MouseCursor {
  private url: string;
  private x: number;
  private y: number;

  constructor(
    url: string,
    x?: number,
    y?: number,
    name?: string | undefined,
    fallback?: MouseCursor | undefined
  ) {
    super(
      name || ImageMouseCursor.getUniqueInstanceName(DEFAULT_NAME),
      fallback
    );
    this.url = url;
    this.x = Number(x) || 0;
    this.y = Number(y) || 0;
  }

  getStyleProperty(): string {
    const { url, x, y } = this;
    let style = `url('${url}')`;
    if (x >= 0 && y >= 0 && (x > 0 || y > 0)) {
      style += ` ${x} ${y}`;
    }
    return this.addFallbackStyleProperty(style);
  }

  static getUniqueInstanceName(prefix: string): string {
    return `${prefix}-${utilities.getRuntimeId(ImageMouseCursor)}`;
  }
}
