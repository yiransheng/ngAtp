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
