$(document).ready(function() {
  fillForm();

  // toggle show/hide lift switch
  $("#lift").change(function() {
    var rule = getStyleRule('.lift-neg');

    if ($(this).is(":checked")) {
      rule.display = "none";
    } else {
      rule.display = "list-item";
    }
  });

  $(".submit").on("click", function() {
    var opts = storeForm();
    $(".outcome-selector").css({opacity:1});
    window.ruleExplorer = new RuleExplorer(opts.server, opts.token, opts.report);
    fetch("outcomes", null, render.bind(this, "outcomes"));
  });
});


// async fetchers
var fetch = function fetch(name, args, callback) {
  var promise;

  switch(name) {
    case 'outcomes':
      promise = ruleExplorer.fetchOutcomes.apply(this, args).done(callback);
      break;
    case 'categories':
      promise = ruleExplorer.fetchCategoriesForOutcome.apply(this, args).done(callback);
      break;
    case 'category counts':
      promise = ruleExplorer.countCategoryRules.apply(this, args).done(callback);
      break;
    case 'items':
      promise = ruleExplorer.fetchRulesForCategory.apply(this, args).done(callback);
      break;
    case 'item counts':
      promise = ruleExplorer.countItemRules.apply(this, args).done(callback);
      break;
  }

  promise.progress(function(d) {
    progress(d, "Fetching " + name);
  });

  return promise;
};


// renderers
var render = function render(name, args) {
  args = _.toArray(arguments);
  args.shift();

  switch(name) {
    case 'outcomes':
      _renderOutcomes.apply(this, args);
      break;
    case 'categories':
      _renderCategories.apply(this, args);
      break;
    case 'items':
      _renderItems.apply(this, args);
      break;
    case 'reset':
      ruleExplorer.rule = [];
      $(".actors").fadeOut(400, "swing", function() {
        clearAfter(0);
        $(".rule-show").html("Welcome to <em>Emcien Rules Explorer</em>");
      });
  }
};

var _renderOutcomes = function _renderOutcomes() {
  // we want to re-hide it if were submitting a different report
  $(".outcome").hide();

  // add the placeholder
  $("select.outcome-selector").html("<option value='' disabled selected>Select an outcome</option>");

  // fill in all the options that have been populated
  for (var i = 0; i < ruleExplorer.outcomes.length; i ++) {
    var outcome = ruleExplorer.outcomes[i];
    var name = outcome.category_name + "::" + outcome.item_id;
    $("select.outcome-selector").append("<option value=" + outcome.id + ">" + name + "</option>");
  }

  $("select.outcome-selector").change(function() {
    ruleExplorer.outcome = this.value;
    fetch("categories", [ruleExplorer.outcome], render.bind(this, "categories", [1]));
    render("reset");
  });

  $(".outcome").fadeIn();
};

var _renderCategories = function _renderCategories(depth) {
  fetch("category counts", [depth, ruleItems(depth)], null).then(function(counts) {
    var ruleCats = ruleExplorer.rule.map(function(d) { return d.cat; });

    _.each(counts, function(count, id) {
      var cat = _.find(ruleExplorer.categories, function(c) {
        return c.category_id == id;
      });

      if (ruleCats.includes(+id)) {
        cat.rule_count = +count - ruleExplorer.priorCount;
      } else {
        cat.rule_count = +count;
      }
    });

    clearAfter(depth - 1);

    $("td.level-" + depth).html("<ul class='parent'>");

    var cats = ruleExplorer.categories;

    var max_impact = cats[0].category_outcome_impact;
    var min_impact = cats[cats.length - 1].category_outcome_impact;

    for (var i = 0; i < cats.length; i ++) {
      // Skip rendering the outcome
      if (cats[i].category_id == +ruleExplorer.outcomes[0].category_id) continue;

      var this_impact = cats[i].category_outcome_impact;

      var childrenClass = cats[i].rule_count > 0 ? "has_children" : "no_children";

      cat_pill = "<span class=\"dots\" title=\"Category Impact: " +
        this_impact + "\">" + dots(this_impact, max_impact, min_impact) +
        "</span><span class=\"category-pill " + childrenClass + "\" data-impact=" +
        this_impact + " data-id=" + cats[i].category_id + " data-depth=" + depth +
        " data-count=" + cats[i].rule_count + ">" + cats[i].category_name + "</span>";

      $("ul.parent", "td.level-" + depth).append("<li class='cat " + childrenClass + "'>" + cat_pill + "</li>");
    }

    $("td.level-" + depth).append("</ul>");
    $('.category-pill.has_children', "td.level-" + depth).on('click', _showItems);

    $(".actors").fadeIn();
  });
};

