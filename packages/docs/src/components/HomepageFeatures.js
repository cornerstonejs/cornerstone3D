import React from 'react'
import clsx from 'clsx'
import styles from './HomepageFeatures.module.css'
import { useColorMode } from '@docusaurus/theme-common'

const FeatureList = [
  {
    title: 'Standards Compliant',
    description: (
      <>
        Robust DICOM Parsing. Supports all transfer syntaxes. Supports WADO-URI
        and WADO-RS
      </>
    ),
  },
  {
    title: 'Fast',
    description: (
      <>
        High performance image display. Multi-threaded image decoding in Web
        Workers
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
]

function Feature({ Svg, title, description }) {
  const { isDarkTheme } = useColorMode()

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
