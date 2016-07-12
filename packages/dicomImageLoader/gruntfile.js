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
            build: {
                src : ['src/header.js', 'src/wadouri/loadImage.js', 'src/**/*.js'],
                dest: 'build/built.js'
            },
            dist: {
                options: {
                    stripBanners: true,
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                        '<%= grunt.template.today("yyyy-mm-dd") %> ' +
                        '| (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneWADOImageLoader */\n'
                },
                src : ['build/built.js'],
                dest: 'dist/cornerstoneWADOImageLoader.js'
            }
        },
        uglify: {
            dist: {
                files: {
                    'dist/cornerstoneWADOImageLoader.min.js': ['dist/cornerstoneWADOImageLoader.js']
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
            scripts: {
                files: ['src/**/*.js', 'test/*.js'],
                tasks: ['buildAll', 'qunit']
            }
        }
    });

    require('load-grunt-tasks')(grunt);

    grunt.registerTask('buildAll', ['clean', 'concat:build', 'concat:dist', 'uglify', 'jshint']);
    grunt.registerTask('default', ['buildAll']);
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