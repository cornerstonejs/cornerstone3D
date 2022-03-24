import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  renderToCanvas,
  init as cs3dInit,
} from '@cornerstonejs/core'
import * as csTools3d from '@cornerstonejs/tools'
import { WindowLevelTool } from '@cornerstonejs/tools'
import getImageIds from './helpers/getImageIds'
import { renderingEngineId } from './constants'

const STACK = 'stack'

const imageId =
  'wadors:https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1/series/1.3.6.1.4.1.25403.345050719074.3824.20170125095258.2/instances/1.3.6.1.4.1.25403.345050719074.3824.20170125095258.3/frames/1'

class RenderToCanvasExample extends Component {
  state = {
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 1,
      numRows: 1,
      viewports: [{}],
    },
    ptCtLeftClickTool: WindowLevelTool.toolName,
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    imageId: imageId,
    thumbnailLoaded: false,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._canvasNodes = new Map()
    this._offScreenRef = React.createRef()

    this._viewportGridRef = React.createRef()

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)
    this.dxStackImageIdsPromise = getImageIds('dx', STACK)

    Promise.all([this.ctStackImageIdsPromise, this.dxStackImageIdsPromise])
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await cs3dInit()
    const renderingEngine = new RenderingEngine(renderingEngineId)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine
  }

  componentDidUpdate(prevProps, prevState) {}

  componentWillUnmount() {
    cache.purgeCache()
    csTools3d.destroy()

    this.renderingEngine.destroy()
  }

  renderToCanvas = (imageId) => {
    renderToCanvas(imageId, this._canvasNodes.get(0), renderingEngineId).then(
      () => {
        this.setState({
          thumbnailLoaded: true,
        })
      }
    )
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Render To Canvas Example</h2>
            <p>
              This example demonstrates how to render an image to a canvas
              without dealing with enabling an HTML element. This is useful for
              rendering to a thumbnail for instance, which you might not be
              interested in using tools or other functionalities.
            </p>
          </div>
        </div>
        <div style={{ marginBottom: '15px' }}>
          {/* an input element to put the image Id inside */}
          <div className="row col-xs-12">
            <div className="flex">
              <label htmlFor="imageIdInput" style={{ marginLeft: '5px' }}>
                Image Id
              </label>
              <button
                style={{ marginLeft: '5px' }}
                onClick={() => this.renderToCanvas(this.state.imageId)}
              >
                Load Image
              </button>
            </div>
            <input
              type="string"
              style={{ marginLeft: '5px', width: '100%' }}
              name="imageIdInput"
              value={this.state.imageId}
              onChange={(evt) => {
                this.setState({ imageId: evt.target.value })
              }}
            />
          </div>
        </div>
        <div className="row col-xs-12" style={{ marginTop: '15px' }}>
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              style={{
                backgroundColor: 'black',
                width: '256px',
                height: '256px',
              }}
              key={i}
            >
              <canvas
                width="256px"
                height="256px"
                ref={(c) => this._canvasNodes.set(i, c)}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }
}

export default RenderToCanvasExample
