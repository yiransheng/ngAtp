module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
			options: {
        process: function(src, filepath) {
					return '/* * * \n * ' + filepath + '\n' + ' * * */\n' + src;
				}
			},
			dist: {
				src: [
		      'src/ngBloodhound.js',
		      'src/ngAtp.js',
	        'src/ng-atp/*.js'
        ],
				dest: 'dist/js/<%= pkg.name %>-bundle.js',
			},
		},
		uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n'
      },
      dist: {
        files: {
          'dist/js/<%= pkg.name %>-bundle.min.js': ['<%= concat.dist.dest %>']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.registerTask('default', ['concat', 'uglify']);
}

