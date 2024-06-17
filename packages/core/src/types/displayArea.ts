import InterpolationType from '../enums/InterpolationType';

/**
 * The display area type allows specifying or updating the image position and
 * size based on the display area that it is shown in and based on the image
 * size.
 *
 * Two types are currently defined, the default 'FIT', specifies scaling
 * to fit the given image area.  For this type, the area  that is scaled to
 * fit is the imageArea times the image size.  For example, an imageArea of
 * `[0.5,2]` with a 512 square image will try to fit 0.5*512 = 256 pixels width wise,
 * and 2*512 = 1024 height wise.
 *
 * The type 'SCALE' means to use a scale factor, such as 1.0, which means to make
 * every image pixel fit one physical display pixel.
 *
 * Then, the image is positioned such that the image fractional position imagePoint
 * is located at the canvas fractional point canvasPoint.  Using fractional
 * points allows being independent of image size.
 *
 * Finally, the store as initial camera allows the zoom and pan values to be
 * set to 1 and [0,0] respectively for the initially displayed position, as well
 * as having the reset camera reset to the specified display area.
 */
type DisplayArea = {
  type?: 'SCALE' | 'FIT';
  scale?: number;
  interpolationType?: InterpolationType;
  imageArea?: [number, number]; // areaX, areaY
  imageCanvasPoint?: {
    /** Use the fractional imagePoint as the target image point to position */
    imagePoint: [number, number]; // imageX, imageY
    /** Pan the image such that the target imagePoint is located at the
     * canvas point fraction of the canvas.
     */
    canvasPoint?: [number, number]; // canvasX, canvasY
  };
  /** Make this display area the default and reset/navigate will reapply this */
  storeAsInitialCamera?: boolean;
};

export default DisplayArea;
