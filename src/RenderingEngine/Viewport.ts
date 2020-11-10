import { ORIENTATION } from '../constants/index';
import _cloneDeep from 'lodash.clonedeep';

interface ViewportInterface {
  uid: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: any;
  renderWindow: object;
}

class Viewport {
  uid: string;
  type: string;
  canvas: HTMLElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  renderWindow: object;
  defaultOptions: any;
  options: any;

  constructor(props: ViewportInterface) {
    this.uid = props.uid;
    this.type = props.type;
    this.canvas = props.canvas;
    this.sx = props.sx;
    this.sy = props.sy;
    this.sWidth = props.sWidth;
    this.sHeight = props.sHeight;
    this.renderWindow = props.renderWindow;

    const options = Object.assign({}, props.defaultOptions);

    if (typeof options.orientation === 'string') {
      const orientation = ORIENTATION[options.orientation];

      options.orientation = _cloneDeep(orientation);
    }

    this.defaultOptions = _cloneDeep(options);
    this.options = _cloneDeep(options);

    // TODO Make new renderer and add it to renderWindow
  }

  setOptions(options, immediate = false) {
    this.options = Object.assign({}, options);

    if (immediate) {
      // TODO Render
    }
  }

  reset(immediate = false) {
    this.options = _cloneDeep(this.defaultOptions);

    if (immediate) {
      // TODO Render
    }
  }

  setToolGroup(toolGropUID) {
    // TODO -> set the toolgroup to use for this api.
  }

  setSyncGroups(syncGroupUIDs) {
    // TODO -> Set the syncgroups for tools on this api.
  }

  _setVolumeActors(volumeActors) {
    // TODO -> get renderer and set volume actors.
  }
}

export default Viewport;
