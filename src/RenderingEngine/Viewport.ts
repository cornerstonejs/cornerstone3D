import { ORIENTATION, VIEWPORT_TYPE } from '../constants/index';
import _cloneDeep from 'lodash.clonedeep';

const DEFAULT_SLAB_THICKNESS = 0.1;

interface ViewportInterface {
  uid: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  render: Function;
  getRenderer: Function;
  getOffscreenMultiRenderWindow: Function;
}

class Viewport {
  uid: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  options: any;
  render: Function;
  getRenderer: Function;
  getOffscreenMultiRenderWindow: Function;

  constructor(props: ViewportInterface) {
    this.uid = props.uid;
    this.type = props.type;
    this.canvas = props.canvas;
    this.sx = props.sx;
    this.sy = props.sy;
    this.sWidth = props.sWidth;
    this.sHeight = props.sHeight;
    this.render = props.render;
    this.getRenderer = props.getRenderer;
    this.getOffscreenMultiRenderWindow = props.getOffscreenMultiRenderWindow;
    // get Scene
    // get RenderingEngine

    const options = _cloneDeep(props.defaultOptions);
    const defaultOptions = _cloneDeep(props.defaultOptions);

    this.defaultOptions = defaultOptions;
    this.options = options;

    const renderer = this.getRenderer();

    // worldToCanvas helpers.
    // debugger;
    // const offscreenMultiRenderWindow = this.getOffscreenMultiRenderWindow();

    // const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();

    // const displayCoord = openGLRenderWindow.worldToDisplay(0, 0, 0, renderer);

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

    renderer.resetCamera();

    renderer
      .getActiveCamera()
      .setThicknessFromFocalPoint(DEFAULT_SLAB_THICKNESS);

    /*
      this.setOrientation(orientation.sliceNormal, orientation.viewUp);
    } else {
      istyle.setSliceNormal(0, 0, 1);
    }

    const camera = this.renderer.getActiveCamera();

    camera.setParallelProjection(true);
    this.renderer.resetCamera();

    istyle.setVolumeActor(this.props.volumes[0]);
    const range = istyle.getSliceRange();
    istyle.setSlice((range[0] + range[1]) / 2);
    */
  }
}

export default Viewport;
