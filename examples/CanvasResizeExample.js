import React, { Component } from 'react';
import { RenderingEngine, CONSTANTS } from '@vtk-viewport';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

class CanvasResizeExample extends Component {
  state = {
    viewportSizes: [
      [128, 128],
      [128, 128],
      [128, 256],
    ],
  };

  constructor(props) {
    super(props);

    this.axialCTContainer = React.createRef();
    this.sagittalCTContainer = React.createRef();
    this.coronalCTContainer = React.createRef();

    this.resize = this.resize.bind(this);
  }

  componentWillUnmount() {
    this.renderingEngine.destroy();
  }

  resize() {
    const viewportSizes = [
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
    ];

    this.setState({ viewportSizes });
  }

  componentDidUpdate() {
    const t0 = new Date().getTime();
    this.renderingEngine.resize();

    const t1 = new Date().getTime();

    this.renderingEngine.render();

    const t2 = new Date().getTime();

    console.log(`Resize time: ${t1 - t0}, Re-render time: ${t2 - t1} ms`);
  }

  componentDidMount() {
    const renderingEngineUID = 'ExampleRenderingEngineID';

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

    const axialCTViewportID = 'AXIAL_CT';
    const sagittalCTViewportID = 'SAGITTAL_CT';
    const coronalCTViewportID = 'CORONAL_CT';

    this.axialCTViewportID = axialCTViewportID;
    this.sagittalCTViewportID = sagittalCTViewportID;
    this.coronalCTViewportID = coronalCTViewportID;

    const ctSceneID = 'SCENE_CT';

    renderingEngine.setViewports([
      {
        sceneUID: ctSceneID,
        viewportUID: axialCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.axialCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 0, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [0, 1, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [0, 0, 1],
        },
      },
    ]);

    renderingEngine.render();
  }

  render() {
    const { viewportSizes } = this.state;

    const style0 = {
      width: `${viewportSizes[0][0]}px`,
      height: `${viewportSizes[0][1]}px`,
    };

    const style1 = {
      width: `${viewportSizes[1][0]}px`,
      height: `${viewportSizes[1][1]}px`,
    };

    const style2 = {
      width: `${viewportSizes[2][0]}px`,
      height: `${viewportSizes[2][1]}px`,
    };

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>Canvas Resize Example </h1>
            <p>
              This example demonstrates how to resize the offscreen rendering
              framework by calling renderingEngine.resize() when onscreen canvas
              elements are resized. It is the applications responsiblity to tell
              the rendering engine when to resize.
            </p>
            <p>
              RenderingEngine resize times and re-render times are logged to the
              console.
            </p>
            <button onClick={this.resize}>Resize</button>
            <p>
              Canvas Sizes:
              {`(${viewportSizes[0][0]}x${viewportSizes[0][1]}) (${viewportSizes[1][0]}x${viewportSizes[1][1]}) (${viewportSizes[2][0]}x${viewportSizes[2][1]}) `}
            </p>
          </div>
        </div>
        <div className="row">
          <div>
            <canvas
              ref={this.axialCTContainer}
              width={viewportSizes[0][0]}
              height={viewportSizes[0][1]}
              style={style0}
            />

            <canvas
              width={viewportSizes[1][0]}
              height={viewportSizes[1][1]}
              ref={this.sagittalCTContainer}
              style={style1}
            />

            <canvas
              width={viewportSizes[2][0]}
              height={viewportSizes[2][1]}
              ref={this.coronalCTContainer}
              style={style2}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default CanvasResizeExample;
