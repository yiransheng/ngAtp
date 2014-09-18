module.exports = function(grunt) {
    var banner = [
        '//     <%= pkg.name %> <%= pkg.version %>',
        '//     <%= pkg.homepage %>',
        '//     (c) 2014 <%= pkg.author %>',
        '//     <%= pkg.name %> may be freely distributed under the MIT license.'
    ].join('\n');
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        rig: {
            compile: {
                options: {
                    banner: banner + '\n\n'
                },
                files: {
                    'dist/js/<%= pkg.name %>-bundle.js': [
                        'src/ngAtp.js'
                    ]
                }
            }

        },
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
            },
            dist: {
                files: {
                    'dist/js/<%= pkg.name %>-bundle.min.js': ['dist/js/<%= pkg.name %>-bundle.js']
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-rigger');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.registerTask('build', ['rig', 'uglify']);
    grunt.registerTask('default', ['build'])
}
