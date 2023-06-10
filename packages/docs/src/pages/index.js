import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
import HomepageFeatures from '../components/HomepageFeatures';

function NewAnnouncementBar() {
  return (
    <div className={styles.announcementBar}>
      <div className={styles.newPart}>NEW</div>
      <div className={styles.smallScreenAnnouncement}>
        {/* Cornerstone 3D is now available! */}
        Major Release: Cornerstone3D 1.0 is now available!
      </div>
      <div className={styles.bigScreenAnnouncement}>
        🎉 Major Release: Cornerstone3D 1.0 is now available! 🎉
        {/* <span style={{ fontWeight: 600 }}>Cornerstone3D</span>, released as
        public beta on April 1st, 2022, represents a major improvement to the
        framework */}
      </div>
    </div>
  );
}

function HomepageHeader() {
  return (
    <div className={styles.cs3DBanner}>
      <NewAnnouncementBar />
      <img
        className={styles.cs3DLogo}
        src={'img/cornerstone-logo-badge.png'}
        alt="Cornerstone.js 3D Logo"
      />
      <div>
        <span className={styles.cornerstoneText}>Cornerstone</span>
        <span className={styles.threeDText}>3D</span>
      </div>
      <img
        className={styles.dotBackground}
        src={'img/dot-bg.png'}
        alt="Spacing dots"
      />
      <div className={styles.textDescription}>
        The easiest way to build interactive medical imaging web applications.
        Supported by the{' '}
        <Link to="https://ohif.org/" style={{ color: '#5ACCE6' }}>
          Open Health Imaging Foundation
        </Link>
      </div>
      <Link to="docs/getting-started/overview">
        <button className={styles.learnMore}>Learn More</button>
      </Link>
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Cornerstone.js - JavaScript library for building web-based medical imaging applications <head />"
    >
      <HomepageHeader />
      <main style={{ marginTop: '50px', marginBottom: '50px' }}>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
