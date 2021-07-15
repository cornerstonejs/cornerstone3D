import React from 'react'
import clsx from 'clsx'
import styles from './HomepageFeatures.module.css'

const FeatureList = [
  {
    title: 'Standards Compliant',
    Svg: require('../../static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Robust DICOM Parsing. Supports all transfer syntaxes. Supports WADO-URI
        and WADO-RS
      </>
    ),
  },
  {
    title: 'Fast',
    Svg: require('../../static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        High performance image display. Multi-threaded image decoding in Web
        Workers
      </>
    ),
  },
  {
    title: 'Extensible',
    Svg: require('../../static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Designed to be modular. Create your own tools and image loaders easily.
      </>
    ),
  },
]

function Feature({ Svg, title, description }) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} alt={title} />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
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
  )
}
