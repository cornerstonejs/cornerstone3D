import { Events } from './../enums/index';
import { VIEWPORT_TYPE } from '../constants/index';
import _cloneDeep from 'lodash.clonedeep';
import renderingEngineCache from './renderingEngineCache';
import RenderingEngine, { ViewportInputOptions } from './RenderingEngine';
import Scene, { VolumeActorEntry } from './Scene';
import triggerEvent from './../utils/triggerEvent';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';
import { vec3 } from 'gl-matrix';
import vtkMatrixBuilder from 'vtk.js/Sources/Common/Core/MatrixBuilder';

const DEFAULT_SLAB_THICKNESS = 0.1;

export interface ViewportInterface {
  uid: string;
  sceneUID: string;
  renderingEngineUID: string;
  type: string;
  canvas: HTMLCanvasElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
}

interface CameraInterface {
  clippingRange?: Array<number>;
  focalPoint?: Array<number>;
  parallelProjection?: boolean;
  parallelScale?: number;
  position?: Array<number>;
  viewAngle?: number;
  viewPlaneNormal?: Array<number>;
  viewUp?: Array<number>;
}

/**
 * @class Viewport - An object representing a single viewport, which is a camera
 * looking into a scene, and an associated target output `canvas`.
 *
 * @implements {ViewportInterface}
 */
class Viewport implements ViewportInterface {
  readonly uid: string;
  readonly sceneUID: string;
  readonly renderingEngineUID: string;
  readonly type: string;
  readonly canvas: HTMLCanvasElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  readonly defaultOptions: any;
  options: ViewportInputOptions;

  constructor(props: ViewportInterface) {
    this.uid = props.uid;
    this.sceneUID = props.sceneUID;
    this.renderingEngineUID = props.renderingEngineUID;
    this.type = props.type;
    this.canvas = props.canvas;
    this.sx = props.sx;
    this.sy = props.sy;
    this.sWidth = props.sWidth;
    this.sHeight = props.sHeight;

    // Set data attributes for render events
    this.canvas.setAttribute('data-viewport-uid', this.uid);
    this.canvas.setAttribute('data-scene-uid', this.sceneUID);
    this.canvas.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineUID
    );

    const options = _cloneDeep(props.defaultOptions);
    const defaultOptions = _cloneDeep(props.defaultOptions);

    this.defaultOptions = defaultOptions;
    this.options = options;

    const renderer = this.getRenderer();

    const camera = renderer.getActiveCamera();

    switch (this.type) {
      case VIEWPORT_TYPE.ORTHOGRAPHIC:
        camera.setParallelProjection(true);
        break;
      case VIEWPORT_TYPE.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;
      default:
        throw new Error(`Unrecognised viewport type: ${this.type}`);
    }

    const { sliceNormal, viewUp } = this.defaultOptions.orientation;

    camera.setDirectionOfProjection(
      -sliceNormal[0],
      -sliceNormal[1],
      -sliceNormal[2]
    );
    camera.setViewUp(...viewUp);
    camera.setThicknessFromFocalPoint(DEFAULT_SLAB_THICKNESS);
    camera.setFreezeFocalPoint(true);

