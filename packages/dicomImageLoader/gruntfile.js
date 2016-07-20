module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        clean: {
            default: {
                src: [
                    'dist',
                    'build'
                ]
            }
        },
        version: {
          // options: {},
          defaults: {
            src: ['src/version.js', 'bower.json']
          }
        },

        copy : {
            bower: {
                src: [
                    'bower_components/cornerstone/dist/cornerstone.min.css',
                    'bower_components/cornerstone/dist/cornerstone.min.js',
                    'bower_components/dicomParser/dist/dicomParser.min.js',
                    'bower_components/jquery/dist/jquery.min.js',
                    'bower_components/jquery/dist/jquery.min.map',
                    'bower_components/cornerstoneTools/dist/cornerstoneTools.js',
                    'bower_components/cornerstoneMath/dist/cornerstoneMath.js',
                    'bower_components/cornerstoneMath/dist/bootstrap.js',
                  'bower_components/bootstrap/dist/js/bootstrap.min.js',
                  'bower_components/bootstrap/dist/css/bootstrap.min.css'
                ],
                dest: 'examples',
                expand: true,
                flatten: true
            }
        },
        concat: {
            buildImageLoader: {
                src : ['src/imageLoader/header.js', 'src/imageLoader/wadouri/loadImage.js', 'src/imageLoader/**/*.js'],
                dest: 'build/cornerstoneWADOImageLoader.js'
            },
            distImageLoader: {
                options: {
                    stripBanners: true,
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                        '<%= grunt.template.today("yyyy-mm-dd") %> ' +
                        '| (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */\n'
                },
                src : ['build/cornerstoneWADOImageLoader.js'],
                dest: 'dist/cornerstoneWADOImageLoader.js'
            },
            buildCodecs: {
                src : ['codecs/*.js'],
                dest: 'build/cornerstoneWADOImageLoaderCodecs.js'
            },
            distCodecs: {
                options: {
                    stripBanners: true,
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                    '<%= grunt.template.today("yyyy-mm-dd") %> ' +
                    '| (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */\n'
                },
                src : ['build/cornerstoneWADOImageLoaderCodecs.js'],
                dest: 'dist/cornerstoneWADOImageLoaderCodecs.js'
            },
            buildWebWorker: {
                src : ['src/webWorker/main.js', 'src/webWorker/**/*.js'],
                dest: 'build/cornerstoneWADOImageLoaderWebWorker.js'
            },
            distWebWorker: {
                options: {
                    stripBanners: true,
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                    '<%= grunt.template.today("yyyy-mm-dd") %> ' +
                    '| (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */\n'
                },
                src : ['build/cornerstoneWADOImageLoaderWebWorker.js'],
                dest: 'dist/cornerstoneWADOImageLoaderWebWorker.js'
            },

        },
        uglify: {
            dist: {
                files: {
                    'dist/cornerstoneWADOImageLoader.min.js': ['dist/cornerstoneWADOImageLoader.js'],
                    'dist/cornerstoneWADOImageLoaderWebWorker.min.js': ['dist/cornerstoneWADOImageLoaderWebWorker.js'],
                    'dist/cornerstoneWADOImageLoaderCodecs.min.js': ['dist/cornerstoneWADOImageLoaderCodecs.js']

                }
            },
            options: {
                banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                    '<%= grunt.template.today("yyyy-mm-dd") %> ' +
                    '| (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */\n'
            }
        },
        jshint: {
            files: [
                'src/*.js'
            ]
        },
        qunit: {
            all: ['test/*.html']
        },
        watch: {
            imageLoaderScripts: {
                files: ['src/imageLoader/**/*.js', 'test/*.js'],
                tasks: ['buildImageLoader', 'qunit']
            },
            webWorkerScripts: {
                files: ['src/webWorker/**/*.js'],
                tasks: ['buildWebWorker', 'qunit']
            }

        }
    });

    require('load-grunt-tasks')(grunt);

    grunt.registerTask('buildCodecs', ['concat:buildCodecs', 'concat:distCodecs', 'uglify', 'jshint']);
    grunt.registerTask('buildWebWorker', ['concat:buildWebWorker', 'concat:distWebWorker', 'uglify', 'jshint']);
    grunt.registerTask('buildImageLoader', ['concat:buildImageLoader', 'concat:distImageLoader', 'uglify', 'jshint']);
    grunt.registerTask('default', ['clean', 'buildImageLoader', 'buildWebWorker', 'buildCodecs']);
};

// Release process:
//  1) Update version numbers
//     update version in package.json
//     grunt version
//  2) do a build (needed to update dist versions with correct build number)
//  3) commit changes
//      git commit -am "Changes...."
//  4) tag the commit
//      git tag -a 0.1.0 -m "Version 0.1.0"
//  5) push to github
//      git push origin master --tags