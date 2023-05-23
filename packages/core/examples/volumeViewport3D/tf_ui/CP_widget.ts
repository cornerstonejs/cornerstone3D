import { Panel, clamp } from './ui';
/**
 * Color operates in two color spaces: HSV and RGB
 * HSV colors are in a { hue ∈ [ 0, 1 ], saturation ∈ [ 0, 1 ], value ∈ [ 0, 1 ] } domain
 * RGB colors are in a { red ∈ [ 0, 255 ], green ∈ [ 0, 255 ], blue ∈ [ 0, 255 ] } domain
 */
export class Color {
  constructor() {
    this.rgb = { r: 0, g: 0, b: 0 };
    this.hsv = { h: 0, s: 0, v: 0 };

    this.callbacks = [];

    this.set(this.rgb, null);
  }

  /**
   * attach a callback function to color object
   * owner is the element the function is contained in
   * callback is the actual callback function
   */
  registerCallback(owner, callback) {
    if (this.callbacks.indexOf({ owner: owner, callback: callback }) < 0) {
      this.callbacks.push({ owner: owner, callback: callback });
    }
  }

  /**
   * remove callbacks owned by owner
   */
  removeCallback(owner) {
    for (let i = 0; i < this.callbacks.length; i++) {
      if (this.callbacks[i].owner === owner) {
        this.callbacks.splice(i, 1);
      }
    }
  }

  /**
   * fires all registered callback functions on color change
   */

  fireChange(caller) {
    if (caller === undefined) caller = null;

    for (let index = 0; index < this.callbacks.length; index++) {
      const callbackObject = this.callbacks[index];
      const owner = callbackObject.owner;
      const callback = callbackObject.callback;
      if (owner !== caller) {
        callback(this);
      }
    }
  }

  /**
   * value is an object containing key, value pairs specifying new color values, either in rgb or hsv
   * components may be missing
   * e.g. { r: 255, g: 0, b: 120 } or { r: 255 } or { s: 1, v: 0 }
   *
   * caller may be passed to identify the element that triggered the change
   * (in order to not fire the change event back to that element)
   */
  set = function (col, caller) {
    if (caller === undefined) caller = null;
    col = Color.parseColor(col);
    //check keys in col object
    const vars = Object.keys(col).join('');
    //test if string of keys contain 'rgb' or 'hsv'
    const setRGB = /[rgb]/i.test(vars);
    const setHSV = /[hsv]/i.test(vars);

    if (vars.length == 0 || setRGB === setHSV) {
      console.err('invalid params in color setter: cannot assign');
      return;
    }

    const self = this;
    //assign each component to the respective color parameter
    Object.keys(col).forEach(function (key) {
      if (setRGB) self.rgb[key] = col[key];
      else if (setHSV) self.hsv[key] = col[key];
    });

    //update the color space value not assigned through the setter
    if (setRGB) this.hsv = Color.RGBtoHSV(this.rgb);
    else if (setHSV) this.rgb = Color.HSVtoRGB(this.hsv);

    //notify all attached callbacks
    this.fireChange(caller);
  };

  getRGB = function () {
    return this.rgb;
  };

  getHSV = function () {
    return this.hsv;
  };

  static RGB = function (x, y, z) {
    return { r: x, g: y, b: z };
  };

  static HSV = function (x, y, z) {
    return { h: x, s: y, v: z };
  };

  /**
   * parses an unknown input color value
   * @param col HEX string (#FFFFFF or #FFF) OR RGB(A) string 'rgb(a)( 255, 255, 255 )' (alpha will be dropped) or Color object
   * @returns {{r: r, g: g, b: b}} RGB object for parsed strings or the original RGB component for color objects
   */
  static parseColor = function (col) {
    if (col === null) return null;
    //check if color is a string, otherwise do conversion to color object
    if (typeof col === 'string') {
      //HEX
      //if( col.startsWith( '#' ) ) {
      if (col.lastIndexOf('#', 0) === 0) {
        return Color.HEXtoRGB(col);
        //RGB(A) (would discard alpha value)
        //} else if( col.startsWith( 'rgb' ) ) {
      } else if (col.lastIndexOf('rgb', 0) === 0) {
        const parsedNumbers = col
          .match(/^\d+|\d+\b|\d+(?=\w)/g)
          .map(function (v) {
            return +v;
          });
        if (parsedNumbers.length < 3) {
          console.err('tried to assign invalid color ' + col);
          return;
        }
        return RGB(parsedNumbers[0], parsedNumbers[1], parsedNumbers[2]);
      }
    } else if (typeof col === 'object') {
      return col;
    }
  };

