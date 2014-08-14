(function(angular, _) {

	angular.module('ngAtp')
		.controller('ATPMainCtrl', ['$scope', '$element', '$parse', 'ATPStates', 'ATPhelpers', ATPMainCtrl]);

	function ATPMainCtrl($scope, $element, $parse, ATPStates, helpers) {
		var model = $element.attr('ng-atp');
		var config = $element.attr('ng-atp-config') || '';
		var _getter = $parse(model);
		var _setter = _getter.assign;
		var _getter_config = $parse(config);
		var parent = $scope.$parent;
		var init_val = _getter(model);
		var options = _getter_config(parent);
				options = Object.create(options);
				options.initialvalue = init_val;
		$scope.ATP = ATPStates.$new(options); 	
		$scope.ATP.exportValue = function(value) {
			if(_.isEqual( value, _getter(parent) )) return false;
			_setter(parent, value);
			return true;
		};
		$scope.$watch('ATP.query', function(q) {
			if(!$scope.ATP.isComplete()) $scope.ATP.search();
		});
		$scope.$watch('ATP.suggestions', function(suggestions) {
			$scope.ATP.showSuggestions = !$scope.ATP.tryCompleteExact();
		});
		parent.$watch(function() {
			return _getter(parent);
		}, function(val) {
			if(!_.isEqual(val, $scope.ATP.value)) {
				$scope.ATP.value = val;
				$scope.ATP.query = $scope.ATP.format(val);
				$scope.ATP.showSuggestions = false;
			}
		}, true);
	}

})(window.angular, window._);
