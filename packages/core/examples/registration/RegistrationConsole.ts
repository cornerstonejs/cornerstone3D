import * as hdf5 from 'jsfive';
import { getFormatedDateTime } from './utils';

class RegistrationConsole {
  private _consoleRoot: HTMLElement;
  private _logRoot: HTMLDivElement;

  constructor(container) {
    const { consoleRoot, logRoot } =
      RegistrationConsole.createLogWindow(container);

    this._consoleRoot = consoleRoot;
    this._logRoot = logRoot;
  }

  private static createLogWindow(container) {
    const statusFieldset = document.createElement('fieldset');
    const statusFieldsetLegent = document.createElement('legend');
    const logRoot = document.createElement('div');

    Object.assign(statusFieldset.style, {
      fontSize: '12px',
      height: '200px',
      overflow: 'scroll',
    });

    statusFieldsetLegent.innerText = 'Processing logs';
    logRoot.style.fontFamily = 'monospace';

    statusFieldset.appendChild(statusFieldsetLegent);
    statusFieldset.appendChild(logRoot);
    container.appendChild(statusFieldset);

    return {
      consoleRoot: statusFieldset,
      logRoot,
    };
  }

  public log(text, preFormated = false) {
    const { _consoleRoot: consoleRoot, _logRoot: logRoot } = this;
    const node = document.createElement(preFormated ? 'pre' : 'p');

    node.innerHTML = `${getFormatedDateTime()} ${text}`;
    node.style.margin = '0';
    node.style.fontSize = '10px';
    logRoot.appendChild(node);

    // Scroll to the end
    consoleRoot.scrollBy(0, consoleRoot.scrollHeight - consoleRoot.scrollTop);
  }

  public clear() {
    const { _logRoot: logRoot } = this;
    while (logRoot.hasChildNodes()) {
      logRoot.removeChild(logRoot.firstChild);
    }
  }

  /**
   * Log all image information
   */
  public logImageInfo(image) {
    this.log(`image "${image.name}"`);
    this.log(`    origin: ${image.origin.join(', ')}`, true);
    this.log(`    spacing: ${image.spacing.join(', ')}`, true);
    this.log(`    direction: ${image.direction.join(', ')}`, true);
    this.log(`    size: ${image.size.join(', ')}`, true);
    this.log(`    imageType:`, true);
    this.log(`        dimension: ${image.imageType.dimension}`, true);
    this.log(`        components: ${image.imageType.components}`, true);
    this.log(`        componentType: ${image.imageType.componentType}`, true);
    this.log(`        pixelType: ${image.imageType.pixelType}`, true);
  }

  /**
   * Log HDF5 transform and make it available for download
   */
  public logTransform(transform) {
    let buffer = transform.data.buffer;

    // Convert SharedArrayBuffer into ArrayBuffer
    if (buffer instanceof SharedArrayBuffer) {
      buffer = new Uint8ClampedArray(buffer).slice().buffer;
    }

    const fileName = transform.path;
    const hdfFile = new hdf5.File(buffer, transform.path);
    const transformBlob = new Blob([buffer], { type: 'application/x-hdf5' });
    const url = URL.createObjectURL(transformBlob);

    this.log(
      `Download <a href="${url}" download="${fileName}">${fileName}</a>`
    );

    console.log('Transform (HDF5):', hdfFile);
  }

  destroy() {
    this._consoleRoot.remove();
    this._consoleRoot = null;
    this._logRoot = null;
  }
}

export { RegistrationConsole as default, RegistrationConsole };
