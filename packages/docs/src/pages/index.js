import React from 'react'
import clsx from 'clsx'
import Layout from '@theme/Layout'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import styles from './index.module.css'
import { useColorMode } from '@docusaurus/theme-common'
import HomepageFeatures from '../components/HomepageFeatures'

function HomepageHeader() {
  return (
    <div className={styles.cs3DBanner}>
      <img
        className={styles.cs3DLogo}
        src={'img/cs3DLogo.png'}
        alt="Cornerstone JS 3D Logo"
      />
      <div>
        <span className={styles.cornerstoneText}>Cornerstone</span>
        <span className={styles.threeDText}>3D</span>
      </div>
      <div className={styles.textDescription}>
        A Medical Imageing Lorem ipsum dolor, sit amet consectetur adipisicing
        elit. Quod magni nemo,
      </div>
      <button className={styles.learnMore}>Learn More</button>
    </div>
  )
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <HomepageHeader />
      <main style={{ marginTop: '50px', marginBottom: '50px' }}>
        <HomepageFeatures />
      </main>
    </Layout>
  )
}
