import CanvasActor from '.';

/**
 * Properties for rendering on a labelmap canvas actor.
 * Mostly a no-op right now, but the transfer function settings are live.
 */
export default class CanvasProperties {
  private actor: CanvasActor;
  private opacity = 0.4;
  private outlineOpacity = 0.4;
  private transferFunction = [];

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  public setRGBTransferFunction(index, cfun) {
    this.transferFunction[index] = cfun;
  }

  public setScalarOpacity(opacity: number) {
    // No-op until this gets set correctly
    // this.opacity = opacity;
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

  public getColor(index: number) {
    const cfun = this.transferFunction[0];
    const r = cfun.getRedValue(index);
    const g = cfun.getGreenValue(index);
    const b = cfun.getBlueValue(index);
    return [r, g, b, this.opacity];
  }
}
