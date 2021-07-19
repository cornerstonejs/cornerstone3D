import React, { useCallback, useEffect, useRef } from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {Redirect} from '@docusaurus/router';


function Coverage() {
  const iframeRef = useRef(null);
  const coveragePath = "/static-coverage/"

  /*awdawdaconst handleLoad = useCallback(() => {
    const frame = iframeRef.current;
    if (frame) {
      const baseTag = frame.contentDocument.createElement("base");
      baseTag.setAttribute("href", coveragePath);
      const head = frame.contentDocument.getElementsByTagName("head")[0];
      console.warn(head)
      head.appendChild(baseTag);
    }
  }, [iframeRef])*/
  //onLoad={handleLoad}

  const url = useBaseUrl(`${coveragePath}`)
  return (
    /*<Layout title="Coverage">
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '90vh',
          fontSize: '20px',
          backgroundColor: 'white'
        }}>
        <iframe
          width="100%"
          height="100%"
          src={url}
          ref={iframeRef}

        />
      </div>
    </Layout>*/
    <Redirect to={url} />
  );
}

export default Coverage;
