# ngAtp : Angular Autocompleter

## Demo
[http://yiransheng.github.io/ngAtp/](http://yiransheng.github.io/ngAtp/)

## Credits

The backbone of `ngAtp` is `ngBloodhound`, which is almost entirely adopted from [twhitbeck](https://www.github.com/twhitbeck)'s [`angular-bloodhound`](https://www.github.com/twhitbeck/angular-bloodhound), an Angular port of Twitter's [`Bloodhound`](https://github.com/twitter/typeahead.js/blob/master/doc/bloodhound.md). 

## Quick Start

Include `dist/js/ng-atp-bundle.js` or `dist/js/ng-atp-bundle.min.js` on your page after `angular` and ~~`lodash`~~<sup>1</sup> (or use as a bower component: `bower install ng-atp`). 

[1] lodash is no longer a dependency

* For CommonJS:
```
var _ = require('lodash');
var angular = require('angular');
require('ng-atp');  // exports angular.module('ng-atp')
```
### Use:

#### Update:

Added in config options: `completeOn`. Default Value : `{ tab: true, rightArrow: true }`. Can be used to fine-tune whether to autocomplete on tab or right arrow key.

```
<div ng-atp="city" ng-atp-config="cityAutocompleteOpts">
    <input ng-atp-input />
    <ul ng-atp-suggestions>
    </ul>
</div>
```
Set `ng-atp` attribute value to the variable in scope you'd like to autocomplete for, same way you'd use a `ngModel` directive. Pass [`Bloodhound`](https://github.com/twitter/typeahead.js/blob/master/doc/bloodhound.md) config object using `ng-atp-config` attribute. Additonal config options: `idAttribute`, specify the key/id attribute to use for tracking suggestion items (similar to `track by` for ng-repeat). Also, you should to supply two functions in config: `format` and `verify`(optional). `format` is expected to be a function that takes a suggestion datum (eg. `{ label: "Thing", id: 1}`) into a string to display, and `verify` is expected to be a function that takes a single suggestion datum as an argument, and returns a boolean (be sure to return false for null). 


In addition, `ng-atp-suggestions` allows you to use custom template by suppling an attribute `templateUrl`. `templateUrl` should point to a valid `Angular` template for a single suggestion item (which will be wrapped inside a `<li>` tag), and `ng-atp-suggestions` expose the scope variable `suggestion` for your template, as well as setting the class of the corresponding item to "selected" from user interactions (hover, and arrow key press). An example template may look like this:

```
<ul ng-atp-suggestions templateUrl="'partials/mytemplate.html'">
```


```
mytemplate.html:

<div>
  <i class="fa {{ suggestion.icon }}"></i>
  <span>{{ suggestion.label }}</span>
  <img src="{{ suggestion.url }}">
</div>
```

## Details

`ngAtp` implements Twitter `Bloodhound` as a `Angular` service, `ngBloodhound` uses `Angular`'s `$http` service as opposed to `jQuery` `$.ajax` in the original version (inspired by [twhitbeck/angular-bloodhound](https://www.github.com/twhitbeck/angular-bloodhound)). Other than that, suggestions are entirely managed by `Bloodhound` with all its prefetching, intelligent caching, fast lookups, and backfilling. On the rendering/directive side of things, `ngAtp` relies on `ng-model` and `ng-repeat` (without filtering, which is handled by `Bloodhound`), and tries to stick to default Angular directives as
much as possilbe. 

## Dependencies

`Angular`

## License 
MIT

