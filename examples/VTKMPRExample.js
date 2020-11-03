import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';

class VTKMPRExample extends Component {
  async componentDidMount() {
    const imageIds = await getImageIdsAndCacheMetadata();
  }

  render() {
    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>MPR Template Example </h1>
            <p>Flesh out description later</p>
          </div>
        </div>
      </div>
    );
  }
}

export default VTKMPRExample;
