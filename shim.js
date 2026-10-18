/* Fa funzionare il quaderno fuori da Claude: stessa interfaccia "db" e "sample" che usa la pagina,
   ma i dati stanno in Supabase (con login) e il coach passa dalla funzione "coach". */
(function () {
  var cfg = window.QUADERNO_CONFIG || {};
  var authEl = document.getElementById("auth");
  var form = document.getElementById("auth-form");
  var errEl = document.getElementById("auth-err");
  var configured = cfg.url && cfg.anonKey && cfg.url.indexOf("INSERISCI") === -1;
  var sb = null, uid = null, session = null;
  var cache = {}, listeners = {};

  function rid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5); }
  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function colCache(c) { return cache[c] || (cache[c] = {}); }
  function notify(c) {
    (listeners[c] || []).forEach(function (l) {
      var m = colCache(c);
      l.fn({ docs: Object.keys(m).map(function (id) { return { id: id, data: function () { return JSON.parse(JSON.stringify(m[id])); } }; }) });
    });
  }
  function notifyDoc(c, id) {
    (listeners[c + "/" + id] || []).forEach(function (l) {
      var m = colCache(c);
      l.fn({ exists: id in m, data: function () { return JSON.parse(JSON.stringify(m[id] || {})); } });
    });
  }
  function bump(c, id) { notify(c); notifyDoc(c, id); }

  function load() {
    return sb.from("docs").select("col,id,data").then(function (r) {
      if (r.error) throw fail("load", r.error.message);
      cache = {};
      r.data.forEach(function (row) { colCache(row.col)[row.id] = row.data; });
      Object.keys(listeners).forEach(function (k) { if (k.indexOf("/") === -1) notify(k); else { var p = k.split("/"); notifyDoc(p[0], p[1]); } });
    });
  }
  function live() {
    sb.channel("docs-" + uid).on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: "user_id=eq." + uid }, function (p) {
      var row = p.new && p.new.id ? p.new : p.old; if (!row || !row.col) return;
      if (p.eventType === "DELETE") delete colCache(row.col)[row.id]; else colCache(row.col)[row.id] = p.new.data;
      bump(row.col, row.id);
    }).subscribe();
  }
  function save(c, id, data) {
    colCache(c)[id] = data; bump(c, id);
    return sb.from("docs").upsert({ user_id: uid, col: c, id: id, data: data, updated_at: new Date().toISOString() }).then(function (r) {
      if (r.error) { load(); throw fail("write", r.error.message); }
    });
  }
  function ref(c, id) {
    return {
      id: id,
      set: function (body) { return save(c, id, JSON.parse(JSON.stringify(body))); },
      update: function (patch) { var cur = colCache(c)[id] || {}; return save(c, id, Object.assign({}, cur, JSON.parse(JSON.stringify(patch)))); },
      delete: function () {
        delete colCache(c)[id]; bump(c, id);
        return sb.from("docs").delete().match({ user_id: uid, col: c, id: id }).then(function (r) { if (r.error) { load(); throw fail("write", r.error.message); } });
      },
      onSnapshot: function (fn) { return listen(c + "/" + id, fn, function () { notifyDoc(c, id); }); }
    };
  }
  function listen(key, fn, first) {
    var l = { fn: fn }; (listeners[key] = listeners[key] || []).push(l);
    setTimeout(first, 0);
    return function () { listeners[key] = listeners[key].filter(function (x) { return x !== l; }); };
  }
  var db = {
    collection: function (c) {
      return { doc: function (id) { return ref(c, id || rid()); }, onSnapshot: function (fn) { return listen(c, fn, function () { notify(c); }); } };
    },
    doc: function (path) { var p = path.split("/"); return ref(p[0], p[1]); }
  };

  function parseJson(text) {
    var t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a === -1 || b <= a) throw fail("invalid_json");
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { throw fail("invalid_json"); }
  }
  function sample() { return Promise.reject(fail("not_declared")); }
  sample.json = function (input, opts) {
    opts = opts || {};
    var messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    return sb.auth.getSession().then(function (r) {
      var tok = r.data && r.data.session && r.data.session.access_token;
      if (!tok) throw fail("session_expired");
      return fetch(cfg.url + "/functions/v1/coach", {
        method: "POST", signal: opts.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: cfg.anonKey },
        body: JSON.stringify({ messages: messages, tier: opts.modelTier || "default" })
      });
    }).then(function (res) {
      if (res.status === 401) throw fail("session_expired");
      if (res.status === 429) throw fail("rate_limited");
      if (!res.ok) throw fail("failed");
      return res.json();
    }).then(function (j) { if (!j.text) throw fail("empty_completion"); return parseJson(j.text); }, function (e) {
      if (e && e.name === "AbortError") throw fail("cancelled");
      throw e;
    });
  };

  var resolveDb, resolveSample, dbP = new Promise(function (r) { resolveDb = r; }), sampleP = new Promise(function (r) { resolveSample = r; });
  window.claude = { use: function (name) { return name === "db" ? dbP : name === "sample" ? sampleP : Promise.resolve(null); } };
  window.QUADERNO_LOGOUT = function () { if (sb) sb.auth.signOut().then(function () { location.reload(); }); };

  function showAuth(msg) { authEl.hidden = false; errEl.textContent = msg || ""; errEl.hidden = !msg; }
  function start() {
    authEl.hidden = true; uid = session.user.id;
    load().then(function () { live(); resolveDb(db); resolveSample(sample); }, function () { resolveDb(null); resolveSample(null); });
  }
  if (!configured) { showAuth("Mancano l'indirizzo e la chiave di Supabase in config.js."); return; }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.getSession().then(function (r) { session = r.data.session; if (session) start(); else showAuth(""); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = form.querySelector("button"); btn.disabled = true;
    sb.auth.signInWithPassword({ email: document.getElementById("auth-email").value.trim(), password: document.getElementById("auth-pass").value }).then(function (r) {
      btn.disabled = false;
      if (r.error) { showAuth("Email o password non corrette."); return; }
      session = r.data.session; start();
    });
  });
})();
