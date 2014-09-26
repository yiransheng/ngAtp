/**
    ## Contribution

    If you do have a contribution for the package feel free to put up a Pull Request or open an Issue.

    ## License (MIT)

    The MIT License (MIT)

    Copyright (c) 2014 Giulio Canti

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
**/
(function (root, factory) {
  'use strict';
  var _angular = angular || root.angular;
  var lodash = _ || root._; 
  if(!_angular) {
    throw "Missing Angular base. Include ng-atp after Angular."; 
  }
  if(!lodash) {
    throw "Missing dependency: lodash or underscore.";
    // To-do: remove lodash dependency, or ship a customized version
    // needs: _.isEqual, _.clone, _.uniq, _.isFunction, _.isUndefined, _.findIndex
  }
  if (typeof define === 'function' && define.amd) {
    define([], factory(_angular, lodash));
  } else if (typeof exports === 'object') {
    module.exports = factory(_angular, lodash);
  } else {
    factory(_angular, lodash);
  }
}(this, function (angular, _) {
  //= ngBloodhound.js
  var ngAtp = angular.module('ng-atp', ['bloodhound']);
  //= atp-services.js
  //= atp-controllers.js
  //= atp-directives.js

  return ngAtp;
}));