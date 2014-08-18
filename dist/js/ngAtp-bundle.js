/* * * 
 * src/ngBloodhound.js
 * * */
(function(angular, _) {
    var VERSION = "0.10.2";
    (function() {
        "use strict";
        var module = angular.module("bloodhound.tokenizers", []);
        module.factory("tokenizers", function() {
            var tokenizers = function() {
                return {
                    nonword: nonword,
                    whitespace: whitespace,
                    obj: {
                        nonword: getObjTokenizer(nonword),
                        whitespace: getObjTokenizer(whitespace)
                    }
                };
                function whitespace(s) {
                    return s.split(/\s+/);
                }
                function nonword(s) {
                    return s.split(/\W+/);
                }
                function getObjTokenizer(tokenizer) {
                    return function setKey(key) {
                        return function tokenize(o) {
                            return tokenizer(o[key]);
                        };
                    };
                }
            }();
            return tokenizers;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.lru-cache", []);
        module.factory("LruCache", function() {
            var LruCache = function() {
                function LruCache(maxSize) {
                    this.maxSize = maxSize || 100;
                    this.size = 0;
                    this.hash = {};
                    this.list = new List();
                }
                angular.extend(LruCache.prototype, {
                    set: function set(key, val) {
                        var tailItem = this.list.tail, node;
                        if (this.size >= this.maxSize) {
                            this.list.remove(tailItem);
                            delete this.hash[tailItem.key];
                        }
                        if (node = this.hash[key]) {
                            node.val = val;
                            this.list.moveToFront(node);
                        } else {
                            node = new Node(key, val);
                            this.list.add(node);
                            this.hash[key] = node;
                            this.size++;
                        }
                    },
                    get: function get(key) {
                        var node = this.hash[key];
                        if (node) {
                            this.list.moveToFront(node);
                            return node.val;
                        }
                    }
                });
                function List() {
                    this.head = this.tail = null;
                }
                angular.extend(List.prototype, {
                    add: function add(node) {
                        if (this.head) {
                            node.next = this.head;
                            this.head.prev = node;
                        }
                        this.head = node;
                        this.tail = this.tail || node;
                    },
                    remove: function remove(node) {
                        node.prev ? node.prev.next = node.next : this.head = node.next;
                        node.next ? node.next.prev = node.prev : this.tail = node.prev;
                    },
                    moveToFront: function(node) {
                        this.remove(node);
                        this.add(node);
                    }
                });
                function Node(key, val) {
                    this.key = key;
                    this.val = val;
                    this.prev = this.next = null;
                }
                return LruCache;
            }();
            return LruCache;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.persistent-storage", []);
        module.factory("PersistentStorage", function() {
            var PersistentStorage = function() {
                var ls, methods;
                try {
                    ls = window.localStorage;
                    ls.setItem("~~~", "!");
                    ls.removeItem("~~~");
                } catch (err) {
                    ls = null;
                }
                function PersistentStorage(namespace) {
                    this.prefix = [ "__", namespace, "__" ].join("");
                    this.ttlKey = "__ttl__";
                    this.keyMatcher = new RegExp("^" + this.prefix);
                }
                if (ls && window.JSON) {
                    methods = {
                        _prefix: function(key) {
                            return this.prefix + key;
                        },
                        _ttlKey: function(key) {
                            return this._prefix(key) + this.ttlKey;
                        },
                        get: function(key) {
                            if (this.isExpired(key)) {
                                this.remove(key);
                            }
                            return decode(ls.getItem(this._prefix(key)));
                        },
                        set: function(key, val, ttl) {
                            if (angular.isNumber(ttl)) {
                                ls.setItem(this._ttlKey(key), encode(now() + ttl));
                            } else {
                                ls.removeItem(this._ttlKey(key));
                            }
                            return ls.setItem(this._prefix(key), encode(val));
                        },
                        remove: function(key) {
                            ls.removeItem(this._ttlKey(key));
                            ls.removeItem(this._prefix(key));
                            return this;
                        },
                        clear: function() {
                            var i, key, keys = [], len = ls.length;
                            for (i = 0; i < len; i++) {
                                if ((key = ls.key(i)).match(this.keyMatcher)) {
                                    keys.push(key.replace(this.keyMatcher, ""));
                                }
                            }
                            for (i = keys.length; i--; ) {
                                this.remove(keys[i]);
                            }
                            return this;
                        },
                        isExpired: function(key) {
                            var ttl = decode(ls.getItem(this._ttlKey(key)));
                            return angular.isNumber(ttl) && now() > ttl ? true : false;
                        }
                    };
                } else {
                    methods = {
                        get: angular.noop,
                        set: angular.noop,
                        remove: angular.noop,
                        clear: angular.noop,
                        isExpired: angular.noop
                    };
                }
                angular.extend(PersistentStorage.prototype, methods);
                return PersistentStorage;
                function now() {
                    return new Date().getTime();
                }
                function encode(val) {
                    return JSON.stringify(angular.isUndefined(val) ? null : val);
                }
                function decode(val) {
                    return JSON.parse(val);
                }
            }();
            return PersistentStorage;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.transport", [ "bloodhound.lru-cache" ]);
        module.factory("Transport", function($http, $q, $timeout, LruCache) {
            var Transport = function() {
                var pendingRequestsCount = 0, pendingRequests = {}, maxPendingRequests = 6, requestCache = new LruCache(10), lastUrl = "";
                function Transport(o) {
                    o = o || {};
                    this._send = o.transport ? callbackToDeferred(o.transport) : $http.get;
                    this._get = o.rateLimiter ? o.rateLimiter(this._get) : this._get;
                }
                Transport.setMaxPendingRequests = function setMaxPendingRequests(num) {
                    maxPendingRequests = num;
                };
                Transport.resetCache = function clearCache() {
                    requestCache = new LruCache(10);
                };
                angular.extend(Transport.prototype, {
                    _get: function(url, o, cb) {
                        if (url !== lastUrl) {
                            return;
                        }
                        var that = this, promise;
                        if (promise = pendingRequests[url]) {
                            promise.then(dataPassthrough(done), fail);
                        } else if (pendingRequestsCount < maxPendingRequests) {
                            pendingRequestsCount++;
                            pendingRequests[url] = this._send(url, o).then(dataPassthrough(done), fail)['finally'](always);
                        } else {
                            this.onDeckRequestArgs = [].slice.call(arguments, 0);
                        }
                        function done(resp) {
                            cb && cb(null, resp);
                            requestCache.set(url, resp);
                        }
                        function fail() {
                            cb && cb(true);
                        }
                        function always() {
                            pendingRequestsCount--;
                            delete pendingRequests[url];
                            if (that.onDeckRequestArgs) {
                                that._get.apply(that, that.onDeckRequestArgs);
                                that.onDeckRequestArgs = null;
                            }
                        }
                    },
                    get: function(url, o, cb) {
                        var resp;
                        if (angular.isFunction(o)) {
                            cb = o;
                            o = {};
                        }
                        lastUrl = url;
                        if (resp = requestCache.get(url)) {
                            $timeout(function() {
                                cb && cb(null, resp);
                            }, 0);
                        } else {
                            this._get(url, o, cb);
                        }
                        return !!resp;
                    }
                });
                return Transport;
                function callbackToPromise(fn) {
                    return function customSendWrapper(url, o) {
                        var deferred = $q.defer();
                        fn(url, o, onSuccess, onError);
                        return deferred.promise;
                        function onSuccess(resp) {
                            $timeout(function() {
                                deferred.resolve(resp);
                            }, 0);
                        }
                        function onError(err) {
                            $timeout(function() {
                                deferred.reject(err);
                            }, 0);
                        }
                    };
                }
            }();
            function dataPassthrough(fn) {
                return function(response) {
                    fn(response.data);
                };
            }
            return Transport;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.search-index", []);
        module.factory("SearchIndex", function($filter) {
            var filter = $filter("filter");
            var SearchIndex = function() {
                function SearchIndex(o) {
                    o = o || {};
                    if (!o.datumTokenizer || !o.queryTokenizer) {
                        throw new Error("datumTokenizer and queryTokenizer are both required");
                    }
                    this.datumTokenizer = o.datumTokenizer;
                    this.queryTokenizer = o.queryTokenizer;
                    this.reset();
                }
                angular.extend(SearchIndex.prototype, {
                    bootstrap: function bootstrap(o) {
                        this.datums = o.datums;
                        this.trie = o.trie;
                    },
                    add: function(data) {
                        var that = this;
                        data = angular.isArray(data) ? data : [ data ];
                        _.each(data, function(datum) {
                            var id, tokens;
                            id = that.datums.push(datum) - 1;
                            tokens = normalizeTokens(that.datumTokenizer(datum));
                            _.each(tokens, function(token) {
                                var node, chars, ch;
                                node = that.trie;
                                chars = token.split("");
                                while (ch = chars.shift()) {
                                    node = node.children[ch] || (node.children[ch] = newNode());
                                    node.ids.push(id);
                                }
                            });
                        });
                    },
                    get: function get(query) {
                        var that = this, tokens, matches;
                        tokens = normalizeTokens(this.queryTokenizer(query));
                        _.each(tokens, function(token) {
                            var node, chars, ch, ids;
                            if (matches && matches.length === 0) {
                                return false;
                            }
                            node = that.trie;
                            chars = token.split("");
                            while (node && (ch = chars.shift())) {
                                node = node.children[ch];
                            }
                            if (node && chars.length === 0) {
                                ids = node.ids.slice(0);
                                matches = matches ? getIntersection(matches, ids) : ids;
                            } else {
                                matches = [];
                                return false;
                            }
                        });
                        return matches ? _.map(unique(matches), function(id) {
                            return that.datums[id];
                        }) : [];
                    },
                    reset: function reset() {
                        this.datums = [];
                        this.trie = newNode();
                    },
                    serialize: function serialize() {
                        return {
                            datums: this.datums,
                            trie: this.trie
                        };
                    }
                });
                return SearchIndex;
                function normalizeTokens(tokens) {
                    tokens = filter(tokens, function(token) {
                        return !!token;
                    });
                    tokens = _.map(tokens, function(token) {
                        return token.toLowerCase();
                    });
                    return tokens;
                }
                function newNode() {
                    return {
                        ids: [],
                        children: {}
                    };
                }
                function unique(array) {
                    var seen = {}, uniques = [];
                    for (var i = 0; i < array.length; i++) {
                        if (!seen[array[i]]) {
                            seen[array[i]] = true;
                            uniques.push(array[i]);
                        }
                    }
                    return uniques;
                }
                function getIntersection(arrayA, arrayB) {
                    var ai = 0, bi = 0, intersection = [];
                    arrayA = arrayA.sort(compare);
                    arrayB = arrayB.sort(compare);
                    while (ai < arrayA.length && bi < arrayB.length) {
                        if (arrayA[ai] < arrayB[bi]) {
                            ai++;
                        } else if (arrayA[ai] > arrayB[bi]) {
                            bi++;
                        } else {
                            intersection.push(arrayA[ai]);
                            ai++;
                            bi++;
                        }
                    }
                    return intersection;
                    function compare(a, b) {
                        return a - b;
                    }
                }
            }();
            return SearchIndex;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.options-parser", [ "bloodhound.util" ]);
        module.factory("oParser", function(util) {
            var oParser = function() {
                return {
                    local: getLocal,
                    prefetch: getPrefetch,
                    remote: getRemote
                };
                function getLocal(o) {
                    return o.local || null;
                }
                function getPrefetch(o) {
                    var prefetch, defaults;
                    defaults = {
                        url: null,
                        thumbprint: "",
                        ttl: 24 * 60 * 60 * 1e3,
                        filter: null,
                        ajax: {}
                    };
                    if (prefetch = o.prefetch || null) {
                        prefetch = angular.isString(prefetch) ? {
                            url: prefetch
                        } : prefetch;
                        prefetch = angular.extend(defaults, prefetch);
                        prefetch.thumbprint = VERSION + prefetch.thumbprint;
                        prefetch.ajax.type = prefetch.ajax.type || "GET";
                        prefetch.ajax.dataType = prefetch.ajax.dataType || "json";
                        if (!prefetch.url) {
                            throw new Error("prefetch requires url to be set");
                        }
                    }
                    return prefetch;
                }
                function getRemote(o) {
                    var remote, defaults;
                    defaults = {
                        url: null,
                        wildcard: "%QUERY",
                        replace: null,
                        rateLimitBy: "debounce",
                        rateLimitWait: 300,
                        send: null,
                        filter: null,
                        ajax: {}
                    };
                    if (remote = o.remote || null) {
                        remote = angular.isString(remote) ? {
                            url: remote
                        } : remote;
                        remote = angular.extend(defaults, remote);
                        remote.rateLimiter = /^throttle$/i.test(remote.rateLimitBy) ? byThrottle(remote.rateLimitWait) : byDebounce(remote.rateLimitWait);
                        remote.ajax.type = remote.ajax.type || "GET";
                        remote.ajax.dataType = remote.ajax.dataType || "json";
                        delete remote.rateLimitBy;
                        delete remote.rateLimitWait;
                        if (!remote.url) {
                            throw new Error("remote requires url to be set");
                        }
                    }
                    return remote;
                    function byDebounce(wait) {
                        return function(fn) {
                            return util.debounce(fn, wait);
                        };
                    }
                    function byThrottle(wait) {
                        return function(fn) {
                            return util.throttle(fn, wait);
                        };
                    }
                }
            }();
            return oParser;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound", [ "bloodhound.tokenizers", "bloodhound.options-parser", "bloodhound.search-index", "bloodhound.persistent-storage", "bloodhound.transport" ]);
        module.factory("Bloodhound", function($rootScope, $q, $http, tokenizers, oParser, SearchIndex, PersistentStorage, Transport) {
            var Bloodhound = function() {
                var old, keys;
                keys = {
                    data: "data",
                    protocol: "protocol",
                    thumbprint: "thumbprint"
                };
                function Bloodhound(o) {
                    if (!o || !o.local && !o.prefetch && !o.remote) {
                        throw new Error("one of local, prefetch, or remote is required");
                    }
                    this.limit = o.limit || 5;
                    this.sorter = getSorter(o.sorter);
                    this.dupDetector = o.dupDetector || ignoreDuplicates;
                    this.local = oParser.local(o);
                    this.prefetch = oParser.prefetch(o);
                    this.remote = oParser.remote(o);
                    this.cacheKey = this.prefetch ? this.prefetch.cacheKey || this.prefetch.url : null;
                    this.index = new SearchIndex({
                        datumTokenizer: o.datumTokenizer,
                        queryTokenizer: o.queryTokenizer
                    });
                    this.storage = this.cacheKey ? new PersistentStorage(this.cacheKey) : null;
                }
                Bloodhound.tokenizers = tokenizers;
                angular.extend(Bloodhound.prototype, {
                    _loadPrefetch: function loadPrefetch(o) {
                        var that = this, serialized, promise;
                        if (serialized = this._readFromStorage(o.thumbprint)) {
                            this.index.bootstrap(serialized);
                            var deferred = $q.defer();
                            deferred.resolve();
                            promise = deferred.promise;
                        } else {
                            promise = $http.get(o.url, o.ajax).success(handlePrefetchResponse);
                        }
                        return promise;
                        function handlePrefetchResponse(resp) {
                            that.clear();
                            that.add(o.filter ? o.filter(resp) : resp);
                            that._saveToStorage(that.index.serialize(), o.thumbprint, o.ttl);
                        }
                    },
                    _getFromRemote: function getFromRemote(query, cb) {
                        var that = this, url, uriEncodedQuery;
                        query = query || "";
                        uriEncodedQuery = encodeURIComponent(query);
                        url = this.remote.replace ? this.remote.replace(this.remote.url, query) : this.remote.url.replace(this.remote.wildcard, uriEncodedQuery);
                        return this.transport.get(url, this.remote.ajax, handleRemoteResponse);
                        function handleRemoteResponse(err, resp) {
                            err ? cb([]) : cb(that.remote.filter ? that.remote.filter(resp) : resp);
                        }
                    },
                    _saveToStorage: function saveToStorage(data, thumbprint, ttl) {
                        if (this.storage) {
                            this.storage.set(keys.data, data, ttl);
                            this.storage.set(keys.protocol, location.protocol, ttl);
                            this.storage.set(keys.thumbprint, thumbprint, ttl);
                        }
                    },
                    _readFromStorage: function readFromStorage(thumbprint) {
                        var stored = {}, isExpired;
                        if (this.storage) {
                            stored.data = this.storage.get(keys.data);
                            stored.protocol = this.storage.get(keys.protocol);
                            stored.thumbprint = this.storage.get(keys.thumbprint);
                        }
                        isExpired = stored.thumbprint !== thumbprint || stored.protocol !== location.protocol;
                        return stored.data && !isExpired ? stored.data : null;
                    },
                    _initialize: function initialize() {
                        var that = this, local = this.local, promise;
                        if (this.prefetch) {
                            promise = this._loadPrefetch(this.prefetch);
                        } else {
                            var deferred = $q.defer();
                            deferred.resolve();
                            promise = deferred.promise;
                        }
                        local && promise.then(addLocalToIndex);
                        this.transport = this.remote ? new Transport(this.remote) : null;
                        return this.initPromise = promise;
                        function addLocalToIndex() {
                            that.add(angular.isFunction(local) ? local() : local);
                        }
                    },
                    initialize: function initialize(force) {
                        return !this.initPromise || force ? this._initialize() : this.initPromise;
                    },
                    add: function add(data) {
                        this.index.add(data);
                    },
                    get: function get(query, cb) {
                        var that = this, matches = [], cacheHit = false;
                        matches = this.index.get(query);
                        matches = this.sorter(matches).slice(0, this.limit);
                        if (matches.length < this.limit && this.transport) {
                            cacheHit = this._getFromRemote(query, returnRemoteMatches);
                        }
                        if (!cacheHit) {
                            (matches.length > 0 || !this.transport) && cb && cb(matches);
                        }
                        function returnRemoteMatches(remoteMatches) {
                            var matchesWithBackfill = matches.slice(0);
                            _.each(remoteMatches, function(remoteMatch) {
                                var isDuplicate;
                                isDuplicate = _.some(matchesWithBackfill, function(match) {
                                    return that.dupDetector(remoteMatch, match);
                                });
                                !isDuplicate && matchesWithBackfill.push(remoteMatch);
                                return matchesWithBackfill.length < that.limit;
                            });
                            cb && cb(that.sorter(matchesWithBackfill));
                        }
                    },
                    clear: function clear() {
                        this.index.reset();
                    },
                    clearPrefetchCache: function clearPrefetchCache() {
                        this.storage && this.storage.clear();
                    },
                    clearRemoteCache: function clearRemoteCache() {
                        this.transport && Transport.resetCache();
                    }
                });
                return Bloodhound;
                function getSorter(sortFn) {
                    return angular.isFunction(sortFn) ? sort : noSort;
                    function sort(array) {
                        return array.sort(sortFn);
                    }
                    function noSort(array) {
                        return array;
                    }
                }
                function ignoreDuplicates() {
                    return false;
                }
            }();
            return Bloodhound;
        });
    })();
    (function() {
        "use strict";
        var module = angular.module("bloodhound.util", []);
        module.factory("util", function($timeout) {
            return {
                debounce: function(func, wait, immediate) {
                    var promise, result;
                    return function() {
                        var context = this, args = arguments, later, callNow;
                        later = function() {
                            promise = null;
                            if (!immediate) {
                                result = func.apply(context, args);
                            }
                        };
                        callNow = immediate && !promise;
                        $timeout.cancel(promise);
                        promise = $timeout(later, wait);
                        if (callNow) {
                            result = func.apply(context, args);
                        }
                        return result;
                    };
                },
                throttle: function(func, wait) {
                    var context, args, timeout, result, previous, later;
                    previous = 0;
                    later = function() {
                        previous = new Date();
                        timeout = null;
                        result = func.apply(context, args);
                    };
                    return function() {
                        var now = new Date(), remaining = wait - (now - previous);
                        context = this;
                        args = arguments;
                        if (remaining <= 0) {
                            clearTimeout(timeout);
                            timeout = null;
                            previous = now;
                            result = func.apply(context, args);
                        } else if (!timeout) {
                            timeout = setTimeout(later, remaining);
                        }
                        return result;
                    };
                }
            };
        });
    })();
})(window.angular, window._);

/* * * 
 * src/ngAtp.js
 * * */
(function(angular) {
  angular.module('ngAtp', ['bloodhound']);
})(angular);

/* * * 
 * src/ng-atp/atp-controllers.js
 * * */
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
		var init_val = _getter(parent);
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
			if(helpers.isEmpty(q)) {
			  $scope.ATP.clear()
				$scope.ATP.exportValue(null);
				return;
			}
			if(!$scope.ATP.isComplete()) {
				$scope.ATP.search();
			} 
		});
		$scope.$watch('ATP.suggestions', function(suggestions) {
			$scope.ATP.showSuggestions = suggestions.length ? !$scope.ATP.tryCompleteExact() : false;
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

})(window.angular, window._);

/* * * 
 * src/ng-atp/atp-directives.js
 * * */
(function(angular, _) {

	angular.module('ngAtp')
	.directive('ngAtp', ['$parse', function($parse) {
			return {
				restrict: 'AE',
				compile : ATP$Directive$compileATP,
				scope : true,
				controller: 'ATPMainCtrl'
			};
			function ATP$Directive$compileATP(tElement, attrs) {
				return function(scope, element, attrs) {
				}
			}
		
		}])
	.directive('ngAtpInput', 
		['$compile', '$parse', '$document', '$timeout', 'ATPhelpers',
		function($compile, $parse, $document, $timeout, helpers) {
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
								scope.ATP.tryComplete();
							});
						} else if (event.keyCode == 9 || event.keyCode == 39) { // tab and right arrow
							if (getCaretPosition(inputElement[0]) < inputElement.val().length) return;
							event.preventDefault(); 
							// tab autocompletes 
							var suggested = scope.ATP.getSuggested( event.keyCode == 39 );  
							scope.$apply(function() {
								scope.ATP.showSuggestions = !scope.ATP.tryComplete();
							});
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
						scope.$apply(function(){ scope.ATP.showSuggestions = false });
					});
				}
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
					})
			}

		}])
	.directive('ngAtpSuggestions', ['$parse', '$compile', function($parse, $compile) { 
			var template = ['<li ', 
										'ng-repeat="suggestion in ATP.suggestions track by (ATP._idAttrib ? suggestion[ATP._idAttrib] : $id(suggestion))"',
										'ng-click="ATP.tryComplete($index); $event.stopPropagation(); $event.preventDefault()" ', 
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
					}
				}
			} 
		}]);

})(window.angular, window._);