  /**
   * convert RGB color to HEX color
   * @param r red [ 0, 255 ] OR object { r: x, g: y, b: z }
   * @param g green [ 0, 255 ]
   * @param b blue [ 0, 255 ]
   * @returns {string} converted color value in HEX
   */
  static RGBtoHEX = function (r, g, b) {
    if (arguments.length === 1) {
      g = r.g;
      b = r.b;
      r = r.r;
    }
    //round to nearest integers
    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);

    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  /**
   * convert HEX color to RGB
   * from http://stackoverflow.com/a/5624139
   * @param hex string hex color value (6 digit hex #ffffff or shorthand 3 digit hex  #fff)
   * @returns {{r, g, b}} converted color value as RGB object { r: red, g: green, b: blue }
   */
  static HEXtoRGB = function (hex) {
    if (!typeof hex === 'string') {
      console.error('HEXtoRGB: argument is not type of string');
    }
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
      return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? this.RGB(
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        )
      : null;
  };

  /**
   * convert HSV color to RGB
   * from http://stackoverflow.com/a/17243070
   * @param h hue OR object { h: x, s: y, v: z }
   * @param s saturation
   * @param v value
   * @returns {{r, g, b}} converted color value as RGB object { r: red, g: green, b: blue }
   * @constructor
   */
  static HSVtoRGB = function (h, s, v) {
    let r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
      (s = h.s), (v = h.v), (h = h.h);
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        (r = v), (g = t), (b = p);
        break;
      case 1:
        (r = q), (g = v), (b = p);
        break;
      case 2:
        (r = p), (g = v), (b = t);
        break;
      case 3:
        (r = p), (g = q), (b = v);
        break;
      case 4:
        (r = t), (g = p), (b = v);
        break;
      case 5:
        (r = v), (g = p), (b = q);
        break;
    }
    return this.RGB(
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255)
    );
  };

  /**
   * convert RGB color to HSV
   * from http://stackoverflow.com/a/17243070
   * @param r red [ 0, 255 ] OR object { r: x, g: y, b: z }
   * @param g green [ 0, 255 ]
   * @param b blue [ 0, 255 ]
   * @returns {{h, s, v}} converted color value as HSV object { h: hue, s: saturation, v: value }
   */
  static RGBtoHSV = function (r, g, b) {
    if (arguments.length === 1) {
      (g = r.g), (b = r.b), (r = r.r);
    }
    let max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min,
      h,
      s = max === 0 ? 0 : d / max,
      v = max / 255;

    switch (max) {
      case min:
        h = 0;
        break;
      case r:
        h = g - b + d * (g < b ? 6 : 0);
        h /= 6 * d;
        break;
      case g:
        h = b - r + d * 2;
        h /= 6 * d;
        break;
      case b:
        h = r - g + d * 4;
        h /= 6 * d;
        break;
    }

    return this.HSV(h, s, v);
  };
}

/**
 * CP_widget is the base class for the color picker widget
 */
export class CP_widget {
  constructor(options) {
    if (options === undefined) options = null;

    const container = options.container || document.body;
    this.container = container;
    const panel = new Panel({ container: container });
    const parent = null;
    this.color = new Color();

    panel.dom.id = 'cp-panel';

    panel.addClass('overlay');
    panel.addClass('popup');
    panel.addClass(options.colorScheme ? options.colorScheme : 'dark');

    this.hidePanel = this.hide.bind(this);

    this.panel = panel;
    panel.dom.style.width =
      options.svPicker.size +
      options.hPicker.width +
      options.hPicker.pad +
      4 +
      'px';

    this.SVPicker = this.createSVPicker(this.color, options.svPicker);
    this.HPicker = this.createHPicker(this.color, options.hPicker);
    const inputFields = this.createInputFields(this.color);

    this.SVPicker.style.backgroundColor = '#FF0000';
  }

