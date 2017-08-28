// Simple JS object for exploring Patterns Rules via the API
var RuleTree = (function() {
  var _this;

  var _getRules = function() {
    var url = _this.url + "/api/v1/reports/" + _this.id + "/rules?page=1&size=100";
    url += "&filter[size]=" + _this.depth;
    url += "&filter[outcome_item_id]=" + _this.outcome;

    if (_this.rule.length) {
      url += "&with_item_ids=" + _this.rule.join(",");
    }

    $.ajax({
      url: url,
      method: "GET",
      beforeSend: function (xhr) {
        xhr.setRequestHeader('Authorization', _this.token);
      },
      success: function(data) {
        _this.rules[_this.depth] = data.data;
        _parseCategories.call(_this);
        _this.callback.call(_this);
      },
      error: function(data) {
        debugger;
      }
    });
  };

  var _parseCategories = function() {
    var _this = this;
    _.each(this.rules[this.depth], function(r) {
      var _itemIds = r.item_ids.slice(1,-1).split("|");
      var _itemPosition = _itemIds.indexOf(_.difference(_itemIds, _this.rule)[0]);
      var _itemId = _itemIds[_itemPosition];
      var _cat = r.category_names.slice(1,-1).split("|")[_itemPosition];
      var _item = r.item_names.slice(1,-1).split("|")[_itemPosition];

      var _itemObj = {
        name: _item,
        id: _itemId,
        freq: r.cluster_frequency,
        cprob: r.conditional_probability,
        outcome: r.outcome_item_name,
        lift: r.lift
      };

      if (!_this.categories[_cat]) { _this.categories[_cat] = []; }
      if (!_.contains(_this.categories[_cat], _itemObj)) { _this.categories[_cat].push(_itemObj); }
    });


  };

  var _getOutcomes = function(callback) {
    var _this = this;

    var url = _this.url + "/api/v1/reports/" + _this.id + "/outcomes?page=1&size=100";

    $.ajax({
      url: url,
      method: "GET",
      beforeSend: function (xhr) {
        xhr.setRequestHeader('Authorization', _this.token);
      },
      success: function(data) {
        var outcomes = data.data;

        for (var i = 0; i < outcomes.length; i ++) {
          var outcome = {
            name: outcomes[i].item_id,
            category: outcomes[i].category_name,
            id: outcomes[i].id
          };

          _this.outcomes.push(outcome);
        }

        callback.call(_this);
      },
      error: function(data) {
        debugger;
      }
    });
  };

  var _getCategories = function(callback) {
    var _this = this;

    var url = _this.url + "/api/v1/reports/" + _this.id + "/outcomes/" + _this.outcome + "/categories?page=1&size=100";
    url += "&sort=-category_outcome_impact";

    $.ajax({
      url: url,
      method: "GET",
      beforeSend: function (xhr) {
        xhr.setRequestHeader('Authorization', _this.token);
      },
      success: function(data) {
        _this.catOrder = _.map(data.data, function(d) { return d.category_name; });

        _this.catImpacts = {};
        _.each(data.data, function(d) {
          _this.catImpacts[d.category_name] = d.category_outcome_impact;
        });

        callback.call(_this);
      },
      error: function(data) {
        debugger;
      }
    });
  };

  var _getCounts = function(callback, level, scope) {
    var _this = this;
    var requests = [];
    _this.prefetchCounts = {};

    _.each(_this.prefetchList, function(d) {
      var ruleCombo = _this.rule.slice(0, level - 1).concat([d]);

      var url = _this.url + "/api/v1/reports/" + _this.id + "/rules?page=1&size=100";
      url += "&filter[size]=" + (level + 1);
      url += "&filter[outcome_item_id]=" + _this.outcome;
      url += "&with_item_ids=" + ruleCombo.join(",");

      var request = $.ajax({
        url: url,
        method: "GET",
        beforeSend: function (xhr) {
          xhr.setRequestHeader('Authorization', _this.token);
        },
        success: function(data) {
          _this.prefetchCounts[d] = data.meta.records_total;
        },
        error: function(data) {
          debugger;
        }
      });

      requests.push(request);
    });

    $.when.apply(this, requests).done(function() {
      callback.call(scope);
    });
  };

  var RuleTree = function RuleTree(url, token, id, callback) {
    if (url == null || token == null || id == null) {
      var msg = "url, token and id must be passed to RuleTree constructor";
      throw new SyntaxError(msg);
    }

    this.url = url;
    this.token = token;
    this.id = id;
    this.callback = callback;
    this.depth = 1;
    this.rules = {};
    this.categories = {};
    this.catOrder = [];
    this.catImpacts = {};
    this.outcomes = [];
    this.rule = [];
    this.ruleString = [];

    _this = this;
  };

  RuleTree.prototype.fetchOutcomes = function(callback) {
    _getOutcomes.call(_this, callback);
  }

  RuleTree.prototype.fetchCategories = function(callback) {
    _getCategories.call(_this, callback);
  }

  RuleTree.prototype.fetchCounts = function(callback, level, scope) {
    _getCounts.call(_this, callback, level, scope);
  };

  RuleTree.prototype.dig = function(depth) {
    _this.depth = depth || _this.rule.length + 1;
    _this.categories = {};
    _this.rules[_this.depth] = [];
    return _getRules.call(_this);
  };

  return RuleTree;
})();
