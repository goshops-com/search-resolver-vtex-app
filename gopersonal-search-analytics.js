/* Search Analytics - registers every search's full result set in GoPersonal.
   On a search results page it collects the item ids of ALL pages (not just the
   first) by asking GoPersonal's /search for the whole ranked set, then POSTs them
   to /public/search-result/<projectId>. */
(function () {
  var VARIANT = "{{gs_variantId}}";
  var PROJECT = "6a91a8f3a5da3cc7150a4c03";
  var ENDPOINT = "https://discover.gopersonal.ai/public/search-result/" + PROJECT;
  var SEARCH = "https://search.gopersonal.ai/search";

  // Editable from the panel. parseInt keeps this valid if a placeholder is not resolved.
  var MAX_RESULTS = parseInt("{{MaxResults}}", 10) || 250;

  /* The SDK re-injects this script on every VTEX navigation, so the guard state
     lives on window, keyed by variant, instead of in this closure.
     It holds only the LAST search registered - not a set of every search ever
     seen. A set would make a repeated search (auricular -> mouse -> auricular)
     silently skip its analytic, while the guard only needs to stop the duplicate
     runs of the SAME search caused by re-injection and the retry loops. */
  var KEY = "gp_" + VARIANT + "_searchAnalytics";
  var store = window[KEY] || (window[KEY] = { last: null, running: false });
  // Older page sessions may still carry the previous shape.
  if (!("last" in store)) store.last = null;

  /* Counts page views so that searching the SAME term twice in a row still counts
     twice. Without it the only way to tell a real new search from this script
     being injected again (VTEX re-renders, retry loops) would be the URL, which
     is identical in both cases. The store navigates with pushState, so patch it
     once per page and bump on every navigation. replaceState is left alone: VTEX
     uses it to rewrite the current URL in place, which is not a new search. */
  if (!store.navHooked) {
    store.navHooked = true;
    store.nav = 0;
    var bump = function () {
      store.nav++;
      // Restart the retry burst so a search made after the first one expired is
      // still registered, even if the SDK does not re-inject this script for it.
      if (store.watch) store.watch(-1);
    };
    var pushState = history.pushState;
    if (typeof pushState === "function") {
      history.pushState = function (state, title, url) {
        // Only a push that actually lands somewhere else is a new navigation; VTEX
        // also pushes the current URL back onto the stack while re-rendering, and
        // counting that would re-send the analytic of the search already registered.
        try {
          if (url != null && new URL(url, location.href).href !== location.href) bump();
        } catch (e) { bump(); }
        return pushState.apply(this, arguments);
      };
    }
    window.addEventListener("popstate", bump);
  }

  /* window.gsLog is ALWAYS a function once the SDK loads - it decides internally
     whether to print, from gsConfig.log (which ?_gsLog turns on). So delegate to it
     instead of testing it for truthiness, or every visitor would get these logs. */
  function log() {
    if (typeof window.gsLog === "function") {
      window.gsLog.apply(window, ["[gp-search-analytics]"].concat([].slice.call(arguments)));
    }
  }

  // Compare terms coming from different places (URL path, query string, GraphQL
  // args) without tripping on case, accents, "+"/"-" separators or encoding.
  function norm(s) {
    s = String(s == null ? "" : s);
    try { s = decodeURIComponent(s.replace(/\+/g, " ")); } catch (e) {}
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  /* The term the visitor is looking at RIGHT NOW, read from the URL. On this store
     a search is either /<term>?map=ft (the term sits in the path, aligned with the
     "ft" entries of map) or ?_q=<term>. Returns null on any other page - a category
     or a PDP is not a search and must not be registered. */
  function urlTerm() {
    var params = new URLSearchParams(location.search);
    var q = params.get("_q") || params.get("q") || params.get("ft");
    if (q) return q;
    var map = params.get("map");
    if (!map) return null;
    var segments = location.pathname.replace(/^\/+|\/+$/g, "").split("/");
    var kinds = map.split(",");
    var terms = [];
    for (var i = 0; i < kinds.length; i++) {
      if (kinds[i] === "ft" && segments[i]) terms.push(segments[i]);
    }
    return terms.length ? terms.join(" ") : null;
  }

  /* The store renders results through Apollo (vtex.search-graphql). Its cache key
     carries the exact arguments of the search that produced a page - term, facets,
     sort order and the semantic variant - so replaying them reproduces the same
     engine, ranking and trade policy for every page.
     The cache is read rather than the live query registry, which VTEX tears down
     shortly after render.
     The cache KEEPS the entries of previous searches across SPA navigations, so the
     entry is matched against the term in the current URL; otherwise a second search
     would be registered under the first one's text. Until the new query lands in the
     cache nothing matches and the caller retries. */
  function findSearchArgs() {
    var want = norm(urlTerm());
    if (!want) return null;
    var client = window.__APOLLO_CLIENT__;
    var data = client && client.cache && client.cache.extract && client.cache.extract();
    if (!data) return null;
    var best = null;
    for (var k in data) {
      if (k.indexOf("$ROOT_QUERY.productSearch(") !== 0) continue;
      var open = k.indexOf("(");
      var close = k.indexOf(")@context");
      if (close === -1) close = k.lastIndexOf(")");
      var args;
      try { args = JSON.parse(k.slice(open + 1, close)); } catch (e) { continue; }
      var term = args.fullText || args.query;
      if (!term || norm(term) !== want) continue;
      // Prefer the entry that actually holds rendered products.
      var hasProducts = data[k] && data[k].products && data[k].products.length;
      if (hasProducts) return { args: args, term: String(term) };
      if (!best) best = { args: args, term: String(term) };
    }
    return best;
  }

  /* return_all_ids answers every ranked id in one call, so the result set is not
     walked page by page through the store; page_size 1 skips the hit payloads. */
  function collectAllIds(args) {
    return fetch(SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: PROJECT,
        query: args.fullText || args.query,
        limit: MAX_RESULTS,
        page_size: 1,
        return_all_ids: true
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var ids = [], seen = {};
        var found = (j && j.product_ids) || [];
        for (var i = 0; i < found.length; i++) {
          var id = String(found[i]);
          if (!seen[id]) { seen[id] = 1; ids.push(id); }
        }
        return ids;
      });
  }

  /* Early in the SDK's lifecycle getSession() returns the session object directly
     instead of a promise, so normalise it before chaining. */
  function getSession() {
    return Promise.resolve(window.gsSDK.getSession());
  }

  function send(term, ids) {
    return getSession().then(function (session) {
      if (!session || !session.sessionId) throw new Error("session not ready");
      var payload = {
        text: term,
        customer_id: session && session.vuuid,
        session_id: session && session.sessionId,
        results: ids
      };
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        log("sent", term, ids.length, "items ->", r.status);
        return r.status;
      });
    });
  }

  function run(attempt) {
    // A collection for a previous search may still be walking its pages. Wait for
    // it instead of giving up, or a quick second search would never be registered.
    if (store.running) return watch(attempt);
    if (!window.gsSDK || !window.gsSDK.getSession) return watch(attempt);

    /* Read the term from the URL before touching Apollo: it is the cheap check,
       and it keeps the idle ticks from extracting the whole cache while the
       visitor sits on a search that is already registered. */
    var term = norm(urlTerm());
    if (!term) return watch(attempt);

    /* One send per search, where a "search" is the term plus the navigation that
       brought it up. Repeating an earlier term (auricular -> mouse -> auricular) is
       therefore a NEW search and gets its own analytic. Collapsed instead are the
       extra runs of the search already registered: re-injection on re-render, this
       poll loop, and the burst of pushStates VTEX fires while settling the results
       URL (/x?_q=x then /x?_q=x&map=ft) - hence the short time guard on top of the
       counter, since those land under different nav values.
       2s is far below the time a person needs to type and submit another search. */
    var now = Date.now();
    var last = store.last;
    if (last && last.term === term && (last.nav === store.nav || now - last.at < 2000)) return watch(attempt);

    var found = findSearchArgs();
    if (!found) return watch(attempt);

    var entry = { term: term, nav: store.nav, at: now };
    store.last = entry;
    store.running = true;

    collectAllIds(found.args)
      .then(function (ids) {
        if (!ids.length) { log("no results for", found.term); return; }
        return send(found.term, ids);
      })
      .catch(function (e) {
        if (store.last === entry) store.last = null;   // allow a later retry on this page
        log("failed", e && e.message);
      })
      .then(function () { store.running = false; });
  }

  /* The search results (and their Apollo cache entry) only exist once the page has
     rendered, which on VTEX IO happens well after this script runs, so each attempt
     polls every 500ms for up to ~60s and then stops - no permanent timer on the
     store. A burst is single-flighted on window so the successive injections of this
     script, plus the navigations, never stack timers. */
  function watch(attempt) {
    if (attempt >= 120) return;
    if (store.timer) clearTimeout(store.timer);
    store.timer = setTimeout(function () {
      store.timer = null;
      run(attempt + 1);
    }, 500);
  }

  // Every navigation restarts the burst: on this SPA a later search does not
  // necessarily re-inject the script, so the previous burst is what has to catch it.
  store.watch = watch;
  watch(-1);
})();


