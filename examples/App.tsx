import React, { Component } from 'react'
import { BrowserRouter as Router, Route, Link, Switch } from 'react-router-dom'
import VTKMPRExample from './ExampleVTKMPR'
import CanvasResizeExample from './ExampleCanvasResize'
import TwentyFiveCanvasExample from './ExampleTwentyFiveCanvas'
import ColorExample from './ExampleColor'
import VolumeMapper2DExample from './Example2DVolumeMapper'
import StackViewportExample from './ExampleStackViewport'
import EnableDisableViewportExample from './ExampleEnableDisableAPI'
import NineStackViewportExample from './ExampleNineStackViewport'
import VTKSetVolumesExample from './ExampleSetVolumes'
import CacheDecacheExample from './ExampleCacheDecache'

function LinkOut({ href, text }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}

function ExampleEntry({ title, url, text, style }) {
  let CustomTag = `h5` as keyof JSX.IntrinsicElements;

  if (style){
    CustomTag = `h${style}` as keyof JSX.IntrinsicElements;
  }



  return (
    <div>
      <CustomTag>
        <Link to={url}>{title}</Link>
      </CustomTag>
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
      title: 'Demo 1 - Cache Decache',
      url: '/cacheDecache',
      text:
        'Demonstration of combined cache and image loader',
        style: "3"
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
    {
      title: 'Nine Stack Viewports',
      url: '/manyStackViewports',
      text: 'Example for displaying 9 stack viewports at once',
    },
    {
      title: 'EnableElement/disableElement API',
      url: '/enableDisableAPI',
      text:
        'Example for displaying stack and volume viewport using enableElement and disableElement API',
    },
    {
      title: 'Set Volumes',
      url: '/setVolumes',
      text:
        'Example for changing the volume while keeping the layout, synchronizers etc'
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

  const enableDisableViewport = () =>
    Example({
      children: <EnableDisableViewportExample />,
    })

  const manyStackViewport = () =>
    Example({
      children: <NineStackViewportExample />,
    })

  const setVolumes = () =>
    Example({
      children: <VTKSetVolumesExample />,
    })

  const cacheDecache = () =>
    Example({
      children: <CacheDecacheExample />,
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
        <Route exact path="/enableDisableAPI/" render={enableDisableViewport} />
        <Route exact path="/manyStackViewports/" render={manyStackViewport} />
        <Route exact path="/setVolumes/" render={setVolumes} />
        <Route exact path="/cacheDecache/" render={cacheDecache} />
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
