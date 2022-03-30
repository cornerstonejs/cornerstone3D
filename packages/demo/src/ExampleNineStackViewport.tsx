import React, { Component } from 'react';
import {
  cache,
  RenderingEngine,
  Enums,
  CONSTANTS,
  init as csRenderInit,
} from '@cornerstonejs/core';
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP';

import getImageIds from './helpers/getImageIds';
import ViewportGrid from './components/ViewportGrid';
import { initToolGroups, addToolsToToolGroups } from './initToolGroups';
import './ExampleVTKMPR.css';
import { ctStackUID, VIEWPORT_IDS } from './constants';
import * as csTools3d from '@cornerstonejs/tools';

const renderingEngineId = 'renderingEngineId';
const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

window.cache = cache;

class NineStackViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 3,
      viewports: [{}, {}, {}, {}, {}, {}, {}, {}, {}],
    },
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  };

  constructor(props) {
    super(props);

    csTools3d.init();

    this._elementNodes = new Map();
    this._viewportGridRef = React.createRef();
    this._offScreenRef = React.createRef();
    this.ctImageIdsPromise = getImageIds('ctStack', 'STACK');
    // this.dxImageIdsPromise = createDXImageIds();
    // Promise.all([this.ctImageIdsPromise, this.dxImageIdsPromise]).then(() =>
    //   this.setState({ progressText: 'Loading data...' })
    // )

    // const {
    //   createCameraPositionSynchronizer,
    //   createVOISynchronizer,
    // } = synchronizers

    // this.axialSync = createCameraPositionSynchronizer('axialSync')
    // this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    // this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    // this.ctWLSync = createVOISynchronizer('ctWLSync')
    // this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize();
        this.renderingEngine.render();
      }
    });
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await csRenderInit();
    csTools3d.init();
    const { stackCTViewportToolGroup } = initToolGroups();

    this.ctStackUID = ctStackUID;

    // Create volumes
    const imageIds = await this.ctImageIdsPromise;
    // const dxImageIds = await this.dxImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineId);
    // const renderingEngine = new RenderingEngine(renderingEngineId)

    this.renderingEngine = renderingEngine;
    window.renderingEngine = renderingEngine;

    const viewportInput = [
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--0',
        type: ViewportType.STACK,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--1',
        type: ViewportType.STACK,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--2',
        type: ViewportType.STACK,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--3',
        type: ViewportType.STACK,
        element: this._elementNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--4',
        type: ViewportType.STACK,
        element: this._elementNodes.get(4),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--5',
        type: ViewportType.STACK,
        element: this._elementNodes.get(5),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--6',
        type: ViewportType.STACK,
        element: this._elementNodes.get(6),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--7',
        type: ViewportType.STACK,
        element: this._elementNodes.get(7),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportId: VIEWPORT_IDS.STACK.CT + '--8',
        type: ViewportType.STACK,
        element: this._elementNodes.get(8),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ];

    renderingEngine.setViewports(viewportInput);

    addToolsToToolGroups({ stackCTViewportToolGroup });
    // volume ct

    // stack ct
    viewportInput.forEach((vpEntry) => {
      stackCTViewportToolGroup.addViewport(
        vpEntry.viewportId,
        renderingEngineId
      );
    });

    renderingEngine.render();

    const promises = viewportInput.map((vpEntry) => {
      const stackViewport = renderingEngine.getViewport(vpEntry.viewportId);
      return stackViewport.setStack(sortImageIdsByIPP(imageIds));
    });

    Promise.all(promises).then(() => {
      this.setState({
        metadataLoaded: true,
      });

      // This will initialise volumes in GPU memory
      renderingEngine.render();
    });

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current);
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect();
    }

    cache.purgeCache();
    csTools3d.destroy();

    this.renderingEngine.destroy();
  }

  showOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = '';
    const uri = this.renderingEngine._debugRender();
    const image = document.createElement('img');
    image.src = uri;
    image.setAttribute('width', '100%');

    this._offScreenRef.current.appendChild(image);
  };

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = '';
  };

  render() {
    return (
      <div>
        <div>
          <h1>Nine Stack Viewports (setViewports API)</h1>
          <p>
            This is a demo for a heavy use case of stack viewports and to
            profile the performance of it.
          </p>
        </div>
        <div style={{ paddingBottom: '55px' }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: '650px', marginTop: '35px' }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '2px solid grey',
                  background: 'black',
                  ...(vp.cellStyle || {}),
                }}
                ref={(c) => this._elementNodes.set(i, c)}
                onContextMenu={(e) => e.preventDefault()}
                key={i}
              />
            ))}
          </ViewportGrid>
        </div>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hideOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    );
  }
}

export default NineStackViewportExample;
