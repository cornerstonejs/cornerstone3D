//import useBaseUrl from '@docusaurus/useBaseUrl';

module.exports = {
  docs: [
    {
      type: 'category',
      label: 'Introduction',
      link: {
        type: 'generated-index',
        title: 'Introduction',
        description: 'An Introduction to cornerstone3D',
      },
      items: [
        'introduction/overview',
        'introduction/scope',
        'introduction/related-libraries',
      ],
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'Getting Started',
        description:
          'In this section you will find the basics of using cornerstone3D',
      },
      items: ['getting-started/installation', 'getting-started/live-examples'],
    },
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'Tutorials',
        description: 'In this section you will find a collection of tutorials',
      },
      items: ['tutorials/core-usage', 'tutorials/tools-usage'],
    },
    {
      type: 'category',
      label: 'How-to Guides',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'How-to Guides',
        description:
          'In this section you will find how-to guides for cornerstone3D',
      },
      items: [
        'how-to-guides/configuration',
        'how-to-guides/custom-image-loader',
        'how-to-guides/custom-metadata-provider',
        'how-to-guides/custom-tools',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'Concepts',
        description:
          'In this section we explain technical concepts that are used in cornerstone3D',
      },
      items: [
        {
          type: 'category',
          label: 'Core',
          link: { type: 'doc', id: 'concepts/cornerstone-core/index' },
          collapsed: true,
          items: [
            'concepts/cornerstone-core/imageId',
            'concepts/cornerstone-core/imageLoader',
            'concepts/cornerstone-core/images',
            'concepts/cornerstone-core/metadataProvider',
            'concepts/cornerstone-core/volumes',
            'concepts/cornerstone-core/volumeLoader',
            'concepts/cornerstone-core/cache',
            'concepts/cornerstone-core/viewports',
            'concepts/cornerstone-core/renderingEngine',
            'concepts/cornerstone-core/requestPoolManager',
          ],
        },
        {
          type: 'category',
          label: 'Streaming Image Volume Loader',
          collapsed: true,
          link: { type: 'doc', id: 'concepts/streaming-image-volume/index' },
          items: ['concepts/streaming-image-volume/streaming'],
        },
        {
          type: 'category',
          label: 'Tools',
          collapsed: true,
          link: { type: 'doc', id: 'concepts/cornerstone-tools/index' },
          items: [
            'concepts/cornerstone-tools/tools',
            'concepts/cornerstone-tools/synchronizers',
            'concepts/cornerstone-tools/state-management',
            'concepts/cornerstone-tools/tools-eventListeners',
            'concepts/cornerstone-tools/toolsStyle',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      link: {
        type: 'generated-index',
        title: 'Contributing',
        description: 'How to contribute to cornerstone3D',
      },
      collapsed: true,
      items: ['contribute/pull-request', 'contribute/tests'],
    },
    'migrationGuides',
    {
      type: 'link',
      label: 'Test Coverage Report',
      href: '/coverage',
    },
    'faq',
  ],
}
