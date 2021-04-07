import React, { Component } from 'react'
import { BrowserRouter as Router, Route, Link, Switch } from 'react-router-dom'
import VTKMPRExample from './ExampleVTKMPR'
import CanvasResizeExample from './ExampleCanvasResize'
import TwentyFiveCanvasExample from './ExampleTwentyFiveCanvas'
import ColorExample from './ExampleColor'
import VolumeMapper2DExample from './Example2DVolumeMapper'
import StackViewportExample from './ExampleStackViewport'

function LinkOut({ href, text }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}

function ExampleEntry({ title, url, text }) {
  return (
    <div>
      <h5>
        <Link to={url}>{title}</Link>
      </h5>
      <p>{text}</p>
      <hr />
    </div>
  )
}

function Index() {
  const style = {
    height: '512px',
  }

  const examples = [
    {
      title: 'MPR',
      url: '/mpr',
      text: 'Example MPR playground.',
    },
    {
      title: 'Canvas Resize',
      url: '/canvasResize',
      text: 'Onscreen/Offscreen Canvas Resize Example.',
    },
    {
      title: 'Twenty Five Canvas',
      url: '/twentyFiveCanvas',
      text:
        'Example with twenty five on screen canvases linked to a single RenderingEngine.',
    },
    {
      title: 'Color',
      url: '/color',
      text: 'Example with color.',
    },
    // {
    //   title: '2D rendering with vtkVolumeMapper',
    //   url: '/volumeMapper2D',
    //   text: 'Example for displaying 2D image with vtkVolumeMapper.',
    // },
    {
      title: 'New stack viewport',
      url: '/stackViewport',
      text: 'Example for displaying stack and volume viewport',
    },
  ]

  const exampleComponents = examples.map((e) => {
    return <ExampleEntry key={e.title} {...e} />
  })

  return (
    <div className="container">
      <div className="row">
        <h1>Cornerstone 3D viewport</h1>
      </div>
      <div className="row">
        <div className="col-xs-12 col-lg-6">
          <p>
            This is a framework build on top of{' '}
            <LinkOut
              href={'https://github.com/Kitware/vtk-js'}
              text={'VTK.js'}
            />{' '}
            for easily managing data, displaying images and building tools.
          </p>
          <p>
            <LinkOut
              href={'/docs'}
              text="Documentation for this library can be found at `/docs`"
            />
          </p>
        </div>

        <div className="col-xs-12 col-lg-12" style={style}>
          <h3>Examples</h3>
          {exampleComponents}
        </div>
      </div>
    </div>
  )
}

function Example(props) {
  return (
    <div className="container">
      <h6>
        <Link to="/">Back to Examples</Link>
      </h6>
      {props.children}
    </div>
  )
}

function AppRouter() {
  const mpr = () =>
    Example({
      children: <VTKMPRExample />,
    })
  const canvasResize = () =>
    Example({
      children: <CanvasResizeExample />,
    })
  const twentyFiveCanvas = () =>
    Example({
      children: <TwentyFiveCanvasExample />,
    })

  const color = () =>
    Example({
      children: <ColorExample />,
    })

  const volumeMapper2D = () =>
    Example({
      children: <VolumeMapper2DExample />,
    })

  const stackViewport = () =>
    Example({
      children: <StackViewportExample />,
    })

  return (
    <Router>
      <Switch>
        <Route exact path="/" component={Index} />
        <Route exact path="/mpr/" render={mpr} />
        <Route exact path="/canvasResize/" render={canvasResize} />
        <Route exact path="/twentyFiveCanvas/" render={twentyFiveCanvas} />
        <Route exact path="/color/" render={color} />
        {/* <Route exact path="/volumeMapper2D/" render={volumeMapper2D} /> */}
        <Route exact path="/stackViewport/" render={stackViewport} />
        <Route exact component={Index} />
      </Switch>
    </Router>
  )
}

export default class App extends Component {
  render() {
    return <AppRouter />
  }
}
