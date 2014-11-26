angular.module('ng-atp')
.directive('ngAtp', ['$parse', function($parse) {
    return {
      restrict: 'AE',
      compile : ATP$Directive$compileATP,
      scope : true,
      controller: 'ATPMainCtrl'
    };
    function ATP$Directive$compileATP(tElement, attrs) {
      return function(scope, element, attrs) {
      };
    }
  
  }])
.directive('ngAtpInput', 
  ['$compile', '$parse', '$document', '$timeout', 'ATPhelpers', 'ATPEvents',
  function($compile, $parse, $document, $timeout, helpers, events) {
    return {
      restrict : 'A',
      require: '^ngAtp',
      terminal : true,
      compile : ATP$Directive$compileATPInput,
      scope: false
    };
  
    function ATP$Directive$compileATPInput(tElement, attrs) {
      var require_recompile = !attrs.ngModel;
      require_recompile && tElement.attr('ng-model','ATP.query');
      return function(scope, inputElement, attrs) {
        if(require_recompile) {
          $compile(inputElement)(scope);
          return;
        }
        var hint = bulidHint(inputElement);
        hint.attr('ng-show', 'ATP.showSuggestions');
        inputElement.parent()[0].insertBefore(hint[0], inputElement[0]);
        $compile(hint)(scope);
        inputElement.bind('keydown', function(event) {
          hint.val('');
          if(event.keyCode==40) {  // down
            if(scope.ATP.suggestions.length > 0) event.preventDefault();
            scope.$apply(function() {
              scope.ATP.select(scope.ATP.selected + 1);
            });
          } else if (event.keyCode == 38) { // up
            if(scope.ATP.suggestions.length > 0) event.preventDefault();
            scope.$apply(function() {
              scope.ATP.select(scope.ATP.selected - 1);
            });
          } else if (event.keyCode == 13) { // enter
            event.preventDefault();
            scope.$apply(function() {
              if ( scope.ATP.tryComplete() ) {
                scope.$emit(events.COMPLETE, {
                  value : scope.ATP.importValue(), 
                  triggeredBy : events.triggers.enter,
                  model : scope.ATP.modelExpression
                });  
              }
            });
          } else if (event.keyCode == 39) { // right arrow
            if(!scope.ATP.completeOn.rightArrow) return;
            if (getCaretPosition(inputElement[0]) < inputElement.val().length) return;
            event.preventDefault(); 
            // tab autocompletes 
            var suggested = scope.ATP.getSuggested(true);  
            scope.$apply(function() {
              scope.ATP.showSuggestions = !scope.ATP.tryComplete();
              // autocomplete is successful
              if ( !scope.ATP.showSuggestions ) {
                scope.$emit(events.COMPLETE, {
                  value : scope.ATP.importValue(), 
                  triggeredBy : events.triggers.rightArrow,
                  model : scope.ATP.modelExpression
                });  
              }
            });
          } else if (event.keyCode == 9) { // tab
            if(!scope.ATP.completeOn.tab) return;
            if(scope.ATP.selected > -1) {
              scope.$apply(function() {
                scope.ATP.showSuggestions = !scope.ATP.tryComplete();
                // autocomplete is successful 
                if ( !scope.ATP.showSuggestions ) {
                  scope.$emit(events.COMPLETE, {
                    value : scope.ATP.importValue(), 
                    triggeredBy : events.triggers.tab,
                    model : scope.ATP.modelExpression
                  });  
                }
              });
            } else {
              scope.$apply(function() {
                scope.ATP.showSuggestions = false;
              })
            }
          } 
        });
        inputElement.bind('keyup', function(event){
          var suggested = scope.ATP.getSuggested(true);
          var val = scope.ATP.format(suggested);
          if(scope.ATP.showSuggestions && helpers.startWith(val, inputElement.val())) {
            hint.val(val);
          }
        });
        inputElement.bind('click', function(event){ event.stopPropagation(); });
        inputElement.bind('blur', function(event) {
          $timeout(function() {
            scope.ATP.showSuggested = false;
          }, 25);
        });
        $document.bind('click', function(event) {
          scope.$apply(function(){ scope.ATP.showSuggestions = false; });
        });
      };
    }

    // DOM Related functions
    function getCaretPosition (oField) {
      var iCaretPos = 0;
      // IE Support
      if (document.selection) {

        // Set focus on the element
        oField.focus ();

        // To get cursor position, get empty selection range
        var oSel = document.selection.createRange ();

        // Move selection start to 0 position
        oSel.moveStart ('character', -oField.value.length);

        // The caret position is selection length
        iCaretPos = oSel.text.length;
      }

      // Firefox support
      else if (oField.selectionStart || oField.selectionStart == '0')
        iCaretPos = oField.selectionStart;
      return (iCaretPos);
    }
    // jQuery|jqLite -> jQuery | jqLite
    function bulidHint(input) {
      return angular.element('<input class="tt-hint" type="text" autocomplete="false" spellcheck="false" disabled>')
        .css({
          padding: input.css('padding'),
          fontFamily: input.css('font-family'),
          fontSize: input.css('font-size'),
          fontStyle: input.css('font-style'),
          fontVariant: input.css('font-variant'),
          fontWeight: input.css('font-weight'),
          wordSpacing: input.css('word-spacing'),
          letterSpacing: input.css('letter-spacing'),
          textIndent: input.css('text-indent'),
          textRendering: input.css('text-rendering'),
          textTransform: input.css('text-transform'),
          color: 'gray',
          width : input.css('width')
        });
    }

  }])
.directive('ngAtpSuggestions', ['$parse', '$compile', function($parse, $compile) { 
    var template = ['<li ', 
                  'ng-repeat="suggestion in ATP.suggestions track by (ATP._idAttrib ? suggestion[ATP._idAttrib] : $id(suggestion))"',
                  'ng-click="onClickSuggestion($index); $event.stopPropagation(); $event.preventDefault()" ', 
                  'ng-class="{ selected : $index == ATP.selected }" ',
                  'ng-mouseover="ATP.select($index)">', 
                  '<ng-switch on="$templateUrl">',
                  '  <span ng-switch-when="false">{{ ATP.format(suggestion) }}</span>',
                  '  <ng-switch-default><ng-include src="$templateUrl"></ng-include></ng-switch-default>',
                  '</ng-switch>',
                  '</li>'].join('');
    return {
      require  : '^ngAtp',
      restrict : 'AE',
      scope : false,
      compile  : function(element, attrs) {
        var require_recompile = !attrs.ngShow;
        element.attr('ng-show', 'ATP.showSuggestions');
        return {
          pre: function(scope, element, attrs){ 
              if(require_recompile) {
                element[0].innerHTML = template;
                $compile(element)(scope);
                return;
              }
              scope.$templateUrl = attrs.templateUrl ? $parse(attrs.templateUrl)(scope) : false; 
          },
          post: angular.noop
        };
      }
    }; 
  }]);

