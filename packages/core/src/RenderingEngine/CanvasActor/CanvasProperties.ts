import type CanvasActor from '.';

/**
 * Properties for rendering on a labelmap canvas actor.
 * Mostly a no-op right now, but the transfer function settings are live.
 */
export default class CanvasProperties {
  private actor: CanvasActor;
  private opacity = 0.4;
  private outlineOpacity = 0.4;
  private transferFunction = [];
  private scalarOpacityFunction;
  private colorCache = new Map<number, [number, number, number, number]>();

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  public setRGBTransferFunction(index, cfun) {
    this.transferFunction[index] = cfun;
    this.invalidateColorCache();
  }

  public getRGBTransferFunction(index = 0) {
    return this.transferFunction[index];
  }

  public setScalarOpacity(indexOrOpacity, scalarOpacityFunction?) {
    if (scalarOpacityFunction?.getValue) {
      this.scalarOpacityFunction = scalarOpacityFunction;
      this.invalidateColorCache();
      return;
    }

    if (indexOrOpacity?.getValue) {
      this.scalarOpacityFunction = indexOrOpacity;
      this.invalidateColorCache();
      return;
    }

    if (typeof indexOrOpacity === 'number') {
      this.opacity = indexOrOpacity;
      this.invalidateColorCache();
    }
  }

  public getScalarOpacity() {
    return this.scalarOpacityFunction;
  }

  public getOpacity() {
    return this.opacity;
  }

  public setInterpolationTypeToNearest() {
    // No-op
  }

  public setUseLabelOutline() {
    // No-op - not implemented
  }

  public setLabelOutlineOpacity(opacity) {
    this.outlineOpacity = opacity;
  }

  public setLabelOutlineThickness() {
    // No-op - requires outline to be implemented first
  }

  public modified() {
    this.invalidateColorCache();
  }

  public getColorBytes(
    index: number,
    destination?: Uint8ClampedArray | Uint8Array | number[],
    offset = 0
  ): [number, number, number, number] {
    let color = this.colorCache.get(index);

    if (!color) {
      const cfun = this.transferFunction[0];

      if (!cfun) {
        color = [0, 0, 0, 0];
      } else {
        const rawOpacity = this.scalarOpacityFunction?.getValue
          ? this.scalarOpacityFunction.getValue(index)
          : this.opacity;
        const opacity = Math.min(Math.max(rawOpacity, 0), 1);
        color = [
          Math.round(Math.min(Math.max(cfun.getRedValue(index), 0), 1) * 255),
          Math.round(Math.min(Math.max(cfun.getGreenValue(index), 0), 1) * 255),
          Math.round(Math.min(Math.max(cfun.getBlueValue(index), 0), 1) * 255),
          Math.round(opacity * 255),
        ];
      }

      this.colorCache.set(index, color);
    }

    if (destination) {
      destination[offset] = color[0];
      destination[offset + 1] = color[1];
      destination[offset + 2] = color[2];
      destination[offset + 3] = color[3];
    }

    return color;
  }

  public getColor(index: number) {
    const [r, g, b, opacity] = this.getColorBytes(index);

    return [r / 255, g / 255, b / 255, opacity / 255];
  }

  private invalidateColorCache(): void {
    this.colorCache.clear();
    this.actor.modified();
  }
}
