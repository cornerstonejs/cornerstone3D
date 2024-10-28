const path = require('path');
const lightCodeTheme = require('prism-react-renderer').themes.github;
const darkCodeTheme = require('prism-react-renderer').themes.dracula;

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  future: {
    experimental_faster: true,
  },
  title: 'Cornerstone.js',
  tagline: 'Medical Imaging, Simplified',
  url: 'https://cornerstonejs.org',
  baseUrl: '/',
  onBrokenLinks: 'log',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'cornerstoneJS', // Usually your GitHub org/user name.
  projectName: 'cornerstone3D', // Usually your repo name.
  themeConfig: {
    algolia: {
      appId: 'OWBKNRE2E5',
      apiKey: 'e15ff95ce3ebe52c0995b8222b808a18',
      indexName: 'cornerstonejs',
      contextualSearch: true,
    },
    navbar: {
      logo: {
        alt: 'Cornerstone.js',
        src: 'img/cornerstone-light.png',
        srcDark: 'img/cornerstone-dark.png',
      },
      items: [
        {
          to: 'docs/getting-started/overview',
          position: 'left',
          activeBaseRegex: 'docs/(?!(example|faq|help))',
          label: 'Docs',
        },
        {
          to: 'docs/examples',
          position: 'left',
          label: 'Examples',
        },
        {
          href: 'https://ohif.org/community/',
          position: 'left',
          label: 'Community',
        },
        {
          type: 'dropdown',
          label: 'API',
          position: 'left',
          items: [
            {
              label: 'Core',
              to: '/docs/api/core',
            },
            {
              label: 'Tools',
              to: '/docs/api/tools',
            },
            {
              label: 'DICOM Image Loader',
              to: '/docs/api/dicomImageLoader',
            },
            {
              label: 'NIFTI Volume Loader',
              to: '/docs/api/nifti-volume-loader',
            },
            {
              label: 'Adapters',
              to: '/docs/api/adapters',
            },
          ],
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownActiveClassDisabled: true,
        },
        {
          to: 'docs/help',
          label: 'Help',
          position: 'right',
        },
        {
          label: 'FAQ',
          to: 'docs/faq',
          position: 'right',
        },
        {
          href: 'https://github.com/cornerstonejs/cornerstone3D/',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub Repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          items: [
            {
              html: `
               <div id="logo-wrapper-footer">
                <a href="https://www.cornerstonejs.org/" target="_blank">
                  <img
                    src="/img/cornerstone-dark-footer.png"
                    id="cs-logo-footer"
                    alt="cornerstone"
                  />
                </a>
                <a href="https://ohif.org/" target="_blank">
                  <img src="/img/ohif-logo-dark.svg" id="ohif-logo-footer" alt="ohif" />
                </a>
              </div>

              `,
            },
          ],
        },
        {
          title: 'Learn',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/overview',
            },
            {
              label: 'Tutorials',
              to: '/docs/category/tutorials',
            },
            {
              label: 'How-to Guides',
              to: '/docs/category/how-to-guides',
            },
            {
              label: 'Concepts',
              to: '/docs/category/concepts',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discussion board',
              href: 'https://community.ohif.org/',
            },
            {
              label: 'Help',
              to: '/docs/help',
            },
            {
              label: 'Contributing',
              to: '/docs/category/contributing',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Donate',
              href: 'https://ohif.org/donate/',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/cornerstonejs/cornerstone3D/',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/OHIFviewer',
            },
            {
              label: 'Slack',
              href: 'https://join.slack.com/t/cornerstonejs/shared_invite/zt-2c7g8j7ds-qc~hGNmhdxd02O_~cmZuDw',
            },
          ],
        },
      ],
      copyright: `Cornerstone is open source software released under the MIT license.`,
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
          breadcrumbs: false,
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl:
            'https://github.com/cornerstonejs/cornerstone3D/edit/main/packages/docs/',
          lastVersion: 'current',
          versions: {
            current: {
              label: `${2.0} (Latest)`,
            },
          },
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        blog: false,
        gtag: {
          trackingID: 'G-LWTJVK40WP',
          anonymizeIP: true,
        },
      },
    ],
  ],
  webpack: {
    jsLoader: (isServer) => ({
      // Using esbuild instead of babel-loader is recommended
      // by the docusaurus team to improve build times.
      // They use it themselves: https://github.com/facebook/docusaurus/blob/1efc6c609185c780c03d6205015b998e3ec24c3a/website/docusaurus.config.js#L96-L102
      // See https://github.com/facebook/docusaurus/issues/4765#issuecomment-841135926
      loader: require.resolve('esbuild-loader'),
      options: {
        loader: 'tsx',
        target: isServer ? 'node12' : 'es2017',
      },
    }),
  },
  plugins: [
    require.resolve('./webpackConfigurationPlugin'),
    ...(() => {
      const packages = [
        'core',
        'tools',
        'dicomImageLoader',
        'nifti-volume-loader',
        'adapters',
      ];

      const plugins = [];
      for (const pkg of packages) {
        plugins.push([
          'docusaurus-plugin-typedoc',
          {
            id: `api-${pkg}`,
            out: `./docs/api/${pkg}`,
            entryPoints: [`../${pkg}/src/index.ts`],
            tsconfig: `../${pkg}/tsconfig.json`,
          },
        ]);
      }
      return plugins;
    })(),
  ],
};
