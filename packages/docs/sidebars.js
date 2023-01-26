//import useBaseUrl from '@docusaurus/useBaseUrl';

module.exports = {
  docs: [
    {
      type: 'category',
      label: 'Getting Started',
      link: {
        type: 'generated-index',
        title: 'Getting Started',
        description:
          'In this section you will find the basics of using Cornerstone',
      },
      items: [
        'getting-started/overview',
        'getting-started/scope',
        'getting-started/related-libraries',
        'getting-started/installation',
      ],
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
      items: [
        'tutorials/intro',
        'tutorials/basic-stack',
        'tutorials/basic-volume',
        'tutorials/basic-manipulation-tool',
        'tutorials/basic-annotation-tool',
        'tutorials/basic-segmentation-tools',
        'tutorials/examples',
      ],
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
        'how-to-guides/custom-image-loader',
        'how-to-guides/custom-metadata-provider',
        'how-to-guides/custom-volume-loading',
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
            'concepts/cornerstone-core/geometryLoader',
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
          items: [
            'concepts/streaming-image-volume/streaming',
            'concepts/streaming-image-volume/re-order',
          ],
        },
        {
          type: 'category',
          label: 'Tools',
          collapsed: true,
          link: { type: 'doc', id: 'concepts/cornerstone-tools/index' },
          items: [
            'concepts/cornerstone-tools/tools',
            'concepts/cornerstone-tools/toolGroups',
            'concepts/cornerstone-tools/synchronizers',
            {
              type: 'category',
              label: 'Annotations',
              collapsed: true,
              link: {
                type: 'doc',
                id: 'concepts/cornerstone-tools/annotation/index',
              },
              items: [
                'concepts/cornerstone-tools/annotation/state',
                'concepts/cornerstone-tools/annotation/selection',
                'concepts/cornerstone-tools/annotation/locking',
                'concepts/cornerstone-tools/annotation/config',
              ],
            },
            {
              type: 'category',
              label: 'Segmentations',
              collapsed: true,
              link: {
                type: 'doc',
                id: 'concepts/cornerstone-tools/segmentation/index',
              },
              items: [
                'concepts/cornerstone-tools/segmentation/state',
                'concepts/cornerstone-tools/segmentation/segmentation-display',
                'concepts/cornerstone-tools/segmentation/active-segmentation',
                'concepts/cornerstone-tools/segmentation/locking',
                'concepts/cornerstone-tools/segmentation/config',
                'concepts/cornerstone-tools/segmentation/segment-index',
                'concepts/cornerstone-tools/segmentation/segmentation-tools',
                'concepts/cornerstone-tools/segmentation/segmentation-contour',
              ],
            },
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
      items: [
        'contribute/pull-request',
        'contribute/update-api',
        'contribute/documentation',
        'contribute/tests',
        'contribute/linking',
      ],
    },
    'migrationGuides',
    'faq',
    'help',
    {
      type: 'link',
      label: 'Test Coverage Report',
      href: 'pathname:///test-coverage',
    },
    'examples',
  ],
};
