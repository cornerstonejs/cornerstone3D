import CanvasActor from '.';

/**
 * Mimics the VTK mapper functionality, but for non-vtk canvas based rendering
 * classes.
 */
export default class CanvasMapper {
  private actor: CanvasActor;

  constructor(actor: CanvasActor) {
    this.actor = actor;
  }

  getInputData() {
    return this.actor.getImage();
  }
}