  hide = function () {
    this.panel.hide();

    if (this.parent) {
      //remove previous parent
      this.color.removeCallback(this.parent);
    }
  };

  showAt = function (x, y, parent) {
    x = clamp(
      x,
      0,
      this.container.clientWidth - this.panel.dom.clientWidth - 10
    );
    y = clamp(
      y,
      0,
      this.container.clientHeight - this.panel.dom.clientHeight - 10
    );

    if (parent) this.parent = parent;
    this.panel.moveTo(x, y);
  };

  /**
   * SVPicker is the square region in the color picker that allows for the selection of the saturation/value of the color
   * it is composed by overlaying a DIV (containing the background color picked from the hue picker) with two gradients:
   * a horizontal gradient canvas for the transition color->white and a vertical gradient canvas for the transition color->black
   * in combination, they represent the saturation/value of the color space
   * @param color
   * @param options
   * @returns {Element}
   */
  createSVPicker = function (color, options) {
    const SVPicker = document.createElement('div');
    SVPicker.className = 'field';
    SVPicker.width = options.size;
    SVPicker.height = options.size;
    SVPicker.setAttribute(
      'style',
      'margin: 0;' +
        'padding: 0;' +
        'top: 0;' +
        'float: left;' +
        'height: ' +
        SVPicker.width +
        'px;' +
        'width: ' +
        SVPicker.height +
        'px;'
    ); // +
    this.panel.dom.appendChild(SVPicker);

    const HGradientCanvas = document.createElement('canvas');
    HGradientCanvas.width = SVPicker.width;
    HGradientCanvas.height = SVPicker.height;
    HGradientCanvas.setAttribute(
      'style',
      'margin: 0;' +
        'padding: 0;' +
        'top: 0;' +
        'float: left;' +
        'height: ' +
        SVPicker.width +
        'px;' +
        'width: ' +
        SVPicker.height +
        'px;'
    );

    SVPicker.appendChild(HGradientCanvas);
    const HGradientContext = HGradientCanvas.getContext('2d');

    let gradient = HGradientContext.createLinearGradient(
      0,
      0,
      SVPicker.width,
      0
    ); //horizontal gradient
    gradient.addColorStop(0, '#FFF');
    gradient.addColorStop(1, 'rgba( 255, 255, 255, 0 )');
    HGradientContext.fillStyle = gradient;
    HGradientContext.fillRect(0, 0, SVPicker.width, SVPicker.height);

    const VGradientCanvas = document.createElement('canvas');
    VGradientCanvas.width = SVPicker.width;
    VGradientCanvas.height = SVPicker.height;
    VGradientCanvas.setAttribute(
      'style',
      'margin: 0;' +
        'padding: 0;' +
        'top: 0;' +
        'float: left;' +
        'margin-left:' +
        -SVPicker.width +
        'px;' +
        'height: ' +
        SVPicker.width +
        'px;' +
        'width: ' +
        SVPicker.height +
        'px;'
    );

    SVPicker.appendChild(VGradientCanvas);
    const VGradientContext = VGradientCanvas.getContext('2d');

    gradient = VGradientContext.createLinearGradient(0, SVPicker.height, 0, 0); //vertical gradient
    gradient.addColorStop(0, '#000');
    gradient.addColorStop(1, 'rgba( 0, 0, 0, 0 )');
    VGradientContext.fillStyle = gradient;
    VGradientContext.fillRect(0, 0, SVPicker.width, SVPicker.height);

    const SVPickerCursor = document.createElement('div');
    SVPickerCursor.className = 'handle';
    SVPickerCursor.width = options.cursorRadius * 2;
    SVPickerCursor.height = options.cursorRadius * 2;
    SVPickerCursor.setAttribute(
      'style',
      'height: ' +
        SVPickerCursor.height +
        'px;' +
        'width: ' +
        SVPickerCursor.width +
        'px;' +
        'border-radius: 50%;' +
        'position: relative;' +
        'top: -' +
        options.cursorRadius +
        'px;' +
        'left: -' +
        options.cursorRadius +
        'px'
    );
    SVPicker.appendChild(SVPickerCursor);

    const pickSV = function (e) {
      console.log('pick SV');
      e.preventDefault();
      e.stopPropagation();

      const pos = UI.getRelativePosition(e.clientX, e.clientY, SVPicker);

      pos.x = clamp(pos.x, 0, SVPicker.width);
      pos.y = clamp(pos.y, 0, SVPicker.height);

      const saturation = pos.x / SVPicker.width;
      const value = 1 - pos.y / SVPicker.height;

      color.set({ s: saturation, v: value }, SVPicker);

      const cursorX = pos.x - options.cursorRadius;
      const cursorY = pos.y - options.cursorRadius;

      SVPickerCursor.style.left = cursorX + 'px';
      SVPickerCursor.style.top = cursorY + 'px';
      return false;
    };

    const cp_widget = this;

    function onMouseUp() {
      //remove mousemove function
      document.removeEventListener('mousemove', pickSV);
      //hide color picker on next click in document
      //document.addEventListener( 'mousedown', cp_widget.hidePanel, { once: true } );
      document.addEventListener('mousedown', cp_widget.hidePanel);
    }

    function onMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      pickSV(e);
      //add mousemove function (while mouse is down)
      document.addEventListener('mousemove', pickSV);
      //prevent panel from hiding while mouse is down
      document.removeEventListener('mousedown', cp_widget.hidePanel);

      //document.addEventListener( 'mouseup', onMouseUp, { once: true } );
      document.addEventListener('mouseup', onMouseUp);
      return false;
    }

