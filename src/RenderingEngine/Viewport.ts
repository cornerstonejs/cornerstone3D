import { VIEWPORT_TYPE } from '../constants/index';
import _cloneDeep from 'lodash.clonedeep';
// @ts-ignore
import renderingEngineCache from './renderingEngineCache.ts';
// @ts-ignore
import RenderingEngine from './RenderingEngine.ts';
// @ts-ignore
import Scene from './Scene';

const DEFAULT_SLAB_THICKNESS = 0.1;

interface ViewportInterface {
  uid: string;
  sceneUID: string;
  renderingEngineUID: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  render: Function;
}

class Viewport implements ViewportInterface {
  uid: string;
  sceneUID: string;
  renderingEngineUID: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  options: any;

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

    renderer.resetCamera();
  }

  getRenderingEngine(): RenderingEngine {
    return renderingEngineCache.get(this.renderingEngineUID);
  }

  getRenderer() {
    const renderingEngine = this.getRenderingEngine();

    return renderingEngine.offscreenMultiRenderWindow.getRenderer(this.uid);
  }

  render() {
    const renderingEngine = this.getRenderingEngine();

    renderingEngine.render();
  }

  getScene(): Scene {
    const renderingEngine = this.getRenderingEngine();

    return renderingEngine.getScene(this.sceneUID);
  }

  testCanvasToWorldRoundTrip() {
    const canvasPos = [this.sWidth / 4, this.sHeight / 4];

    const worldPos = this.canvasToWorld(canvasPos);

    console.log(`viewport: ${this.uid}`);
    console.log(canvasPos);
    console.log(worldPos);
    console.log(this.worldToCanvas(worldPos));

    // TODO -> move camera

    const camera = this.getActiveCamera();

    const distance = camera.getDistance();
    const dop = camera.getDirectionOfProjection();

    const cameraFocalPoint = camera.getFocalPoint();

    const newFocalPoint = [
      cameraFocalPoint[0] - dop[0] * 0.1 * distance,
      cameraFocalPoint[1] - dop[1] * 0.1 * distance,
      cameraFocalPoint[2] - dop[2] * 0.1 * distance,
    ];

    const newCameraPosition = [
      cameraFocalPoint[0] - dop[0] * 1.1 * distance,
      cameraFocalPoint[1] - dop[1] * 1.1 * distance,
      cameraFocalPoint[2] - dop[2] * 1.1 * distance,
    ];

    camera.setPosition(...newCameraPosition);
    camera.setFocalPoint(...newFocalPoint);
    this.getRenderer().resetCamera();

    this.render();

    const worldPos2 = this.canvasToWorld(canvasPos);

    console.log(`viewport: ${this.uid}`);
    console.log(canvasPos);
    console.log(worldPos2);
    console.log(this.worldToCanvas(worldPos2));
  }

  setOptions(options, immediate = false) {
    this.options = Object.assign({}, options);

    // TODO Set up camera etc.

    if (immediate) {
      this.render();
    }
  }

  reset(immediate = false) {
    this.options = _cloneDeep(this.defaultOptions);

    // TODO Set up camera etc.

    if (immediate) {
      this.render();
    }
  }

  setToolGroup(toolGropUID) {
    // TODO -> set the toolgroup to use for this api.
  }

  setSyncGroups(syncGroupUIDs) {
    // TODO -> Set the syncgroups for tools on this api.
  }

  _setVolumeActors(volumeActors) {
    const renderer = this.getRenderer();

    volumeActors.forEach(va => renderer.addActor(va.volumeActor));

    let slabThickness = DEFAULT_SLAB_THICKNESS;

    volumeActors.forEach(va => {
      if (va.slabThickness && va.slabThickness > slabThickness) {
        slabThickness = va.slabThickness;
      }
    });

    renderer.resetCamera();

    const activeCamera = renderer.getActiveCamera();

    activeCamera.setThicknessFromFocalPoint(slabThickness);
    activeCamera.setFreezeFocalPoint(true);
  }

  getCanvas(): HTMLCanvasElement {
    return <HTMLCanvasElement>this.canvas;
  }
  getActiveCamera() {
    const renderer = this.getRenderer();

    return renderer.getActiveCamera();
  }

  /**
   *
   * @param canvasPos The position in canvas coordinates.
   *
   */
  canvasToWorld(canvasPos: Array<number>): Array<number> {
    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow;
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();

    const displayCoord = [canvasPos[0] + this.sx, canvasPos[0] + this.sy];

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    // TODO -> This appears to be correct as it inverts the world. I think it uses the camera position.

    return worldCoord;
  }

  worldToCanvas(worldPos: Array<number>): Array<number> {
    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow = this.getRenderingEngine()
      .offscreenMultiRenderWindow;
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();

    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
      renderer
    );

    const canvasCoord = [displayCoord[0] - this.sx, displayCoord[1] - this.sy];

    return canvasCoord;
  }

  // TODO?
  setCamera = ({
    focalPoint,
    orientation, // {viewUp, sliceNormal}
    slabThickness,
  }) => {};
}

export default Viewport;