var _showItems = function showItems() {
  if ($('.child', $(this).parent()).length > 0) {
    $('.child', $(this).closest("td")).hide();
    $('.child', $(this).parent()).show();
    $('.pager', $(this).closest("td")).hide();
    $('.pager', $(this).parent()).show();
  } else {
    var _this = this;
    var $cat = $(this);
    var id = $cat.data("id");
    var depth = $cat.data("depth");
    var rule = ruleItems(depth).map(function(d) { return d.toString(); });

    $cat.append("<span class=\"fa fa-refresh fa-spin cat-spinner\"></span>")

    fetch("items", [id, depth, rule, 1], render.bind(_this, "items"));
  }
};

var _renderItems = function _renderItems(response) {
  var _this = this;
  var $cat = $(this);
  var depth = $cat.closest("td").data("level");
  var rule = ruleItems(depth);
  var items = ruleExplorer.itemsFromRules(rule, response.data);
  var itemIds = items.map(function(d) { return d.id; });
  var meta = response.meta;

  fetch("item counts", [itemIds, depth + 1, rule]).then(function(counts) {
    _renderPagination.call(_this, meta);

    // clear out any items there before
    $('.child', $cat.parent()).remove();

    var itemList = "<ul class='child' style='display: none;'>";

    for (var i = 0; i < items.length; i ++) {
      var item = items[i];
      var liftClass = item.lift > 1 ? "lift-pos" : "lift-neg";
      var childrenClass = counts[item.id] > 0 ? "has_children" : "no_children";

      itemList += "<li class='item " + liftClass + "' data-freq='" +
        item.freq + "' data-cprob='" + item.cprob + "' data-outcome='" +
        item.outcome + "' data-outcomename='" + item.outcome + "' data-lift='" +
        item.lift + "' data-count='" + counts[item.id] + "' data-id='" +
        item.id + "' data-name='" + item.name + "' data-cat='" + item.category_id +
        "' data-catname='" + item.category + "'>" +
        lift_icon(item.lift) +
        "<span class=\"item-pill " + childrenClass + "\">" + item.name + "</span>" +
        lift_text(item.lift) + "</li>";
    }
    itemList += "</ul>";
    $cat.parent().append(itemList);
    $cat.parent().find(".item-pill").on('click', expandRule);
    $('.child', $cat.closest("td")).hide();
    $cat.parent().find(".child").show();
    $('.cat-spinner').hide();
  });
};