/* * * 
 * src/ng-atp/atp-services.js
 * * */
(function (angular, _) {

	angular.module('ngAtp')
		.factory('ATPStates', ['Bloodhound', ATPStates])
		.factory('ATPhelpers', function() {
			return {
				isEmpty : ATP$isEmpty,
				startWith : ATP$startWith
			}
		});

	/* -- divider -- */

	function ATPStates(Bloodhound) {
		return  {
			initialized : false,
			$new : function(options) {
				var atp = Object.create(this);
				atp.selected = -1;	
				atp.query = "";
				atp.suggestions = [];
				atp._idAttrib = options.idAttribute;
				atp.engine = new Bloodhound({
					datumTokenizer : options.datumTokenizer || function(d) {
						return Bloodhound.tokenizers.whitespace(atp.format(d));
					},
					queryTokenizer : options.queryTokenizer || Bloodhound.tokenizers.whitespace,
					prefetch : options.prefetch,
					remote   : options.remote,
					local    : options.local,
					limit    : options.limit,
					dupDetector: options.dupDetector || (atp._idAttrib ? function(a,b){ return (a[atp._idAttrib] === b[atp._idAttrib]) } :  _.isEqual),
					sorter   : options.sorter
				});
				atp.engine.initialize();
				if(atp.verify(options.initialvalue)) {
					var _cloned_value = _.clone(options.initialvalue);
					atp.value = options.initialvalue;
					atp.engine.add([ _cloned_value ]);
					atp.query = atp.format(_cloned_value);
				} else {
					atp.value = null;
				} 
				_.isFunction(options.verify) && (atp.verify = options.verify);
				_.isFunction(options.format) && (atp.verify = options.format);
				atp.initialized = true;
				atp.showSuggestions = false;
				return atp;
			},
			verify : function(d) { return d !== null; },
			format : function(d) {
				return  d ? d.value : '';
			},
			clear : function() {
				this.selected = -1;
				this.suggestions.length = 0;	
				this.showSuggestions = false;
			},
			getByIndex : function(i) {
				if(i<0 || i>=this.suggestions.length) return null;
				return this.suggestions[i]; 
			},
			select : function(index) {
				index = +index;
				var n = this.suggestions.length;
				if(n === 0) return(this.selected = -1);
				if(this.selected === 0 && index<0) return 0;
				if(this.selected === n - 1 && index>=n) return n-1;
				return(this.selected = index);
			},
			search : function(str) {
				if(!_.isUndefined(str)) {
					this.query = str;
				} else {
					str = this.query;
				}
				if(ATP$isEmpty(str)) {
					this.clear();
					return;
				} 
				this.value = null;
				this.exportValue(null);
				this.engine.get(str, function(results) {
					if(ATP$isEmpty(this.query)) {
						this.showSuggestions = false;
					} else {
					  this.showSuggestions = true;
					}
					if(!this.isComplete()) {
					  var suggestions = results.concat(this.suggestions); 
						var attr = this._idAttrib;
						if(attr) {
						  this.suggestions = _.uniq(suggestions, function(s) {
							  return u[attr];
							});
						} else {
						  this.suggestions = _.uniq(suggestions, function(s) {
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
			getSuggested : function(matching_start) {
				if(this.suggestions.length === 0) return null;
				if(this.suggestions.length === 1) {
					if(!matching_start) {
						return this.suggestions[0];
					} else {
						var suggested = this.format(this.suggestions[0]);
						return ATP$startWith(suggested, this.query) ? this.suggestions[0] : null;
					}
				}
				// if none is selected find and select the first item
				// starts with the query (if matching_start flag is used)
				// however, when there is a selected item, ignore matching start requirement
				if(this.selected === -1) {
					if(!matching_start) {
						return this.suggestions[0];
					} else {
						return _.find(this.suggestions, function(d, index) {
							var suggested = this.format(d);
							if(ATP$startWith(suggested, this.query)) {
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
			exportValue : angular.noop,
			tryComplete : function(i) {
				if(this.isComplete()) return true;
				var suggested = _.isUndefined(i) ? this.getSuggested() : this.suggestions[i];  	
				var out;
				if(this.verify(suggested)) {
					this.value = suggested;
					this.query = this.format(suggested);
					out = _.clone(this.value);
					this.exportValue(out);
					this.clear();
					return true;
				} else {
					this.exportValue(null);
					return false;
				}
			},
			tryCompleteExact : function() {
				var suggested = _.findIndex(this.suggestions, function(s) {
					return this.format(s).toLowerCase() === this.query.toLowerCase();
				}, this);
				if(suggested>-1) {
					return this.tryComplete(suggested);
				} else {
					return false;
				}
			},
			isComplete : function() {
				return this.format(this.value)===this.query && this.verify(this.value);
			}
		}
	}

	function ATP$isEmpty(value) {
		return angular.isUndefined(value) || value === '' || value === null || value !== value;
	} 
	function ATP$startWith(str, x) {
		return (str.length && x.length && str.slice(0, x.length) === x);
	}

})(window.angular, window._);
