var RuleExplorer = (function() {
  var _this;

  /****************************
   *** START OF PRIVATE API ***
   ****************************/

  var _getEachPage = function(deferred, all, url, params, page, size) {
    params.page = page;
    params.size = size;

    var query = _parameterize(params);
    var fullUrl = url + "?" + query;

    var request = $.ajax({
      url: fullUrl,
      method: "GET",
      beforeSend: function (xhr) {
        xhr.setRequestHeader('Authorization', _this.token);
      }
    });

    request.done(function(d) {
      all = all.concat(d.data);

      deferred.notify({ page: page,
                        total: d.meta.pages_total,
                        progress: page / d.meta.pages_total });

      if (page < d.meta.pages_total) {
        _getEachPage(deferred, all, url, params, page + 1, size);
      } else {
        deferred.resolve(all);
      }
    });

    request.fail(function(d) { deferred.fail(d); });
  };

  var _getAll = function(path, params) {
    var page = 1, size = 100;
    var requests = [], request, deferred;
    var url = this.url + path;
    var all = [];

    deferred = $.Deferred();
    _getEachPage(deferred, all, url, params, page, size);
    return deferred.promise();
  };

  var _getPage = function(path, params, page) {
    params.page = page;
    params.size = 10;

    var query = _parameterize(params);
    var fullUrl = this.url + path + "?" + query;

    var request = $.ajax({
      url: fullUrl,
      method: "GET",
      beforeSend: function (xhr) { 
        xhr.setRequestHeader("Authorization", _this.token);
      }
    });

    return request;
  };

  var _getCounts = function(paths) {
    var deferred = $.Deferred();

    var progress = {
      current: 0,
      total: paths.length,
      progress: 0.0
    };

    // initialize all of the counts
    var counts = {};
    _.each(paths, function(value) { counts[value.key] = 0; });

    for (var i = 0; i < paths.length; i ++) {
      var path = paths[i];

      var params = path.params;
      params.page = 1;
      params.size = 1;

      var query = _parameterize(params);
      var url = this.url + path.url + "?" + query;

      var request = $.ajax({
        url: url,
        method: "GET",
        key: path.key,
        beforeSend: function (xhr) {
          xhr.setRequestHeader('Authorization', _this.token);
        }
      });

      request.done(function(d) {
        progress.current = progress.current + 1;
        progress.progress = progress.current / progress.total;
        deferred.notify(progress);

        counts[this.key] = d.meta.records_total;

        if (progress.progress === 1.0) {
          deferred.resolve(counts);
        }
      });
    }

    return deferred.promise();
  };

  var _parameterize = function(params) {
    var pairs = [];
    _.each(params, function(value, key) {
      pairs.push(key + "=" + value);
    });

    return pairs.join("&");
  };

  /**************************
   *** END OF PRIVATE API ***
   **************************/


  // ---------------------------------------------------------------------------


  /***************************
   *** START OF MAIN CLASS ***
   ***************************/
  var RuleExplorer = function RuleExplorer(url, token, report) {
    if (url == null || token == null || report == null) {
      var msg = "url, token and report must be passed to RuleTree constructor";
      throw new SyntaxError(msg);
    }

    this.url = url;
    this.token = token;
    this.report = report;
    this.rule = [];
    this.outcomes = [];
    this.items = [];
    this.categories = [];

    _this = this;
  };
  /*************************
   *** END OF MAIN CLASS ***
   *************************/


  // ---------------------------------------------------------------------------


  /***************************
   *** START OF PUBLIC API ***
   ***************************/

  RuleExplorer.prototype.fetchCategoriesForOutcome = function(outcome) {
    var path = "/api/v1/reports/" + _this.report + "/outcomes/" + outcome + "/categories";
    request = _getAll.call(_this, path, { sort: "-category_outcome_impact" });
    request.done(function(d) { _this.categories = d; });
    return request;
  };

  RuleExplorer.prototype.fetchOutcomes = function() {
    var path = "/api/v1/reports/" + _this.report + "/outcomes";
    request = _getAll.call(_this, path, {});
    request.done(function(d) { _this.outcomes = d; });
    return request;
  };

  // This one is a little special in that it that it must read the current
  // rule to use as a predicate for rule searching
  RuleExplorer.prototype.fetchRulesForCategory = function(category, depth, rule, page) {
    var path = "/api/v1/reports/" + _this.report + "/rules";
    var params = {
      "with_category_ids": category,
      "filter[outcome_item_id]": _this.outcome,
      "filter[size]": depth,
      "sort": "-lift"
    };

    if (rule && rule.length > 0 && depth > 1) {
      params.with_item_ids = rule.slice(0, depth - 1).join(",");
    }

    // request = _getAll.call(_this, path, params);
    request = _getPage.call(_this, path, params, page);

    return request;
  };

  RuleExplorer.prototype.countCategoryRules = function(depth, rule) {
    var paths = [];
    var params = {
      "filter[outcome_item_id]": _this.outcome,
      "filter[size]": depth
    };

    if (rule && rule.length > 0 && depth > 1) {
      params.with_item_ids = rule.slice(0, depth - 1).join(",");
    }

    _.each(_this.categories, function(cat) {
      var _params = _.clone(params);
      _params.with_category_ids = cat.category_id;
      var path = {
        url: "/api/v1/reports/" + _this.report + "/rules",
        key: cat.category_id,
        params: _params
      };

      paths.push(path);
    });

    request = _getCounts.call(_this, paths);
    return request;
  };

  RuleExplorer.prototype.countItemRules = function(items, depth, rule) {
    var paths = [];
    var _rule = rule || [];

    _.each(items, function(item) {
      var path = {
        url: "/api/v1/reports/" + _this.report + "/rules",
        key: item,
        params: {
          "with_item_ids": _rule.concat(item),
          "filter[outcome_item_id]": _this.outcome,
          "filter[size]": depth
        }
      };

      paths.push(path);
    });

    request = _getCounts.call(_this, paths);
    return request;
  };

  RuleExplorer.prototype.itemsFromRules = function(predicate, rules) {
    var items = [];
    predicate = predicate.map(function(d) { return d.toString(); });

    _.each(rules, function(rule) {
      var itemIds = rule.item_ids.slice(1,-1).split("|");
      var itemPosition = itemIds.indexOf(_.difference(itemIds, predicate)[0]);
      var itemId = itemIds[itemPosition];
      var cat = rule.category_names.slice(1,-1).split("|")[itemPosition];
      var catId = rule.category_ids.slice(1,-1).split("|")[itemPosition];
      var item = rule.item_names.slice(1,-1).split("|")[itemPosition];

      items.push({
        name: item,
        id: itemId,
        freq: rule.cluster_frequency,
        cprob: rule.conditional_probability,
        outcome: rule.outcome_item_name,
        lift: rule.lift,
        category: cat,
        category_id: catId
      });
    });

    return items;
  };

  RuleExplorer.prototype.appendItemToRule = function(item, depth) {
    var items = _this.rule.map(function(d) { return d.id; });
    if (items.includes(item.id)) throw "Rule already contains " + item.id;

    if (depth) {
      _this.rule = _this.rule.slice(0, depth - 1);
    }

    _this.rule.push(item);
    return _this.rule;
  };


  /*************************
   *** END OF PUBLIC API ***
   *************************/

  return RuleExplorer;
})();
