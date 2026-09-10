/* CMS panel za Flatgrid Studio.
 *
 * Jedan tip stavke: projekat. Zivi kao content/work/<slug>.md, a
 * scripts/build.mjs iz njega pravi project-<slug>.html i upisuje ga u
 * work.html (reel). Panel nikad ne dira HTML direktno — samo Markdown.
 *
 * Dva nacina rada, panel sam bira:
 *
 *   LOKALNO   localhost / 127.0.0.1 — prica sa scripts/dev-server.mjs,
 *             pise pravo u fajlove na disku i odmah pokrene build.
 *             Nema logina, nema GitHub-a. Ovo je nacin za rad na svom
 *             racunaru: `npm run dev`, pa /admin.
 *
 *   GITHUB    bilo koji drugi host — prijava GitHub OAuth popupom, svaka
 *             objava je jedan commit (slike, .md, sve zajedno), a hosting
 *             posle toga sam pokrene build. Prijavu opsluzuje ili
 *             api/auth.js + api/callback.js (Vercel), ili Netlify-jev
 *             OAuth posrednik — vidi CMS_CONFIG.oauthUrl.
 *
 * Rezim se moze naterati rucno: /admin?mode=local ili /admin?mode=github.
 */

(function () {
  "use strict";

  var CFG = window.CMS_CONFIG || {};
  var TOKEN_KEY = "flatgrid-cms-token";

  var params = new URLSearchParams(location.search);
  var forced = params.get("mode");
  var IS_LOCAL =
    forced === "local" ||
    (forced !== "github" &&
      (location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.protocol === "file:"));

  /* ------------------------------------------------------------ helpers */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "style") node.setAttribute("style", value);
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
        else if (key in node && key !== "list" && key !== "type") node[key] = value;
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function svg(paths, width) {
    return (
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="' + (width || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      "</svg>"
    );
  }

  var ICONS = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    sort: svg('<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>'),
    filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
    dots: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
    grip: svg('<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
    database: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    chevronDown: svg('<path d="m6 9 6 6 6-6"/>', 2),
    up: svg('<path d="m6 15 6-6 6 6"/>', 2),
    down: svg('<path d="m6 9 6 6 6-6"/>', 2),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9S14.5 18.3 12 21c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3Z"/>'),
    play: svg('<path d="M8 5.5v13l10-6.5-10-6.5Z"/>'),
    logout: svg('<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 16l4-4-4-4M20 12H10"/>'),
  };

  var LOGO = '<img class="logo" src="/assets/logo-mark.png" alt="Flatgrid Studio">';

  function toast(message, isError) {
    var host = document.querySelector(".toasts");
    if (!host) {
      host = el("div", { class: "toasts" });
      document.body.appendChild(host);
    }
    var node = el("div", { class: "toast" + (isError ? " toast--error" : ""), text: message });
    host.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, isError ? 9000 : 4000);
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đ]/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function b64decode(b64) {
    var binary = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

  function parseMarkdown(text) {
    var match = FRONTMATTER.exec(text || "");
    if (!match) return {};
    try {
      return window.jsyaml.load(match[1]) || {};
    } catch (err) {
      console.error("Neispravan frontmatter", err);
      return {};
    }
  }

  function stringifyMarkdown(data) {
    return "---\n" + window.jsyaml.dump(data, { lineWidth: -1, noRefs: true }) + "---\n";
  }

  function isVideoPath(value) {
    return /\.(mp4|webm|mov|m4v)$/i.test(String(value || ""));
  }

  /* ------------------------------------------------------- store: lokalno */

  // Prica sa scripts/dev-server.mjs. Upisuje pravo u fajlove i pokrene build,
  // pa se izmena vidi na sajtu cim se stranica osvezi.
  function LocalStore() {}

  LocalStore.prototype.user = function () {
    return Promise.resolve({ login: "lokalno", avatar_url: "" });
  };

  LocalStore.prototype.load = function () {
    return fetch("/api/local/list", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Dev server ne odgovara (" + res.status + ").");
        return res.json();
      })
      .then(function (files) {
        return files.map(function (file) {
          return fromFrontmatter(parseMarkdown(file.text), file.path);
        });
      })
      .catch(function (err) {
        throw new Error(
          err.message +
            " Pokreni `npm run dev` iz korena projekta i otvori panel preko " +
            "http://localhost:5178/admin/, ne dvoklikom na fajl."
        );
      });
  };

  LocalStore.prototype.commit = function (message, files) {
    if (!files.length) return Promise.resolve();
    return fetch("/api/local/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, files: files }),
    }).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok || !json.ok) throw new Error(json.error || "Upis nije uspeo.");
        return json;
      });
    });
  };

  /* ------------------------------------------------------- store: GitHub */

  function GitHubStore(token) {
    this.token = token;
  }

  GitHubStore.prototype.api = function (url, options) {
    var opts = options || {};
    var headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + this.token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (opts.body) headers["Content-Type"] = "application/json";

    // Bez no-store browser servira kesiran odgovor, pa se posle objave
    // projekat otvori sa starim sadrzajem dok se panel ne osvezi.
    return fetch("https://api.github.com" + url, {
      method: opts.method || "GET",
      headers: headers,
      cache: "no-store",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 404 && !opts.required) return null;
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        throw new Error("GitHub prijava je istekla — uloguj se ponovo.");
      }
      if (res.status === 204) return null;
      return res.json().then(function (json) {
        if (!res.ok) throw new Error((json && json.message) || "GitHub API " + res.status);
        return json;
      });
    });
  };

  GitHubStore.prototype.repoPath = function (file) {
    return "/repos/" + CFG.repo + "/contents/" + file.split("/").map(encodeURIComponent).join("/");
  };

  GitHubStore.prototype.readFile = function (file) {
    return this.api(this.repoPath(file) + "?ref=" + encodeURIComponent(CFG.branch)).then(function (res) {
      return res ? b64decode(res.content) : null;
    });
  };

  GitHubStore.prototype.user = function () {
    return this.api("/user", { required: true });
  };

  // Jedan commit za proizvoljno mnogo fajlova — slike i .md idu zajedno, pa
  // hosting pravi jedan build umesto jednog po fajlu.
  GitHubStore.prototype.commit = function (message, files) {
    var self = this;
    var repo = "/repos/" + CFG.repo;
    var ref = "heads/" + CFG.branch;

    if (!files.length) return Promise.resolve();

    return this.api(repo + "/git/ref/" + ref, { required: true })
      .then(function (refData) {
        var baseSha = refData.object.sha;
        return self.api(repo + "/git/commits/" + baseSha, { required: true }).then(function (c) {
          return { baseSha: baseSha, baseTree: c.tree.sha };
        });
      })
      .then(function (base) {
        var blobs = files.map(function (file) {
          if (file.remove) {
            return Promise.resolve({ path: file.path, mode: "100644", type: "blob", sha: null });
          }
          return self
            .api(repo + "/git/blobs", {
              method: "POST",
              required: true,
              body: { content: file.base64, encoding: "base64" },
            })
            .then(function (blob) {
              return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
            });
        });

        return Promise.all(blobs).then(function (tree) {
          return self
            .api(repo + "/git/trees", {
              method: "POST",
              required: true,
              body: { base_tree: base.baseTree, tree: tree },
            })
            .then(function (newTree) {
              return self.api(repo + "/git/commits", {
                method: "POST",
                required: true,
                body: { message: message, tree: newTree.sha, parents: [base.baseSha] },
              });
            })
            .then(function (newCommit) {
              return self.api(repo + "/git/refs/" + ref, {
                method: "PATCH",
                required: true,
                body: { sha: newCommit.sha },
              });
            });
        });
      });
  };

  GitHubStore.prototype.load = function () {
    var self = this;
    return this.api(this.repoPath(CFG.contentDir) + "?ref=" + encodeURIComponent(CFG.branch)).then(
      function (entries) {
        var files = (entries || []).filter(function (entry) {
          return entry.type === "file" && /\.md$/i.test(entry.name);
        });
        return Promise.all(
          files.map(function (entry) {
            return self.readFile(entry.path).then(function (text) {
              return fromFrontmatter(parseMarkdown(text), entry.path);
            });
          })
        );
      }
    );
  };

  /* --------------------------------------------------------- item mapping */

  var uid = 0;

  function nextKey() {
    uid += 1;
    return "item-" + uid;
  }

  function asList(value) {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter(function (v) {
      return v !== null && v !== undefined;
    });
  }

  // Frontmatter -> objekat kakav editor ocekuje. Sva polja postoje uvek, i
  // prazna, da editor ne mora svuda da proverava da li ih ima.
  function fromFrontmatter(data, path) {
    return {
      key: nextKey(),
      path: path,
      isNew: false,
      title: data.title || "",
      slug: data.slug || "",
      status: data.status === "Draft" ? "Draft" : "Live",
      order: Number(data.order) || 0,
      year: data.year ? String(data.year) : "",
      line: data.line || "",
      disciplines: asList(data.disciplines).map(String),
      timeline: data.timeline || "",
      client: data.client || "",
      summary: data.summary || "",
      lead: data.lead || "",
      metaDescription: data.meta_description || "",
      cover: data.cover || "",
      coverAlt: data.cover_alt || "",
      thumb: data.thumb || "",
      noindex: !!data.noindex,
      blocks: asList(data.blocks).map(function (block) {
        return {
          type: block.type === "chapter" || block.type === "empty" ? block.type : "plate",
          src: block.src || "",
          alt: block.alt || "",
          label: block.label || "",
          head: block.head || "",
          text: block.text || "",
        };
      }),
    };
  }

  // Nazad u frontmatter. Prazna polja se izostavljaju da .md ostane citljiv
  // i onome ko ga otvori u editoru umesto u panelu.
  function toFrontmatter(item) {
    var data = {
      title: item.title,
      slug: item.slug,
      status: item.status,
      order: Number(item.order) || 0,
      year: item.year,
      line: item.line,
      disciplines: item.disciplines.filter(Boolean),
      timeline: item.timeline,
      client: item.client,
      summary: item.summary,
      lead: item.lead,
      meta_description: item.metaDescription,
      cover: item.cover,
      cover_alt: item.coverAlt,
      thumb: item.thumb,
    };
    if (item.noindex) data.noindex = true;

    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value === "" || value === null || value === undefined) delete data[key];
      if (Array.isArray(value) && !value.length) delete data[key];
    });

    data.blocks = item.blocks
      .map(function (block) {
        if (block.type === "chapter") {
          return { type: "chapter", label: block.label, head: block.head, text: block.text };
        }
        if (block.type === "empty") return { type: "empty", label: block.label };
        if (!block.src) return null;
        return { type: "plate", src: block.src, alt: block.alt };
      })
      .filter(Boolean);

    return stringifyMarkdown(data);
  }

  function emptyItem() {
    return {
      key: nextKey(),
      path: null,
      isNew: true,
      title: "",
      slug: "",
      status: "Draft",
      order: (state.items.length + 1) * 1,
      year: String(new Date().getFullYear()),
      line: "",
      disciplines: ["", "", ""],
      timeline: "",
      client: "",
      summary: "",
      lead: "",
      metaDescription: "",
      cover: "",
      coverAlt: "",
      thumb: "",
      noindex: false,
      blocks: [
        { type: "plate", src: "", alt: "", label: "", head: "", text: "" },
        { type: "empty", src: "", alt: "", label: "Image 02", head: "", text: "" },
      ],
    };
  }

  /* --------------------------------------------------------------- state */

  var state = {
    store: null,
    user: null,
    items: [],
    view: "list",
    selectedKey: null,
    draft: null,
    original: null,
    dirty: false,
    saving: false,
    query: "",
    statusFilter: "all",
    sortBy: "manual",
    sortDir: "asc",
    // Upload-i cekaju u memoriji do Publish-a, da sve ode u jedan commit.
    // putanja -> { base64, previewUrl }
    staged: {},
  };

  var root = document.getElementById("cms-root");

  /* --------------------------------------------------------------- login */

  function renderLogin(errorMessage) {
    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "login" }, [
        el("div", { class: "login__card" }, [
          el("div", { html: LOGO, class: "login__logo" }),
          el("h1", { text: "Flatgrid CMS" }),
          el("p", {
            text:
              "Prijavi se GitHub nalogom koji ima pristup repozitorijumu " +
              CFG.repo +
              ". Svaka objava je commit, hosting posle toga sam ponovo napravi sajt.",
          }),
          el("button", { class: "btn btn--primary", onclick: startLogin }, ["Login with GitHub"]),
          errorMessage ? el("p", { class: "login__error", text: errorMessage }) : null,
        ]),
      ])
    );
  }

  function startLogin() {
    var width = 1000;
    var height = 700;
    var left = window.screenX + (window.outerWidth - width) / 2;
    var top = window.screenY + (window.outerHeight - height) / 2;
    // Vercel: sopstvene funkcije u api/. Netlify: njihov OAuth posrednik,
    // koji govori isti postMessage jezik. Bira se u admin/index.html.
    var authUrl = CFG.oauthUrl || "/api/auth";
    var popup = window.open(
      authUrl,
      "flatgrid-cms-auth",
      "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top
    );
    if (!popup) {
      renderLogin("Browser je blokirao popup — dozvoli popup za ovaj sajt pa probaj ponovo.");
      return;
    }

    function onMessage(event) {
      if (typeof event.data !== "string") return;
      if (event.data === "authorizing:github") {
        popup.postMessage(event.data, event.origin);
        return;
      }
      var match = /^authorization:github:(success|error):([\s\S]+)$/.exec(event.data);
      if (!match) return;
      window.removeEventListener("message", onMessage);
      try {
        popup.close();
      } catch (err) {
        /* vec zatvoren */
      }
      var payload = JSON.parse(match[2]);
      if (match[1] === "error" || !payload.token) {
        renderLogin(payload.message || "Prijava nije uspela.");
        return;
      }
      localStorage.setItem(TOKEN_KEY, payload.token);
      boot(payload.token);
    }

    window.addEventListener("message", onMessage);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  /* ---------------------------------------------------------------- boot */

  function boot(token) {
    state.store = IS_LOCAL ? new LocalStore() : new GitHubStore(token);
    root.innerHTML = "";
    root.appendChild(el("div", { class: "empty", text: "Ucitavanje…" }));

    state.store
      .user()
      .then(function (user) {
        state.user = user;
        return state.store.load();
      })
      .then(function (items) {
        state.items = items.sort(function (a, b) {
          return (a.order || 999) - (b.order || 999);
        });
        render();
      })
      .catch(function (err) {
        console.error(err);
        if (IS_LOCAL) {
          root.innerHTML = "";
          root.appendChild(
            el("div", { class: "login" }, [
              el("div", { class: "login__card" }, [
                el("h1", { text: "Dev server nije pokrenut" }),
                el("p", { text: err.message }),
              ]),
            ])
          );
          return;
        }
        renderLogin(err.message);
      });
  }

  /* -------------------------------------------------------------- derive */

  function visibleItems() {
    var query = state.query.trim().toLowerCase();
    var rows = state.items.filter(function (item) {
      if (state.statusFilter !== "all" && item.status !== state.statusFilter) return false;
      if (!query) return true;
      return (
        item.title.toLowerCase().indexOf(query) >= 0 ||
        item.slug.toLowerCase().indexOf(query) >= 0 ||
        item.summary.toLowerCase().indexOf(query) >= 0
      );
    });

    rows.sort(function (a, b) {
      if (state.sortBy === "manual") return (a.order || 999) - (b.order || 999);
      var x = state.sortBy === "year" ? Number(a.year || 0) : a.title.toLowerCase();
      var y = state.sortBy === "year" ? Number(b.year || 0) : b.title.toLowerCase();
      if (x < y) return state.sortDir === "asc" ? -1 : 1;
      if (x > y) return state.sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function findItem(key) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].key === key) return state.items[i];
    }
    return null;
  }

  // Sta panel prikazuje kao pregled slike. Fajl koji ceka objavu ima svoj data
  // URL u memoriji. Lokalno se sve cita sa diska preko dev servera. Na GitHub
  // rezimu se vec objavljena slika cita sa raw.githubusercontent — na sajtu je
  // nema dok se build ne zavrsi, pa bi pregled bio prazan nekoliko minuta.
  function displaySrc(src) {
    var staged = state.staged[src];
    if (staged) return staged.previewUrl;
    if (!src) return "";
    if (IS_LOCAL) return "/" + src.replace(/^\//, "");
    return "https://raw.githubusercontent.com/" + CFG.repo + "/" + CFG.branch + "/" + src.replace(/^\//, "");
  }

  function siteUrlFor(slug) {
    return CFG.siteUrl.replace(/\/$/, "") + "/project-" + (slug || "") + ".html";
  }

  /* -------------------------------------------------------------- render */

  function render() {
    var scroller = root.querySelector(".table-wrap, .editor");
    var scrollTop = scroller ? scroller.scrollTop : 0;

    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "app" }, [
        IS_LOCAL ? renderBanner() : null,
        renderTopbar(),
        el("div", { class: "body" }, [renderSidebar(), renderMain()]),
      ])
    );

    var next = root.querySelector(".table-wrap, .editor");
    if (next) next.scrollTop = scrollTop;
  }

  function renderBanner() {
    return el("div", {
      class: "banner",
      html:
        "<b>LOKALNI REZIM</b> — izmene se upisuju pravo u fajlove na disku i " +
        "build se pokrece odmah. Kad zavrsis, uradi <b>git commit</b> i " +
        "<b>git push</b> da ode na sajt.",
    });
  }

  function renderTopbar() {
    var right = [];

    if (state.view === "detail") {
      right.push(
        el("span", {
          class: "savestate" + (state.dirty ? " is-dirty" : ""),
          text: state.saving ? "Objavljujem…" : state.dirty ? "Nesacuvano" : "Saved",
        })
      );
      right.push(
        el(
          "button",
          { class: "btn btn--primary", disabled: !state.dirty || state.saving, onclick: publishDraft },
          [IS_LOCAL ? "Sacuvaj" : "Publish"]
        )
      );
    } else {
      right.push(
        el(
          "a",
          {
            class: "btn",
            href: IS_LOCAL ? "/work.html" : CFG.siteUrl + "/work.html",
            target: "_blank",
            rel: "noopener",
          },
          [el("span", { html: ICONS.play }), el("span", { text: "View site" })]
        )
      );
    }

    if (state.user && state.user.avatar_url) {
      right.unshift(el("img", { class: "avatar", src: state.user.avatar_url, alt: state.user.login }));
    }
    if (!IS_LOCAL) {
      right.unshift(
        el("button", { class: "icon-btn", title: "Odjavi se", onclick: logout }, [
          el("span", { html: ICONS.logout }),
        ])
      );
    }

    return el("header", { class: "topbar" }, [
      el("div", { class: "topbar__left" }, [
        el("span", { html: LOGO }),
        el("span", { class: "chip" }, [
          el("span", { text: "CMS" }),
          el("span", { class: "chip__sep" }),
          el("span", { text: IS_LOCAL ? "lokalno" : CFG.repo }),
        ]),
        state.view === "detail"
          ? el("button", { class: "icon-btn", title: "Nazad na listu", onclick: closeEditor }, [
              el("span", { html: ICONS.close }),
            ])
          : null,
      ]),
      el("div", { class: "topbar__right" }, right),
    ]);
  }

  function renderSidebar() {
    var tabs = el("nav", { class: "tabs" }, [el("button", { class: "tab is-active" }, ["Collections"])]);

    if (state.view === "detail") {
      var rail = el(
        "div",
        { class: "sidebar__list" },
        visibleItems().map(function (item) {
          return el(
            "button",
            {
              class: "rail__item" + (item.key === state.selectedKey ? " is-active" : ""),
              onclick: function () {
                openItem(item.key);
              },
            },
            [el("span", { text: item.title || "Bez naslova" })]
          );
        })
      );
      return el("aside", { class: "sidebar" }, [tabs, rail]);
    }

    return el("aside", { class: "sidebar" }, [
      tabs,
      el("div", { class: "sidebar__search" }, [
        el("span", { html: ICONS.search }),
        el("input", {
          type: "search",
          placeholder: "Search...",
          value: state.query,
          oninput: function (event) {
            state.query = event.target.value;
            refreshTable();
          },
        }),
      ]),
      el("div", { class: "sidebar__list" }, [
        el("button", { class: "collection is-active" }, [
          el("span", { html: ICONS.database }),
          el("span", { text: "Projekti" }),
          el("span", { class: "collection__count", text: String(state.items.length) }),
        ]),
        el("button", { class: "collection collection--add", onclick: createItem }, [
          el("span", { html: ICONS.plus }),
          el("span", { text: "Add..." }),
        ]),
      ]),
    ]);
  }

  function renderMain() {
    if (state.view === "detail") return el("main", { class: "main" }, [renderEditor()]);
    return el("main", { class: "main" }, [renderToolbar(), renderTable()]);
  }

  function renderToolbar() {
    return el("div", { class: "toolbar" }, [
      el("button", { class: "icon-btn", title: "Novi projekat", onclick: createItem }, [
        el("span", { html: ICONS.plus }),
      ]),
      el(
        "button",
        {
          class: "icon-btn" + (state.sortBy !== "manual" ? " is-active" : ""),
          title: "Sortiraj",
          onclick: function (event) {
            openSortMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.sort })]
      ),
      el(
        "button",
        {
          class: "icon-btn" + (state.statusFilter !== "all" ? " is-active" : ""),
          title: "Filtriraj",
          onclick: function (event) {
            openFilterMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.filter })]
      ),
      el("div", { class: "toolbar__search" }, [
        el("input", {
          type: "search",
          placeholder: "Search items...",
          value: state.query,
          oninput: function (event) {
            state.query = event.target.value;
            refreshTable();
          },
        }),
      ]),
      el("div", { class: "toolbar__spacer" }),
      el(
        "button",
        {
          class: "icon-btn",
          title: "Vise",
          onclick: function (event) {
            openMoreMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.dots })]
      ),
    ]);
  }

  function refreshTable() {
    var main = root.querySelector(".main");
    var old = main && main.querySelector(".table-wrap");
    if (!old) return render();
    main.replaceChild(renderTable(), old);
    var counter = root.querySelector(".collection__count");
    if (counter) counter.textContent = String(state.items.length);
  }

  function renderTable() {
    var rows = visibleItems();

    var head = el("thead", {}, [
      el("tr", {}, [
        el("th", { class: "col-handle" }),
        el("th", { class: "col-title", text: "Naslov" }),
        el("th", { class: "col-status", text: "Status" }),
        el("th", { class: "col-slug", text: "Slug" }),
        el("th", { class: "col-text", text: "Opis (Work lista)" }),
        el("th", { class: "col-year", text: "Godina" }),
        el("th", { class: "col-actions" }),
      ]),
    ]);

    var body = el(
      "tbody",
      {},
      rows.map(function (item) {
        return el("tr", {}, [
          el("td", { class: "col-handle" }, [
            el("div", { class: "handle-cell" }, [
              el("span", { class: "grip", html: ICONS.grip }),
              el("span", { class: "order", text: String(item.order || "–") }),
            ]),
          ]),
          el("td", {
            class: "col-title cell-title",
            text: item.title || "Bez naslova",
            onclick: function () {
              openItem(item.key);
            },
          }),
          el("td", { class: "col-status" }, [statusPill(item)]),
          el("td", { class: "col-slug", text: item.slug }),
          el("td", { class: "col-text", text: item.summary }),
          el("td", { class: "col-year", text: item.year }),
          el("td", { class: "col-actions" }, [
            el(
              "button",
              {
                class: "icon-btn",
                onclick: function (event) {
                  openRowMenu(event.currentTarget, item);
                },
              },
              [el("span", { html: ICONS.dots })]
            ),
          ]),
        ]);
      })
    );

    return el("div", { class: "table-wrap" }, [
      el("table", { class: "table" }, [head, body]),
      rows.length
        ? null
        : el("div", {
            class: "empty",
            text: state.items.length
              ? "Nijedan projekat ne odgovara pretrazi."
              : "Jos nema projekata — klikni + da dodas prvi.",
          }),
    ]);
  }

  function statusPill(item) {
    var isLive = item.status === "Live";
    return el(
      "button",
      {
        class: "pill " + (isLive ? "pill--live" : "pill--draft"),
        onclick: function (event) {
          openStatusMenu(event.currentTarget, item);
        },
      },
      [el("span", { text: item.status }), el("span", { html: ICONS.chevronDown })]
    );
  }

  /* --------------------------------------------------------------- menus */

  function openMenu(anchor, children) {
    closeMenu();
    var rect = anchor.getBoundingClientRect();
    var menu = el("div", { class: "menu" }, children);
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    var top = rect.bottom + 6;
    if (top + menu.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menu.offsetHeight - 6);
    }
    menu.style.top = top + "px";
    menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + "px";
    menu.style.visibility = "visible";

    function onOutside(event) {
      if (!menu.contains(event.target)) closeMenu();
    }
    menu._onOutside = onOutside;
    setTimeout(function () {
      document.addEventListener("mousedown", onOutside);
    }, 0);
  }

  function closeMenu() {
    var menu = document.querySelector(".menu");
    if (!menu) return;
    if (menu._onOutside) document.removeEventListener("mousedown", menu._onOutside);
    menu.remove();
  }

  function menuItem(label, onClick, extraClass) {
    return el(
      "button",
      {
        class: extraClass || "",
        onclick: function () {
          closeMenu();
          onClick();
        },
      },
      [label]
    );
  }

  function openStatusMenu(anchor, item) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Status" }),
      menuItem("Live", function () {
        setStatus(item, "Live");
      }),
      menuItem("Draft (pauza)", function () {
        setStatus(item, "Draft");
      }),
    ]);
  }

  function openSortMenu(anchor) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Sortiraj po" }),
      menuItem("Redosled na sajtu", function () {
        state.sortBy = "manual";
        render();
      }),
      menuItem("Naslov A→Z", function () {
        state.sortBy = "title";
        state.sortDir = "asc";
        render();
      }),
      menuItem("Godina, novije prvo", function () {
        state.sortBy = "year";
        state.sortDir = "desc";
        render();
      }),
    ]);
  }

  function openFilterMenu(anchor) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Status" }),
      menuItem("Sve", function () {
        state.statusFilter = "all";
        render();
      }),
      menuItem("Samo Live", function () {
        state.statusFilter = "Live";
        render();
      }),
      menuItem("Samo Draft", function () {
        state.statusFilter = "Draft";
        render();
      }),
    ]);
  }

  function openMoreMenu(anchor) {
    openMenu(anchor, [
      menuItem(IS_LOCAL ? "Osvezi sa diska" : "Osvezi iz repozitorijuma", reload),
      menuItem("Otvori Work stranicu", function () {
        window.open(IS_LOCAL ? "/work.html" : CFG.siteUrl + "/work.html", "_blank", "noopener");
      }),
    ]);
  }

  function openRowMenu(anchor, item) {
    openMenu(anchor, [
      menuItem("Otvori", function () {
        openItem(item.key);
      }),
      menuItem("Otvori stranicu", function () {
        window.open(
          IS_LOCAL ? "/project-" + item.slug + ".html" : siteUrlFor(item.slug),
          "_blank",
          "noopener"
        );
      }),
      el("div", { class: "menu__sep" }),
      menuItem(
        "Obrisi projekat",
        function () {
          deleteItem(item);
        },
        "btn--danger"
      ),
    ]);
  }

  /* -------------------------------------------------------------- editor */

  function dropUnsavedNew(exceptKey) {
    state.items = state.items.filter(function (item) {
      return !(item.isNew && item.key !== exceptKey);
    });
  }

  function openItem(key) {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(key);
    var item = findItem(key);
    if (!item) return;
    state.selectedKey = key;
    state.draft = JSON.parse(JSON.stringify(item));
    state.original = JSON.parse(JSON.stringify(item));
    while (state.draft.disciplines.length < 3) state.draft.disciplines.push("");
    state.dirty = false;
    state.view = "detail";
    render();
  }

  function closeEditor() {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(null);
    state.view = "list";
    state.draft = null;
    state.original = null;
    state.selectedKey = null;
    state.dirty = false;
    render();
  }

  function createItem() {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(null);
    var item = emptyItem();
    state.items.push(item);
    state.selectedKey = item.key;
    state.draft = JSON.parse(JSON.stringify(item));
    state.original = JSON.parse(JSON.stringify(item));
    state.dirty = true;
    state.view = "detail";
    render();
  }

  // Samo topbar reaguje na dirty stanje; pun re-render bi izbacio fokus iz
  // polja u koje se kuca.
  function markDirty() {
    if (state.dirty) return;
    state.dirty = true;
    var bar = root.querySelector(".topbar");
    if (bar) bar.parentNode.replaceChild(renderTopbar(), bar);
  }

  function bind(field, options) {
    var opts = options || {};
    return function (event) {
      state.draft[field] = event.target.value;
      markDirty();
      if (opts.onChange) opts.onChange();
    };
  }

  function textInput(field, placeholder, options) {
    return el("input", {
      class: "input",
      value: state.draft[field] || "",
      placeholder: placeholder || "",
      oninput: bind(field, options),
    });
  }

  function textArea(field, placeholder, rows) {
    return el("textarea", {
      class: "input input--area",
      rows: rows || 3,
      value: state.draft[field] || "",
      placeholder: placeholder || "",
      oninput: bind(field),
    });
  }

  function renderEditor() {
    var draft = state.draft;
    var fields = [];

    /* ---------------------------------------------------- osnovno */

    fields.push(sectionRow("Osnovno"));

    fields.push(
      fieldRow(
        "Naslov",
        el("input", {
          class: "input",
          value: draft.title,
          placeholder: "Ime projekta",
          oninput: function (event) {
            draft.title = event.target.value;
            // Slug se prati sa naslovom samo dok je projekat nov i slug jos
            // nije rucno diran — postojecem projektu promena sluga menja URL.
            if (draft.isNew && !draft.slugTouched) {
              draft.slug = slugify(event.target.value);
              var input = root.querySelector("[data-slug-input]");
              if (input) input.value = draft.slug;
              updateSlugHint();
            }
            markDirty();
          },
        })
      )
    );

    fields.push(
      fieldRow(
        "Slug (URL)",
        el("input", {
          class: "input",
          value: draft.slug,
          placeholder: "npr. vellor",
          "data-slug-input": "",
          oninput: function (event) {
            draft.slugTouched = true;
            draft.slug = slugify(event.target.value);
            updateSlugHint();
            markDirty();
          },
        }),
        null,
        el("p", { class: "field__hint", "data-slug-hint": "" }, [
          el("span", { html: ICONS.globe }),
          el("span", { text: prettyUrl(draft.slug) }),
        ])
      )
    );

    fields.push(
      fieldRow(
        "Status",
        el(
          "select",
          {
            class: "input",
            value: draft.status,
            onchange: function (event) {
              draft.status = event.target.value;
              markDirty();
            },
          },
          [
            el("option", { value: "Live", selected: draft.status === "Live" }, ["Live"]),
            el("option", { value: "Draft", selected: draft.status === "Draft" }, ["Draft"]),
          ]
        ),
        "Draft projekti se ne generisu i ne prikazuju na Work stranici."
      )
    );

    fields.push(
      fieldRow(
        "Redosled",
        el("input", {
          class: "input",
          type: "number",
          value: String(draft.order || ""),
          oninput: function (event) {
            draft.order = Number(event.target.value) || 0;
            markDirty();
          },
        }),
        "Manji broj ide gore na Work stranici. Odredjuje i koji je „Next project“."
      )
    );

    fields.push(fieldRow("Godina", textInput("year", "2026")));

    /* ---------------------------------------------------- tekst */

    fields.push(sectionRow("Tekst"));

    fields.push(
      fieldRow(
        "Podnaslov",
        textInput("line", "Brand identity for a residential development"),
        "Jedna linija ispod imena projekta na stranici projekta."
      )
    );

    fields.push(
      fieldRow(
        "Opis za Work listu",
        textArea("summary", "Kratak opis koji stoji uz projekat na Work stranici.", 4)
      )
    );

    fields.push(
      fieldRow(
        "Uvodni pasus",
        textArea("lead", "Duzi uvod na samoj stranici projekta.", 4),
        "Ako ostane prazno, koristi se opis za Work listu."
      )
    );

    fields.push(
      fieldRow(
        "SEO opis",
        textArea("metaDescription", "Tekst koji Google prikazuje ispod naslova.", 2),
        "Do ~155 karaktera. Ako ostane prazno, koristi se opis za Work listu."
      )
    );

    /* ---------------------------------------------------- specifikacija */

    fields.push(sectionRow("Specifikacija"));

    fields.push(
      fieldRow(
        "Discipline",
        el(
          "div",
          { class: "list" },
          draft.disciplines
            .map(function (value, index) {
              return el("div", { class: "list__row" }, [
                el("input", {
                  class: "input",
                  value: value,
                  placeholder: "npr. Branding",
                  oninput: function (event) {
                    draft.disciplines[index] = event.target.value;
                    markDirty();
                  },
                }),
                el(
                  "button",
                  {
                    class: "icon-btn",
                    title: "Ukloni",
                    onclick: function () {
                      draft.disciplines.splice(index, 1);
                      markDirty();
                      rerenderEditor();
                    },
                  },
                  [el("span", { html: ICONS.close })]
                ),
              ]);
            })
            .concat([
              el(
                "button",
                {
                  class: "btn btn--ghost",
                  onclick: function () {
                    draft.disciplines.push("");
                    markDirty();
                    rerenderEditor();
                  },
                },
                ["+ Disciplina"]
              ),
            ])
        ),
        "Iste se koriste i na Work listi i u Discipline redu specifikacije."
      )
    );

    fields.push(fieldRow("Timeline", textInput("timeline", "10 weeks")));
    fields.push(fieldRow("Klijent", textInput("client", "Ime klijenta")));

    /* ---------------------------------------------------- slike */

    fields.push(sectionRow("Naslovna fotografija"));

    fields.push(
      fieldRow(
        "Cover (2000 × 1179)",
        mediaSlot(draft, "cover"),
        "Ista slika je i veliki kadar na Work stranici i cover na stranici projekta."
      )
    );

    fields.push(fieldRow("Alt tekst", textInput("coverAlt", "Sta se vidi na fotografiji")));

    fields.push(
      fieldRow(
        "Verzija za telefon",
        mediaSlot(draft, "thumb"),
        "Manja verzija iste fotografije — pozadina kartice na uskim ekranima. Nije obavezna."
      )
    );

    /* ---------------------------------------------------- blokovi */

    fields.push(sectionRow("Ploce i poglavlja"));

    fields.push(
      el("div", { class: "field field--wide" }, [
        el("div", { class: "field__control" }, [
          el("p", { class: "field__hint", text: "Redosled ovde je redosled na stranici. Sve ploce su 2000 × 1250." }),
          el("div", { class: "blocks" }, draft.blocks.map(renderBlock)),
          el("div", { class: "blocks__add" }, [
            el("button", { class: "btn btn--ghost", onclick: function () { addBlock("plate"); } }, ["+ Slika / video"]),
            el("button", { class: "btn btn--ghost", onclick: function () { addBlock("empty"); } }, ["+ Prazan slot"]),
            el("button", { class: "btn btn--ghost", onclick: function () { addBlock("chapter"); } }, ["+ Tekst"]),
          ]),
        ]),
      ])
    );

    return el("div", { class: "editor" }, [el("div", { class: "editor__inner" }, fields)]);
  }

  function addBlock(type) {
    state.draft.blocks.push({
      type: type,
      src: "",
      alt: "",
      label: type === "empty" ? "Image " + String(state.draft.blocks.length + 1).padStart(2, "0") : "",
      head: "",
      text: "",
    });
    markDirty();
    rerenderEditor();
  }

  var BLOCK_LABELS = { plate: "Slika / video", empty: "Prazan slot", chapter: "Tekst" };

  function renderBlock(block, index) {
    var draft = state.draft;

    function move(delta) {
      var target = index + delta;
      if (target < 0 || target >= draft.blocks.length) return;
      var moved = draft.blocks.splice(index, 1)[0];
      draft.blocks.splice(target, 0, moved);
      markDirty();
      rerenderEditor();
    }

    var head = el("div", { class: "block__head" }, [
      el(
        "select",
        {
          class: "input input--slim",
          onchange: function (event) {
            block.type = event.target.value;
            markDirty();
            rerenderEditor();
          },
        },
        Object.keys(BLOCK_LABELS).map(function (type) {
          return el("option", { value: type, selected: block.type === type }, [BLOCK_LABELS[type]]);
        })
      ),
      el("div", { class: "block__tools" }, [
        el("button", { class: "icon-btn", title: "Gore", onclick: function () { move(-1); } }, [
          el("span", { html: ICONS.up }),
        ]),
        el("button", { class: "icon-btn", title: "Dole", onclick: function () { move(1); } }, [
          el("span", { html: ICONS.down }),
        ]),
        el(
          "button",
          {
            class: "icon-btn",
            title: "Ukloni blok",
            onclick: function () {
              draft.blocks.splice(index, 1);
              markDirty();
              rerenderEditor();
            },
          },
          [el("span", { html: ICONS.close })]
        ),
      ]),
    ]);

    var body;

    if (block.type === "empty") {
      body = el("div", { class: "block__body" }, [
        el("input", {
          class: "input",
          value: block.label,
          placeholder: "Image 02",
          oninput: function (event) {
            block.label = event.target.value;
            markDirty();
          },
        }),
        el("p", { class: "field__hint", text: "Ovaj natpis stoji u praznom okviru dok fajl ne stigne." }),
      ]);
    } else if (block.type === "chapter") {
      body = el("div", { class: "block__body" }, [
        el("input", {
          class: "input",
          value: block.label,
          placeholder: "Naslov sekcije — npr. The problem",
          oninput: function (event) {
            block.label = event.target.value;
            markDirty();
          },
        }),
        el("input", {
          class: "input",
          value: block.head,
          placeholder: "Jedna recenica koja to kaze. (moze prazno)",
          oninput: function (event) {
            block.head = event.target.value;
            markDirty();
          },
        }),
        el("textarea", {
          class: "input input--area",
          rows: 5,
          value: block.text,
          placeholder: "Pasusi. Prazan red pravi novi pasus.",
          oninput: function (event) {
            block.text = event.target.value;
            markDirty();
          },
        }),
      ]);
    } else {
      body = el("div", { class: "block__body" }, [
        mediaSlot(block, "src", "any"),
        el("input", {
          class: "input",
          value: block.alt,
          placeholder: "Alt tekst",
          oninput: function (event) {
            block.alt = event.target.value;
            markDirty();
          },
        }),
      ]);
    }

    return el("div", { class: "block" }, [head, body]);
  }

  function rerenderEditor() {
    var main = root.querySelector(".main");
    var old = main && main.querySelector(".editor");
    if (!old) return render();
    var scrollTop = old.scrollTop;
    var next = renderEditor();
    main.replaceChild(next, old);
    next.scrollTop = scrollTop;
  }

  function prettyUrl(slug) {
    return CFG.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") + "/project-" + (slug || "…") + ".html";
  }

  function updateSlugHint() {
    var hint = root.querySelector("[data-slug-hint] span:last-child");
    if (hint) hint.textContent = prettyUrl(state.draft.slug);
  }

  function fieldRow(label, control, hint, extra) {
    return el("div", { class: "field" }, [
      el("div", { class: "field__label", text: label }),
      el("div", { class: "field__control" }, [
        control,
        hint ? el("p", { class: "field__hint", text: hint }) : null,
        extra || null,
      ]),
    ]);
  }

  function sectionRow(label) {
    return el("div", { class: "section" }, [el("span", { text: label })]);
  }

  // owner[field] drzi putanju do fajla. Menja se u mestu da draft ostane jedan
  // objekat — bez toga bi svaka izmena morala da se propagira rucno.
  function mediaSlot(owner, field, kind) {
    var accept = kind === "any" ? "image/*,video/mp4,video/webm" : "image/*";
    var src = owner[field];

    if (!src) {
      return el("div", { class: "media" }, [
        el(
          "button",
          {
            class: "dropzone",
            onclick: function () {
              pickFile(accept, function (file) {
                stageFile(file, owner, field);
              });
            },
          },
          ["Upload"]
        ),
      ]);
    }

    var preview = displaySrc(src);
    return el("div", { class: "media" }, [
      el("div", { class: "thumb" }, [
        isVideoPath(src)
          ? el("video", { src: preview, muted: true, playsinline: true })
          : el("img", { src: preview, alt: owner.alt || "" }),
        el(
          "button",
          {
            class: "thumb__remove",
            title: "Ukloni",
            onclick: function () {
              owner[field] = "";
              markDirty();
              rerenderEditor();
            },
          },
          ["×"]
        ),
      ]),
      el(
        "button",
        {
          class: "dropzone",
          onclick: function () {
            pickFile(accept, function (file) {
              stageFile(file, owner, field);
            });
          },
        },
        ["Zameni"]
      ),
      el("p", { class: "field__hint", text: src }),
    ]);
  }

  function pickFile(accept, onPick) {
    var input = el("input", { type: "file", accept: accept, style: "display:none" });
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) onPick(input.files[0]);
      input.remove();
    });
    input.click();
  }

  // Fajl se ne salje odmah — cuva se u memoriji i ulazi u isti commit kao
  // ostatak izmena kad se klikne Publish.
  function stageFile(file, owner, field) {
    var extension = (file.name.split(".").pop() || "bin").toLowerCase();
    var base = slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
    var target = CFG.mediaFolder + "/" + Date.now().toString(36) + "-" + base + "." + extension;

    var reader = new FileReader();
    reader.onerror = function () {
      toast("Ne mogu da procitam fajl.", true);
    };
    reader.onload = function () {
      var dataUrl = String(reader.result);
      state.staged[target] = { base64: dataUrl.split(",")[1], previewUrl: dataUrl };
      owner[field] = target;
      markDirty();
      rerenderEditor();
    };
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------------- write */

  function pathFor(item) {
    return CFG.contentDir + "/" + item.slug + ".md";
  }

  // Samo one slike koje ovaj projekat zaista koristi. Ako je neko upload-ovao
  // sliku pa je zamenio drugom pre objave, prva se nikad ne posalje.
  function stagedFilesFor(item) {
    var used = {};
    [item.cover, item.thumb].forEach(function (src) {
      if (src) used[src] = true;
    });
    item.blocks.forEach(function (block) {
      if (block.src) used[block.src] = true;
    });
    return Object.keys(used)
      .filter(function (src) {
        return state.staged[src];
      })
      .map(function (src) {
        return { path: src, base64: state.staged[src].base64 };
      });
  }

  function publishDraft() {
    var draft = state.draft;

    if (!draft.title.trim()) return toast("Naslov je obavezan.", true);
    if (!draft.slug.trim()) return toast("Slug je obavezan.", true);

    var clash = state.items.some(function (item) {
      return item.key !== draft.key && item.slug === draft.slug;
    });
    if (clash) return toast("Vec postoji projekat sa slugom „" + draft.slug + "“.", true);

    draft.disciplines = draft.disciplines.filter(function (value) {
      return value.trim();
    });

    var files = stagedFilesFor(draft);
    var newPath = pathFor(draft);
    files.push({ path: newPath, base64: b64encode(toFrontmatter(draft)) });

    // Promenjen slug znaci novi .md fajl — stari se brise u istom commitu, da
    // build ne vidi dva projekta i ne ostavi staru stranicu da visi.
    if (draft.path && draft.path !== newPath) {
      files.push({ path: draft.path, remove: true });
    }

    state.saving = true;
    render();

    state.store
      .commit((draft.isNew ? "CMS: novi projekat " : "CMS: izmena ") + draft.slug, files)
      .then(function () {
        draft.isNew = false;
        draft.path = newPath;
        delete draft.slugTouched;

        var index = state.items.findIndex(function (item) {
          return item.key === draft.key;
        });
        var saved = JSON.parse(JSON.stringify(draft));
        if (index >= 0) state.items[index] = saved;
        else state.items.push(saved);

        state.original = JSON.parse(JSON.stringify(draft));
        state.dirty = false;
        state.saving = false;
        render();
        toast(IS_LOCAL ? "Sacuvano i ponovo izgradjeno." : "Objavljeno. Sajt se gradi.");
      })
      .catch(function (err) {
        console.error(err);
        state.saving = false;
        render();
        toast(err.message, true);
      });
  }

  function setStatus(item, status) {
    if (item.status === status) return;
    if (item.isNew) {
      item.status = status;
      refreshTable();
      return;
    }

    var updated = JSON.parse(JSON.stringify(item));
    updated.status = status;

    state.store
      .commit("CMS: " + item.slug + " -> " + status, [
        { path: pathFor(updated), base64: b64encode(toFrontmatter(updated)) },
      ])
      .then(function () {
        item.status = status;
        refreshTable();
        toast("Status: " + status + ".");
      })
      .catch(function (err) {
        console.error(err);
        toast(err.message, true);
      });
  }

  function deleteItem(item) {
    if (!confirm("Obrisati „" + (item.title || item.slug) + "“? Stranica nestaje sa sajta.")) return;

    if (item.isNew) {
      state.items = state.items.filter(function (row) {
        return row.key !== item.key;
      });
      if (state.selectedKey === item.key) closeEditor();
      else refreshTable();
      return;
    }

    state.store
      .commit("CMS: obrisan " + item.slug, [{ path: item.path, remove: true }])
      .then(function () {
        state.items = state.items.filter(function (row) {
          return row.key !== item.key;
        });
        if (state.selectedKey === item.key) {
          state.view = "list";
          state.draft = null;
          state.selectedKey = null;
          state.dirty = false;
        }
        render();
        toast("Obrisano.");
      })
      .catch(function (err) {
        console.error(err);
        toast(err.message, true);
      });
  }

  function reload() {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    location.reload();
  }

  /* ---------------------------------------------------------------- init */

  window.addEventListener("beforeunload", function (event) {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  if (IS_LOCAL) {
    boot(null);
  } else {
    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved) boot(saved);
    else renderLogin();
  }
})();
