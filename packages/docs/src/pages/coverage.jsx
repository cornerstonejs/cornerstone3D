import React, { useRef } from 'react';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';

function Coverage() {
  const iframeRef = useRef(null);
  const coveragePath = "/static-coverage/"

  const url = useBaseUrl(`${coveragePath}`)
  return (
    <Layout title="Test Coverage Report">
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
    </Layout>
  );
}

export default Coverage;
