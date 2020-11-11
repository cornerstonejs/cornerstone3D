import React, { Component } from 'react';
import { RenderingEngine } from '@vtk-viewport';

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

  resize() {
    const viewportSizes = [
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
      [Math.floor(Math.random() * 512), Math.floor(Math.random() * 512)],
    ];

    this.setState({ viewportSizes });
  }

  componentDidUpdate() {
    this.renderingEngine.resize();
    this.renderingEngine.render();
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
        type: 'orthogonal',
        canvas: this.axialCTContainer.current,
        defaultOptions: {
          orientation: 'AXIAL',
          background: [1, 0, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: 'orthogonal',
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: 'SAGITTAL',
          background: [0, 1, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: 'orthogonal',
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: 'CORONAL',
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

    // TODO: react to events and make correct stuff active.

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
