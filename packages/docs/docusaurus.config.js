const path = require('path')
const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Cornerstone JS',
  tagline: 'Medical Imaging, Simplified',
  url: 'https://cornerstonejs.org',
  baseUrl: '/',
  onBrokenLinks: 'log',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'CornerstoneJS', // Usually your GitHub org/user name.
  projectName: 'Cornerstone', // Usually your repo name.
  themeConfig: {
    navbar: {
      title: 'Cornerstone JS',
      logo: {
        alt: 'Cornerstone JS',
        src: 'img/logo.svg',
        srcDark: 'img/logo-white.svg',
      },
      items: [
        {
          type: 'doc',
          docId: 'core-introduction',
          position: 'left',
          label: 'Docs',
        },
        {
          to: 'api',
          position: 'left',
          label: 'API Reference',
        },
        {
          type: 'doc',
          docId: 'faq',
          label: 'FAQ',
          position: 'right',
        },
        {
          to: 'https://github.com/PrecisionMetrics/cornerstone-3d-alpha',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub Repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      // logo: {
      //   alt: 'OHIF ',
      //   src: 'img/logo-white.svg',
      //   href: 'https://ohif.org',
      // },
      links: [
        {
          title: 'Medical Imaging Simplified',
          items: [
            {
              html: `
                <img crossorigin src='https://i.imgur.com/yE2WibH.png' id="cs-logo" alt="cornerstone" />
              `,
            },
          ],
        },
        {
          title: 'Learn',
          items: [
            {
              label: 'Introduction',
              to: '/docs/core-introduction',
            },
            {
              label: 'Installation',
              to: '/docs/core-installation',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discussion board',
              to: 'https://community.ohif.org/',
            },
            {
              label: 'Help',
              to: '/docs/help',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Donate',
              to: 'https://ohif.org/donate/',
            },
            {
              label: 'GitHub',
              to: 'https://github.com/cornerstonejs/cornerstone',
            },
          ],
        },
      ],

      copyright: `Cornerstone is a set of open source libraries released under the MIT license.`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl:
            'https://github.com/cornerstonejs/cornerstone-3d-alpha/edit/master/website/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  plugins: [
    'plugin-image-zoom',
    require.resolve('./webpackConfigurationPlugin'),
    // [
    //   'docusaurus-plugin-typedoc-api',
    //   {
    //     projectRoot: path.join(__dirname, '../../'),
    //     packages: [
    //       ...[
    //         'cornerstone-render',
    //         'cornerstone-tools',
    //         'cornerstone-image-loader-streaming-volume',
    //       ].map((pkg) => `packages/${pkg}`),
    //     ],
    //     minimal: false,
    //     readmes: true,
    //     debug: true,
    //     tsconfigName: 'tsconfig.json',
    //   },
    // ],
  ],
}
