import React from 'react';
import clsx from 'clsx';
import styles from './HomepageFeatures.module.css';
import { useColorMode } from '@docusaurus/theme-common';

const FeatureList = [
  {
    title: 'Standards Compliant',
    description: (
      <>
        Robust DICOM Parsing. Supports DICOMweb and all transfer syntaxes out-of-the-box.
      </>
    ),
  },
  {
    title: 'Fast',
    description: (
      <>
        High performance GPU-accelerated image display. Multi-threaded image decoding. Progressive data streaming.
      </>
    ),
  },
  {
    title: 'Extensible',
    description: (
      <>
        Designed to be modular. Create your own tools and image loaders easily.
      </>
    ),
  },
];

function Feature({ Svg, title, description }) {
  return (
    <div className={clsx('col col--4')}>
      {/* <div className="text--center">
        <Svg className={styles.featureSvg} alt={title} />
      </div> */}
      <div className="text--center padding-horiz--md">
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.paragraph}>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