var _renderPagination = function _renderPagination(meta) {
  var _this = this;
  var $cat = $(this);
  $('.pager', $(this).closest("td")).hide();
  $('.pager', $(this).parent()).show();

  var current = meta.current_page;
  var total = meta.pages_total;

  $cat.data("current_page", current);
  $cat.data("total_pages", total);

  if (meta.pages_total > 1 && $cat.parent().find(".pager").length === 0) {
    // add prev / next arrows
    var pager = "<span class='pager'>";
    pager += "<span class='first fa fa-fast-backward'></span>";
    pager += "<span class='prev fa fa-step-backward'></span>";
    pager += "<span class='next fa fa-step-forward'></span>";
    pager += "<span class='last fa fa-fast-forward'></span>";
    pager += "<span class='track'>(" + current + " of " + total + ")</span>";
    pager += "</span>";

    $cat.parent().append(pager);

    // event bindings
    $('.first', $cat.parent()).on('click', function() {
      if (!$(this).hasClass("active")) return;
      var id = $cat.data("id");
      var depth = $cat.data("depth");
      var current = $cat.data("current_page");
      var rule = ruleItems(depth).map(function(d) { return d.toString(); });

      fetch("items", [id, depth, rule, 1], render.bind(_this, "items"));
    });

    $('.prev', $cat.parent()).on('click', function() {
      if (!$(this).hasClass("active")) return;
      var id = $cat.data("id");
      var depth = $cat.data("depth");
      var current = $cat.data("current_page");
      var rule = ruleItems(depth).map(function(d) { return d.toString(); });

      fetch("items", [id, depth, rule, current - 1], render.bind(_this, "items"));
    });

    $('.next', $cat.parent()).on('click', function() {
      if (!$(this).hasClass("active")) return;
      var id = $cat.data("id");
      var depth = $cat.data("depth");
      var current = $cat.data("current_page");
      var rule = ruleItems(depth).map(function(d) { return d.toString(); });

      fetch("items", [id, depth, rule, current + 1], render.bind(_this, "items"));
    });

    $('.last', $cat.parent()).on('click', function() {
      if (!$(this).hasClass("active")) return;
      var id = $cat.data("id");
      var depth = $cat.data("depth");
      var total = $cat.data("total_pages");
      var rule = ruleItems(depth).map(function(d) { return d.toString(); });

      fetch("items", [id, depth, rule, total], render.bind(_this, "items"));
    });
  }

  $('.track', $cat.parent()).html("(" + current + " of " + total + ")");

  if (current > 1) {
    $('.prev, .first', $cat.parent()).addClass('active');
  } else {
    $('.prev, .first', $cat.parent()).removeClass('active');
  }

  if (current < total) {
    $('.next, .last', $cat.parent()).addClass('active');
  } else {
    $('.next, .last', $cat.parent()).removeClass('active');
  }
};

var expandRule = function() {
  // first, append to the rule
  // then, get render the categories, getting the category rule counts (categoryCallback);
  var $li = $(this).parent();
  var $item = $li.data();
  ruleExplorer.priorCount = $item.count;

  var depth = $(this).closest("td").data("level");
  var rule = ruleExplorer.appendItemToRule($item, depth);

  $("li.item", "td.level-" + depth).removeClass("active-item");
  $("li.cat", "td.level-" + depth).removeClass("active");
  $li.addClass("active-item");

  var ruleString = ruleExplorer.rule.map(function(d) {
    return "<span class=\"item-pill with-cat\">" + d.name + "<small>" + d.catname + "</small></span>";
  });

  var cprob = Math.round((100 * $item.cprob), -1);

  $(".rule-show").html("Transaction containing " + ruleString.join(" and ") +
      " are " + lift($item.lift) + " to contain <span class=\"outcome-text\">" +
      $item.outcomename + "</span><div class=\"sub-text\">" + $item.freq +
      " Occurrences in Training Data. " + cprob + "% Conditional Probability.<div>");

  clearAfter(depth);
  _renderCategories(depth + 1);
};

var storeForm = function storeForm() {
  var opts = {};

  $("input").each(function() {
    localStorage.setItem(this.name, this.value);
    opts[this.name] = this.value;
  });

  return opts;
};


var fillForm = function fillForm() {
  $("input").each(function() {
    this.value = localStorage.getItem(this.name);
  });
};


var progress = function(d, task) {
  var $progress = $(".progress").children();
  var $bar = $($progress[0]);
  var $task = $($progress[1]);
  var current = $bar.val();
  var $overlay = $('.progress-dim');

  // the first clause here prevents it from even showing if it will take
  // less than 3 complete cycles
  if ((current === 0 && d.progress >= 1/3) || d.progress >= 1.0) {
    $progress.hide();
    $overlay.hide();
    $bar.val(0);
    $task.html("");
  } else {
    $bar.val(d.progress);
    $task.html(task);
    $overlay.show();
    $progress.show();
  }
};

var clearAfter = function(depth) {
  if (ruleExplorer.categories.length > 0) {
    $("th.level-" + depth).text("Level " + depth);
  } else {
    $("th.level-" + depth).text("");
  }

  for (var i = depth + 1; i <= 7; i ++) {
    $("td.level-" + i).html("");
    $("th.level-" + i).html("");
  }
};

