import typedocSidebarDicomImageLoader from './docs/api/typedoc-sidebar-dicom-image-loader.cjs';
import typedocSidebarCore from './docs/api/typedoc-sidebar-core.cjs';
import typedocSidebarTools from './docs/api/typedoc-sidebar-tools.cjs';
import typedocSidebarNiftiVolumeLoader from './docs/api/typedoc-sidebar-nifti-volume-loader.cjs';
import typedocSidebarAdapters from './docs/api/typedoc-sidebar-adapters.cjs';

module.exports = {
  typedocSidebar2: [
    {
      type: 'category',
      label: 'Core API',
      link: {
        type: 'doc',
        id: 'api/core/index',
      },
      items: typedocSidebarCore,
    },
  ],
  typedocSidebar22: [
    {
      type: 'category',
      label: 'Tools API',
      link: {
        type: 'doc',
        id: 'api/tools/index',
      },
      items: typedocSidebarTools,
    },
  ],
  typedocSidebar: [
    {
      type: 'category',
      label: 'DICOM Image Loader API',
      link: {
        type: 'doc',
        id: 'api/dicomImageLoader/index',
      },
      items: typedocSidebarDicomImageLoader,
    },
  ],

  typedocSidebar3: [
    {
      type: 'category',
      label: 'NIFTI Volume Loader API',
      link: {
        type: 'doc',
        id: 'api/nifti-volume-loader/index',
      },
      items: typedocSidebarNiftiVolumeLoader,
    },
  ],
  typedocSidebar4: [
    {
      type: 'category',
      label: 'Adapters API',
      link: {
        type: 'doc',
        id: 'api/adapters/index',
      },
      items: typedocSidebarAdapters,
    },
  ],
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
        'getting-started/vue-angular-react-etc',
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
        'tutorials/basic-video',
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
            'concepts/cornerstone-core/voxelManager',
            'concepts/cornerstone-core/volumeLoader',
            'concepts/cornerstone-core/geometryLoader',
            'concepts/cornerstone-core/cache',
            'concepts/cornerstone-core/viewports',
            'concepts/cornerstone-core/renderingEngine',
            'concepts/cornerstone-core/requestPoolManager',
            'concepts/cornerstone-core/webWorker',
          ],
        },
        {
          type: 'category',
          label: 'Progressive Loading',
          collapsed: true,
          link: { type: 'doc', id: 'concepts/progressive-loading/index' },
          items: [
            {
              type: 'category',
              label: 'Server Requirements',
              collapsed: true,
              link: {
                type: 'doc',
                id: 'concepts/progressive-loading/requirements',
              },
              items: ['concepts/progressive-loading/encoding'],
            },
            {
              type: 'category',
              label: 'Retrieve Configuration',
              collapsed: true,
              link: {
                type: 'doc',
                id: 'concepts/progressive-loading/retrieve-configuration',
              },
              items: ['concepts/progressive-loading/advance-retrieve-config'],
            },
            'concepts/progressive-loading/usage',
            {
              type: 'category',
              label: 'Examples',
              collapsed: true,
              link: {
                type: 'doc',
                id: 'concepts/progressive-loading/stackProgressive',
              },
              items: [
                'concepts/progressive-loading/stackProgressive',
                'concepts/progressive-loading/volumeProgressive',
              ],
            },
            // 'concepts/progressive-loading/static-wado',
            'concepts/progressive-loading/non-htj2k-progressive',
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
                'concepts/cornerstone-tools/annotation/annotationManager',
                'concepts/cornerstone-tools/annotation/selection',
                'concepts/cornerstone-tools/annotation/locking',
                'concepts/cornerstone-tools/annotation/config',
                'concepts/cornerstone-tools/annotation/annotationGroups',
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
        'contribute/playwright-tests',
        'contribute/karma-tests',
        'contribute/linking',
      ],
    },
    {
      type: 'category',
      label: 'Migration Guides',
      link: {
        type: 'generated-index',
        title: 'Migration Guides',
        description:
          'Guides to help you migrate to the latest version of cornerstone3D',
      },
      collapsed: true,
      items: [
        {
          type: 'category',
          label: '1.x -> 2.x',
          collapsed: false,
          link: {
            type: 'doc',
            id: 'migration-guides/2x/general',
          },
          items: [{ type: 'autogenerated', dirName: 'migration-guides/2x' }],
        },
        'migration-guides/legacy-to-3d',
      ],
    },
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
