# ngAtp : Angular Autocompleter

## Quick Start


```
<div ng-atp="city" ng-atp-config="cityAutocompleteOpts">
    <input ng-atp-input />
    <ul ng-atp-suggestions>
    </ul>
</div>
```
Set `ng-atp` attribute value to the variable in scope you'd like to autocomplete for, same way you'd use a `ngModel` directive. Pass [`Bloodhound`](https://github.com/twitter/typeahead.js/blob/master/doc/bloodhound.md) config object using `ng-atp-config` attribute. Additonal config options: `idAttribute`, specify the key/id attribute to use for tracking suggestion items (similar to `track by` for ng-repeat).

## Details

`ngAtp` implements Twitter `Bloodhound` as a `Angular` service, `ngBloodhound` uses `Angular`'s `$http` service as opposed to `jQuery` `$.ajax` in the original version. Other than that, suggestions are entirely managed by `Bloodhound` with all its prefetching, intelligent caching, fast lookups, and backfilling. On the rendering/directive side of things, `ngAtp` relies on `ng-model` and `ng-repeat` (without filtering, which is handled by `Bloodhound`), and tries to stick to default Angular directives as
much as possilbe. 