    this.resetCamera();
  }

  /**
   * @method getRenderingEngine Returns the rendering engine driving the `Scene`.
   *
   * @returns {RenderingEngine} The RenderingEngine instance.
   */
  public getRenderingEngine(): RenderingEngine {
    return renderingEngineCache.get(this.renderingEngineUID);
  }

  /**
   * @method getRenderer Returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns {object} The `vtkRenderer` for the `Viewport`.
   */
  public getRenderer() {
    const renderingEngine = this.getRenderingEngine();

    return renderingEngine.offscreenMultiRenderWindow.getRenderer(this.uid);
  }

  /**
   * @method render Renders the `Viewport` using the `RenderingEngine`.
   */
  public render() {
    const renderingEngine = this.getRenderingEngine();

    renderingEngine.renderViewport(this.sceneUID, this.uid);
  }

  /**
   * @method getScene Gets the `Scene` object that the `Viewport` is associated with.
   *
   * @returns {Scene} The `Scene` object.
   */
  public getScene(): Scene {
    const renderingEngine = this.getRenderingEngine();

    return renderingEngine.getScene(this.sceneUID);
  }

  /**
   * @method setOptions Sets new options and (TODO) applies them.
   *
   * @param {ViewportInputOptions} options The viewport options to set.
   * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are set.
   */
  public setOptions(options: ViewportInputOptions, immediate = false) {
    this.options = <ViewportInputOptions>_cloneDeep(options);

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render();
    }
  }

  /**
   * @method reset Resets the options the `Viewport`'s `defaultOptions`.`
   *
   * @param {boolean} [immediate=false] If `true`, renders the viewport after the options are reset.
   */
  public reset(immediate = false) {
    this.options = _cloneDeep(this.defaultOptions);

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render();
    }
  }

  /**
   * @method _setVolumeActors Attaches the volume actors to the viewport.
   *
   * @param {Array<VolumeActorEntry>} volumeActorEntries The volume actors to add the viewport.
   */
  public _setVolumeActors(volumeActorEntries: Array<VolumeActorEntry>) {
    const renderer = this.getRenderer();

    volumeActorEntries.forEach(va => renderer.addActor(va.volumeActor));

    if (this.type === VIEWPORT_TYPE.ORTHOGRAPHIC) {
      let slabThickness = DEFAULT_SLAB_THICKNESS;

      volumeActorEntries.forEach(va => {
        if (va.slabThickness && va.slabThickness > slabThickness) {
          slabThickness = va.slabThickness;
        }
      });

      this.resetCamera();

      const activeCamera = renderer.getActiveCamera();

      activeCamera.setThicknessFromFocalPoint(slabThickness);
      activeCamera.setFreezeFocalPoint(true);
    } else {
      // Use default renderer resetCamera, fits bounding sphere of data.
      renderer.resetCamera();

      const activeCamera = renderer.getActiveCamera();

      activeCamera.setFreezeFocalPoint(true);
    }
  }

  resetCamera = () => {
    const renderer = this.getRenderer();

    const bounds = renderer.computeVisiblePropBounds();
    const focalPoint = [0, 0, 0];

    const activeCamera = this.getVtkActiveCamera();
    const viewPlaneNormal = activeCamera.getViewPlaneNormal();
    const viewUp = activeCamera.getViewUp();

    // Reset the perspective zoom factors, otherwise subsequent zooms will cause
    // the view angle to become very small and cause bad depth sorting.
    activeCamera.setViewAngle(30.0);

    focalPoint[0] = (bounds[0] + bounds[1]) / 2.0;
    focalPoint[1] = (bounds[2] + bounds[3]) / 2.0;
    focalPoint[2] = (bounds[4] + bounds[5]) / 2.0;

    const corners = [
      [bounds[0], bounds[2], bounds[4]],
      [bounds[0], bounds[2], bounds[5]],
      [bounds[0], bounds[3], bounds[4]],
      [bounds[0], bounds[3], bounds[5]],
      [bounds[1], bounds[2], bounds[4]],
      [bounds[1], bounds[2], bounds[5]],
      [bounds[1], bounds[3], bounds[4]],
      [bounds[1], bounds[3], bounds[5]],
    ];

    const transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(viewUp, [1, 0, 0]);

    corners.forEach(pt => transform.apply(pt));

    // range is now maximum X distance
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = corners[i][0];
      if (x > maxX) {
        maxX = x;
      }
      if (x < minX) {
        minX = x;
      }
    }

    const radius = (maxX - minX) / 2;

    const angle = vtkMath.radiansFromDegrees(activeCamera.getViewAngle());
    const parallelScale = radius;

    let distance;

    if (activeCamera.getParallelProjection()) {
      // Stick the camera just outside of the bounding sphere of all the volumeData so that MIP behaves correctly.

      let w1 = bounds[1] - bounds[0];
      let w2 = bounds[3] - bounds[2];
      let w3 = bounds[5] - bounds[4];

      w1 *= w1;
      w2 *= w2;
      w3 *= w3;

      distance = w1 + w2 + w3;

      // If we have just a single point, pick a radius of 1.0
      distance = distance === 0 ? 1.0 : distance;

      // compute the radius of the enclosing sphere
      distance = 1.1 * (Math.sqrt(distance) / 2);

      console.log(radius, distance);
    } else {
      distance = radius / Math.sin(angle * 0.5);
    }

    // check view-up vector against view plane normal

    if (Math.abs(vtkMath.dot(viewUp, viewPlaneNormal)) > 0.999) {
      activeCamera.setViewUp(-viewUp[2], viewUp[0], viewUp[1]);
    }

    // update the camera
    activeCamera.setFocalPoint(...focalPoint);
    activeCamera.setPosition(
      focalPoint[0] + distance * viewPlaneNormal[0],
      focalPoint[1] + distance * viewPlaneNormal[1],
      focalPoint[2] + distance * viewPlaneNormal[2]
    );

    renderer.resetCameraClippingRange(bounds);

    // setup default parallel scale
    activeCamera.setParallelScale(parallelScale);

    // update reasonable world to physical values
    activeCamera.setPhysicalScale(radius);
    activeCamera.setPhysicalTranslation(
      -focalPoint[0],
      -focalPoint[1],
      -focalPoint[2]
    );

    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    };

    // Here to let parallel/distributed compositing intercept
    // and do the right thing.
    renderer.invokeEvent(RESET_CAMERA_EVENT);

    return true;
  };

  /**
   * @method getCanvas Gets the target ouput canvas for the `Viewport`.
   *
   * @returns {HTMLCanvasElement}
   */
  public getCanvas(): HTMLCanvasElement {
    return <HTMLCanvasElement>this.canvas;
  }
  /**
   * @method getActiveCamera Gets the active vtkCamera for the viewport.
   *
   * @returns {object} the vtkCamera.
   */
  public getVtkActiveCamera() {
    const renderer = this.getRenderer();

    return renderer.getActiveCamera();
  }

  public getCamera(): CameraInterface {
    const vtkCamera = this.getVtkActiveCamera();

    // TODO: Make sure these are deep copies.

    return {
      viewUp: vtkCamera.getViewUp(),
      viewPlaneNormal: vtkCamera.getViewPlaneNormal(),
      clippingRange: vtkCamera.getClippingRange(),
      // TODO: I'm really not sure about this, it requires a calculation, and
      // how useful is this without the renderer context?
      // Lets add it back if we find we need it.
      //compositeProjectionMatrix: vtkCamera.getCompositeProjectionMatrix(),
      position: vtkCamera.getPosition(),
      focalPoint: vtkCamera.getFocalPoint(),
      parallelProjection: vtkCamera.getParallelProjection(),
      parallelScale: vtkCamera.getParallelScale(),
      viewAngle: vtkCamera.getViewAngle(),
    };
  }

  public setCamera(cameraInterface: CameraInterface) {
    const vtkCamera = this.getVtkActiveCamera();
    const previousCamera = JSON.parse(JSON.stringify(this.getCamera()));
    const updatedCamera = Object.assign({}, previousCamera, cameraInterface);
    const {
      viewUp,
      viewPlaneNormal,
      clippingRange,
      position,
      focalPoint,
      parallelProjection,
      parallelScale,
      viewAngle,
    } = cameraInterface;

    if (viewUp !== undefined) {
      vtkCamera.setViewUp(viewUp);
    }

    if (viewPlaneNormal !== undefined) {
      vtkCamera.setDirectionOfProjection(
        -viewPlaneNormal[0],
        -viewPlaneNormal[1],
        -viewPlaneNormal[2]
      );
    }

    if (clippingRange !== undefined) {
      vtkCamera.setClippingRange(clippingRange);
    }

    if (position !== undefined) {
      vtkCamera.setPosition(...position);
    }

    if (focalPoint !== undefined) {
      vtkCamera.setFocalPoint(...focalPoint);
    }

    if (parallelScale !== undefined) {
      vtkCamera.setParallelScale(parallelScale);
    }

    if (viewAngle !== undefined) {
      vtkCamera.setViewAngle(viewAngle);
    }

    const eventDetail = {
      previousCamera,
      camera: updatedCamera,
    };

    triggerEvent(this.canvas, Events.CAMERA_MODIFIED, eventDetail);

    if (this.type == VIEWPORT_TYPE.PERSPECTIVE) {
      const renderer = this.getRenderer();

      renderer.resetCameraClippingRange();
    }
  }

  /**
   * @canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos The position in canvas coordinates.
   *
   * @returns {Array<number>} The corresponding world coordinates.
   *
   */
  public canvasToWorld = (canvasPos: Array<number>): Array<number> => {
    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow;
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();

    const size = openGLRenderWindow.getSize();
    const displayCoord = [canvasPos[0] + this.sx, canvasPos[1] + this.sy];

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    return worldCoord;
  };

  /**
   * @canvasToWorld Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos The position in world coordinates.
   *
   * @returns {Array<number>} The corresponding canvas coordinates.
   */
  public worldToCanvas = (worldPos: Array<number>): Array<number> => {
    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow;
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();

    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
      renderer
    );

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const canvasCoord = [displayCoord[0] - this.sx, displayCoord[1] - this.sy];

    return canvasCoord;
  };
}

export default Viewport;
