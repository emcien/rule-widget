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
        _getCategories.call(_this);
        _this.callback.call(_this);
      },
      error: function(data) {
        debugger;
      }
    });
  };

  var _getCategories = function() {
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
        outcome_name: r.outcome_item_name,
        lift: r.lift
      };

      if (!_this.categories[_cat]) { _this.categories[_cat] = []; }
      if (!_.contains(_this.categories[_cat], _itemObj)) { _this.categories[_cat].push(_itemObj); }
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
    this.outcome = 1;
    this.rule = [];
    this.ruleString = [];

    _this = this;
  };

  RuleTree.prototype.dig = function(depth) {
    _this.depth = depth || _this.rule.length + 1;
    _this.categories = {};
    _this.rules[_this.depth] = [];
    return _getRules.call(_this);
  };

  return RuleTree;
})();
