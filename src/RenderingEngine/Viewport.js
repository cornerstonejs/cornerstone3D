import { ORIENTATION } from '../constants';
import _cloneDeep from 'lodash.clonedeep';

class Viewport {
  constructor({
    uid,
    type,
    canvas,
    sx,
    sy,
    sWidth,
    sHeight,
    defaultOptions,
    renderWindow,
  }) {
    this.uid = uid;
    this.type = type;
    this.canvas = canvas;
    this.sx = sx;
    this.sy = sy;
    this.sWidth = sWidth;
    this.sHeight = sHeight;

    const options = Object.assign({}, defaultOptions);

    if (typeof options.orientation === 'string') {
      const orientation = ORIENTATION[options.orientation];

      options.orientation = _cloneDeep(orientation);
    }

    this.defaultOptions = _cloneDeep(options);
    this.options = _cloneDeep(options);
    this.renderWindow = renderWindow;

    // TODO Make new renderer and add it to renderWindow
  }

  setOptions(options, immediate = false) {
    this.options = Object.assign({}, options);

    if (immediate) {
      // TODO Render
    }
  }

  reset(immediate = false) {
    this.options = deepmerge({}, this.defaultOptions);

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
