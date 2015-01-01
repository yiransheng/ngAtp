angular.module('ng-atp')
  .factory('ATPStates', ['Bloodhound', ATPStates])
  .factory('ATPhelpers', function () {
    return {
      isEmpty: ATP$isEmpty,
      startWith: ATP$startWith
    };
  })
  .constant('ATPEvents', {
    COMPLETE: 'ngAtp:autocomplete',
    triggers: {
      enter: 'ENTER',
      manual: 'MANUAL',
      click: 'CLICK',
      tab: 'TAB',
      rightArrow: 'RIGHT_ARROW'
    }
  });

/* -- divider -- */

function ATPStates(Bloodhound) {
  return {
    initialized: false,
    $new: function (options) {
      var atp = Object.create(this);
      atp.selected = -1;
      atp.query = "";
      atp.suggestions = [];
      atp._idAttrib = options.idAttribute;
      atp.completeOn = options.completeOn || {
        tab: true,
        rightArrow: true
      };
      angular.isFunction(options.verify) && (atp.verify = options.verify);
      angular.isFunction(options.format) && (atp.format = options.format);
      atp.engine = new Bloodhound({
        datumTokenizer: options.datumTokenizer || function (d) {
          return Bloodhound.tokenizers.whitespace(atp.format(d));
        },
        queryTokenizer: options.queryTokenizer || Bloodhound.tokenizers.whitespace,
        prefetch: options.prefetch,
        remote: options.remote,
        local: options.local,
        limit: options.limit,
        dupDetector: options.dupDetector || (atp._idAttrib ? function (a, b) {
          return a === b || (a && b && a[atp._idAttrib] === b[atp._idAttrib]);
        } : angular.equals),
        sorter: options.sorter
      });
      atp.engine.initialize();
      if (atp.verify(options.initialvalue)) {
        var _cloned_value = angular.extend({}, options.initialvalue);
        atp.value = options.initialvalue;
        atp.engine.add([_cloned_value]);
        atp.query = atp.format(_cloned_value);
      } else {
        atp.value = null;
      }
      atp.initialized = true;
      atp.showSuggestions = false;
      return atp;
    },
    verify: function (d) {
      return d !== null;
    },
    format: function (d) {
      return d ? d.value : '';
    },
    clear: function () {
      this.selected = -1;
      this.suggestions.length = 0;
      this.showSuggestions = false;
    },
    getByIndex: function (i) {
      if (i < 0 || i >= this.suggestions.length) return null;
      return this.suggestions[i];
    },
    select: function (index) {
      index = +index;
      var n = this.suggestions.length;
      if (n === 0) return (this.selected = -1);
      if (this.selected === 0 && index < 0) return 0;
      if (this.selected === n - 1 && index >= n) return n - 1;
      return (this.selected = index);
    },
    search: function (str) {
      if (angular.isDefined(str)) {
        this.query = str;
      } else {
        str = this.query;
      }
      if (ATP$isEmpty(str)) {
        this.clear();
        return;
      }
      this.value = null;
      this.exportValue(null);
      this.engine.get(str, function (results) {
        if (ATP$isEmpty(this.query)) {
          this.showSuggestions = false;
        } else {
          this.showSuggestions = true;
        }
        if (!this.isComplete()) {
          var suggestions = results.concat(this.suggestions);
          var attr = this._idAttrib;
          if (attr) {
            this.suggestions = ATP$unique(suggestions, function (s) {
              return s[attr];
            });
          } else {
            this.suggestions = ATP$unique(suggestions, function (s) {
              return this.format(s);
            }.bind(this));
          }
        }
      }.bind(this));
    },
    // get the best match from current suggestions list, 
    // if matching_start is set to true, then returned 
    // suggestion has to start with the query string
    // returns null if no match found
    getSuggested: function (matching_start) {
      if (this.suggestions.length === 0) return null;
      if (this.suggestions.length === 1) {
        if (!matching_start) {
          return this.suggestions[0];
        } else {
          var suggested = this.format(this.suggestions[0]);
          return ATP$startWith(suggested, this.query) ? this.suggestions[0] : null;
        }
      }
      // if none is selected find and select the first item
      // starts with the query (if matching_start flag is used)
      // however, when there is a selected item, ignore matching start requirement
      if (this.selected === -1) {
        if (!matching_start) {
          return this.suggestions[0];
        } else {
          return this.suggestions.find(function (d, index) {
            var suggested = this.format(d);
            if (ATP$startWith(suggested, this.query)) {
              this.select(index);
              return true;
            }
            return false;
          }, this) || null;
        }
      } else {
        return this.getByIndex(this.selected);
      }
    },
    exportValue: angular.noop,
    tryComplete: function (i) {
      if (this.isComplete()) return true;
      var suggested = !angular.isDefined(i) ? this.getSuggested() : this.suggestions[i];
      var out;
      if (this.verify(suggested)) {
        this.value = suggested;
        this.query = this.format(suggested);
        out = angular.extend({}, this.value);
        this.exportValue(out);
        this.clear();
        return true;
      } else {
        this.exportValue(null);
        return false;
      }
    },
    tryCompleteExact: function () {
      var suggested = this.suggestions.findIndex(function (s, index) {
        return this.format(s).toLowerCase() === this.query.toLowerCase();
      }, this);
      if (suggested > -1) {
        return this.tryComplete(suggested);
      } else {
        return false;
      }
    },
    isComplete: function () {
      return this.format(this.value) === this.query && this.verify(this.value);
    }
  };
}

function ATP$isEmpty(value) {
  return angular.isUndefined(value) || value === '' || value === null || value !== value;
}

function ATP$startWith(str, x) {
  return (str.length && x.length && str.slice(0, x.length) === x);
}

function ATP$unique(array, transform) {
  var b = [],
    temp = {};
  angular.forEach(array, function (value) {
    var t = transform(value);

    if (!temp[t]) {
      b.push(value);
      temp[t] = true;
    }
  });
  return b;
}