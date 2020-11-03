/* eslint-disable react/prop-types */
import React, { Component, useState } from 'react';
import { BrowserRouter as Router, Route, Link, Switch } from 'react-router-dom';
import VTKMPRExample from './VTKMPRExample.js';

function LinkOut({ href, text }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
}

function ExampleEntry({ title, url, text, screenshotUrl }) {
  return (
    <div>
      <h5>
        <Link to={url}>{title}</Link>
      </h5>
      <p>{text}</p>
      <hr />
    </div>
  );
}

function Index() {
  const style = {
    height: '512px',
  };

  const examples = [
    {
      title: 'MPR',
      url: '/mpr',
      text: 'Example MPR playground.',
    },
  ];

  const exampleComponents = examples.map(e => {
    return <ExampleEntry key={e.title} {...e} />;
  });

  return (
    <div className="container">
      <div className="row">
        <h1>VTK React Viewport Component</h1>
      </div>
      <div className="row">
        <div className="col-xs-12 col-lg-6">
          <h4>VTK Viewport</h4>
          <p>
            This is a framework build ontop of{' '}
            <LinkOut
              href={'https://github.com/Kitware/vtk-js'}
              text={'VTK.js'}
            />{' '}
            for easily managing data, displaying images and building tools.
          </p>
        </div>

        <div className="col-xs-12 col-lg-12" style={style}>
          <h3>Examples</h3>
          {exampleComponents}
        </div>
      </div>
    </div>
  );
}

function Example(props) {
  return (
    <div className="container">
      <h5>
        <Link to="/">Back to Examples</Link>
      </h5>
      {props.children}
    </div>
  );
}

function AppRouter() {
  const mpr = () =>
    Example({
      children: <VTKMPRExample />,
    });

  return (
    <Router>
      <Switch>
        <Route exact path="/" component={Index} />
        <Route exact path="/mpr/" render={mpr} />
        <Route exact component={Index} />
      </Switch>
    </Router>
  );
}

export default class App extends Component {
  render() {
    return <AppRouter />;
  }
}