var ruleItems = function ruleItems(depth) {
  var items = ruleExplorer.rule.map(function(d) { return d.id; });

  if (depth) {
    items = items.slice(0, depth - 1);
  }

  return items;
};

var lift = function(lift){
  var result = "";
  if (lift == 0){
    result = "<span class=\"very-unlikely\">Very Unlikely</span>";
  } else if (lift > 2) {
    result = "<i class=\"fa fa-arrow-circle-up arrow-up\"></i> " +
             Math.round(lift, -1) + "<small>X</small> more likely";
  } else if (lift > 1) {
    result = "<i class=\"fa fa-arrow-circle-up arrow-up\"></i> " +
             Math.round((lift - 1) * 100) + "<small>%</small> more likely";
  } else if (lift < 0.5) {
    // TODO: christopheraltman - be careful here, this rounds it down
    //       to "0X less likely" pretty often. (e.g. if lift = .17)
    result = "<i class=\"fa fa-arrow-circle-down arrow-down\"></i> " +
             Math.round(lift, -1) + "<small>X</small> less likely";
  } else if (lift < 1) {
    result = "<i class=\"fa fa-arrow-circle-down arrow-down\"></i> " +
             Math.round((lift - 1) * 100) + "<small>%</small> less likely";
  } else {
    result = "--";
  }
  return "<span class=\"lift\">" + result + "</span>";
};

var lift_text = function(lift){
  var result = "";
  if (lift == 0){
    result = "<span class=\"very-unlikely\">Very Unlikely</span>";
  } else if (lift > 2) {
    result = Math.round(lift, -1) + "<small>X</small> more likely";
  } else if (lift > 1) {
    result = Math.round((lift - 1) * 100) + "<small>%</small> more likely";
  } else if (lift < 0.5) {
    // TODO: christopheraltman - be careful here, this rounds it down
    //       to "0X less likely" pretty often. (e.g. if lift = .17)
    result = Math.round(lift, -1) + "<small>X</small> less likely";
  } else if (lift < 1) {
    result = Math.round((lift - 1) * 100) + "<small>%</small> less likely";
  } else {
    result = "--";
  }
  return "<span class=\"lift lift-text\">" + result + "</span>";
};

var lift_icon = function(lift){
  var result = "";
  if (lift == 0){
    result = "";
  } else if (lift > 2) {
    result = "<i class=\"fa fa-arrow-circle-up arrow-up\"></i>";
  } else if (lift > 1) {
    result = "<i class=\"fa fa-arrow-circle-up arrow-up\"></i>";
  } else if (lift < 0.5) {
    result = "<i class=\"fa fa-arrow-circle-down arrow-down\"></i>";
  } else if (lift < 1) {
    result = "<i class=\"fa fa-arrow-circle-down arrow-down\"></i>";
  } else {
    result = "--";
  }
  return "<span class=\"lift\">" + result + "</span>";
};


var dots = function(this_impact, max_impact, min_impact){
  var categoryOutcomeImpactPct = (this_impact / max_impact) * 100;

  var _els = [];
  var fullCircles = Math.floor(categoryOutcomeImpactPct / 20);
  for (var x = 0; x < fullCircles; x++) {
    _els.push('<i class="fa fa-circle" aria-hidden="true"></i>')
  }

  var halfCircle = (categoryOutcomeImpactPct % 20) >= 10;
  if (halfCircle) {
    _els.push('<i class="fa fa-adjust aria-hidden="true"></i>')
  }

  var emptyCircles = 5 - fullCircles - halfCircle;
  for (var y = 0; y < emptyCircles; y++) {
    _els.push('<i class="fa fa-circle-o" aria-hidden="true"></i>')
  }

  return _els.reverse().join('');
};

var getStyleRule = function getStyleRule(name) {
  for(var i=0; i<document.styleSheets.length; i++) {
    var ix, sheet = document.styleSheets[i];
    if (sheet.cssRules && sheet.cssRules.length) {
      for (ix=0; ix<sheet.cssRules.length; ix++) {
        if (sheet.cssRules[ix].selectorText === name)
          return sheet.cssRules[ix].style;
      }
    }
  }
  return null;
}