    SVPicker.addEventListener('mousedown', onMouseDown);

    SVPicker.update = function (color) {
      const hsv = color.getHSV();
      const rgb = Color.HSVtoRGB(hsv.h, 1, 1);
      SVPicker.style.backgroundColor =
        'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';

      const xPos = hsv.s * SVPicker.width;
      const yPos = (1 - hsv.v) * SVPicker.height;

      const cursorX = xPos - options.cursorRadius;
      const cursorY = yPos - options.cursorRadius;

      SVPickerCursor.style.left = cursorX + 'px';
      SVPickerCursor.style.top = cursorY + 'px';
    };

    color.registerCallback(SVPicker, SVPicker.update);

    return SVPicker;
  };

  createHPicker = function (color, options) {
    const HPicker = document.createElement('div');
    HPicker.className = 'field';
    HPicker.width = options.width;
    HPicker.height = options.height;
    HPicker.setAttribute(
      'style',
      'float: right;' +
        'margin-left: ' +
        options.pad +
        'px;' +
        'padding: 0;' +
        'height: ' +
        HPicker.height +
        'px;' +
        'width: ' +
        HPicker.width +
        'px;'
    );

    const HPickerCanvas = document.createElement('canvas');
    HPickerCanvas.setAttribute(
      'style',
      'float:left;' +
        'height: ' +
        HPicker.height +
        'px;' +
        'width: ' +
        HPicker.width +
        'px;'
    );
    HPickerCanvas.width = HPicker.width;
    HPickerCanvas.height = HPicker.height;
    const HPickerContext = HPickerCanvas.getContext('2d');

    const gradient = HPickerContext.createLinearGradient(
      0,
      HPicker.height,
      0,
      0
    ); //horizontal gradient
    gradient.addColorStop(1.0, '#f00');
    gradient.addColorStop(0.83, '#f0f');
    gradient.addColorStop(0.67, '#00f');
    gradient.addColorStop(0.5, '#0ff');
    gradient.addColorStop(0.33, '#0f0');
    gradient.addColorStop(0.17, '#ff0');
    gradient.addColorStop(0.0, '#f00');

    HPickerContext.fillStyle = gradient;
    HPickerContext.fillRect(0, 0, HPicker.width, HPicker.height);
    HPicker.appendChild(HPickerCanvas);

    this.panel.dom.appendChild(HPicker);

    const HPickerCursor = document.createElement('div');
    HPickerCursor.className = 'handle';
    HPickerCursor.width = HPicker.width;
    HPickerCursor.height = options.cursorHeight;
    HPickerCursor.setAttribute(
      'style',
      'position:relative;' +
        'top: 0px;' +
        'left: 0px;' +
        'height: ' +
        HPickerCursor.height +
        'px;' +
        'width: ' +
        HPickerCursor.width +
        'px'
    );
    HPicker.appendChild(HPickerCursor);

    const pickHue = function (e) {
      console.log('pick hue');
      e.preventDefault();
      e.stopPropagation();

      const pos = UI.getRelativePosition(null, e.clientY, HPicker);
      pos.y = clamp(pos.y, 0, HPicker.height);

      const hue = 1 - pos.y / HPicker.height;
      color.set({ h: hue }, HPicker);

      const cursorY = pos.y - HPickerCursor.height / 2;
      HPickerCursor.style.top = cursorY + 'px';

      return false;
    };

    const cp_widget = this;

    function onMouseUp() {
      //remove mousemove function
      document.removeEventListener('mousemove', pickHue);
      //hide color picker on next click in document
      //document.addEventListener( 'mousedown', cp_widget.hidePanel, { once: true } );
      document.addEventListener('mousedown', cp_widget.hidePanel);
    }

    function onMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      pickHue(e);
      //add mousemove function (while mouse is down)
      document.addEventListener('mousemove', pickHue);
      //prevent panel from hiding while mouse is down
      document.removeEventListener('mousedown', cp_widget.hidePanel);

      //document.addEventListener( 'mouseup', onMouseUp, { once: true } );
      document.addEventListener('mouseup', onMouseUp);
      return false;
    }

    HPicker.addEventListener('mousedown', onMouseDown);

    HPicker.update = function (color) {
      const hue = color.getHSV().h;

      const yPos = (1 - hue) * HPicker.height;
      const cursorY = yPos - HPickerCursor.height / 2;
      HPickerCursor.style.top = cursorY + 'px';
    };

    color.registerCallback(HPicker, HPicker.update);
    return HPicker;
  };

  createInputFields = function (color) {
    const inputContainer = document.createElement('div');
    inputContainer.height = 20;
    this.panel.dom.appendChild(inputContainer);
    inputContainer.setAttribute(
      'style',
      'float: left;' + 'height: ' + inputContainer.height + 'px;'
    );

    const inputWidth = Math.max(Math.floor(this.SVPicker.width / 3 - 5), 22);

    const inputStyle =
      'margin-top: 4px;' + 'height: 12px;' + 'width:' + inputWidth + 'px;';

    const inputs = ['r', 'g', 'b'];
    const range = [0, 255];

    function inputEvent() {
      let value = Number(this.value);

      //constrain input to valid numbers
      value = clamp(value, range[0], range[1]);
      if (value !== this.value) this.value = value;
      const components = {};
      components[this.name] = value;
      color.set(components, inputContainer);
      //console.log('input changed to: ' + this.value + ' ' + this.name );
    }

    function pickColor() {
      color.set(
        {
          r: Number(inputs[0].value),
          g: Number(inputs[1].value),
          b: Number(inputs[2].value),
        },
        inputContainer
      );
    }

    for (let num = 0; num < inputs.length; num++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = range[0];
      input.max = range[1];
      input.step = 1;
      input.value = 255;
      input.title = inputs[num];
      input.name = inputs[num];
      input.setAttribute('style', inputStyle);
      if (num < inputs.length - 1) input.style.marginRight = '3px';
      inputContainer.appendChild(input);
      input.addEventListener('mousedown', function (e) {
        e.stopPropagation();
      });
      input.addEventListener('input', inputEvent);
      inputs[num] = input;
    }

    inputContainer.update = function (color) {
      const rgb = color.getRGB();
      inputs[0].value = rgb.r;
      inputs[1].value = rgb.g;
      inputs[2].value = rgb.b;
    };

    color.registerCallback(inputContainer, inputContainer.update);
  };
}
