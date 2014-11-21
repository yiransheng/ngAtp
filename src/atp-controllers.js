angular.module('ng-atp')
  .controller('ATPMainCtrl', ['$scope', '$element', '$parse', 'ATPStates', 'ATPhelpers', 'ATPEvents', ATPMainCtrl]);

function ATPMainCtrl($scope, $element, $parse, ATPStates, helpers, events) {
  var model = $element.attr('ng-atp');
  var config = $element.attr('ng-atp-config') || '';
  var _getter = $parse(model);
  var _setter = _getter.assign;
  var _getter_config = $parse(config);
  var parent = $scope.$parent;
  var init_val = _getter(parent);
  var options = _getter_config(parent);
      options = Object.create(options);
      options.initialvalue = init_val;
  $scope.ATP = ATPStates.$new(options);
  $scope.ATP.modelExpression = model;
  $scope.ATP.importValue = function() {
     return _getter(parent);
  };
  $scope.ATP.exportValue = function(value) {
    if(_.isEqual( value, _getter(parent) )) return false;
    _setter(parent, value);
    return true;
  };
  $scope.$watch('ATP.query', function(q) {
    if(helpers.isEmpty(q)) {
      $scope.ATP.clear();
      $scope.ATP.exportValue(null);
      return;
    }
    if(!$scope.ATP.isComplete()) {
      $scope.ATP.search();
    } 
  });
  $scope.$watch('ATP.suggestions', function(suggestions) {
    var manualComplete = $scope.ATP.tryCompleteExact();
    $scope.ATP.showSuggestions = suggestions.length ? !manualComplete : false;
    if (manualComplete) {
      $scope.$emit(events.COMPLETE, {
        value : $scope.ATP.importValue(), 
        triggeredBy : events.triggers.manual,
        model : $scope.ATP.modelExpression
      });  
    }
  });
  parent.$watch(function() {
    return _getter(parent);
  }, function(val) {
    var dupDetector = $scope.ATP.engine.dupDetector;
    if(!dupDetector(val, $scope.ATP.value)) {
      $scope.ATP.value = val;
      $scope.ATP.query = $scope.ATP.format(val);
      $scope.ATP.showSuggestions = false;
    }
  }, true);
}

