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
          type: 'doc',
          docId: 'cornerstone-render/index',
          position: 'left',
          label: 'API',
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
                <img src='https://i.imgur.com/yE2WibH.png' id="cs-logo" alt="cornerstone" />
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
              to: 'https://google.com/',
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
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-1',
        entryPoints: ['../cornerstone-render/src/index.ts'],
        tsconfig: '../cornerstone-render/tsconfig.json',

        out: 'cornerstone-render',
        readme: 'none',
        includeVersion: true,
        excludePrivate: true,
        excludeProtected: true,
        excludeInternal: true,

        sidebar: {
          sidebarFile: null,
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-2',
        entryPoints: ['../cornerstone-tools/src/index.ts'],
        tsconfig: '../cornerstone-tools/tsconfig.json',

        readme: 'none',
        out: 'cornerstone-tools',
        includeVersion: true,
        excludePrivate: true,
        excludeProtected: true,
        excludeInternal: true,

        sidebar: {
          sidebarFile: null,
        },
      },
    ],
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-3',
        entryPoints: [
          '../cornerstone-image-loader-streaming-volume/src/index.ts',
        ],
        tsconfig: '../cornerstone-image-loader-streaming-volume/tsconfig.json',

        readme: 'none',
        out: 'cornerstone-image-loader-streaming-volume',
        includeVersion: true,
        excludePrivate: true,
        excludeProtected: true,
        excludeInternal: true,

        sidebar: {
          sidebarFile: null,
        },
      },
    ]
  ],
}
