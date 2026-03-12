/* ── Theme ───────────────────────────────────────────────────── */
const $html = document.documentElement;
const $icoSun = document.getElementById("ico-sun");
const $icoMoon = document.getElementById("ico-moon");
const $hljsTheme = document.getElementById("hljs-theme");

function applyTheme(t) {
  $html.dataset.theme = t;
  localStorage.setItem("nd-theme", t);
  const isDark = t === "dark";
  $icoSun.style.display = isDark ? "none" : "block";
  $icoMoon.style.display = isDark ? "block" : "none";
  $hljsTheme.href = isDark
    ? "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css"
    : "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css";
}

const savedTheme =
  localStorage.getItem("nd-theme") ||
  (globalThis.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark");
applyTheme(savedTheme);

document.getElementById("theme-btn").addEventListener("click", () => {
  applyTheme($html.dataset.theme === "dark" ? "light" : "dark");
});

/* ── Terminal animation ──────────────────────────────────────── */
const PROGRESS = [
  "▓░░░░░░░░░░░ 8%",
  "▓▓▓░░░░░░░░░ 25%",
  "▓▓▓▓▓░░░░░░░ 42%",
  "▓▓▓▓▓▓▓░░░░░ 60%",
  "▓▓▓▓▓▓▓▓▓░░░ 78%",
  "▓▓▓▓▓▓▓▓▓▓▓░ 94%",
  "▓▓▓▓▓▓▓▓▓▓▓▓ 100%",
];
const $bar = document.getElementById("t-bar");
const $prog = document.getElementById("t-prog");
const $built = document.getElementById("t-built");
const $br1 = document.getElementById("t-br1");
const $deploy = document.getElementById("t-deploy");
const $br2 = document.getElementById("t-br2");
const $run = document.getElementById("t-run");
const $br3 = document.getElementById("t-br3");
const $cursor = document.getElementById("t-cursor");

function runTermAnim() {
  // Reset
  $prog.style.display = "flex";
  $built.style.display = "none";
  $br1.style.display = "none";
  $deploy.style.display = "none";
  $br2.style.display = "none";
  $run.style.display = "none";
  $br3.style.display = "none";
  $cursor.style.display = "none";

  let i = 0;
  function tick() {
    if (i < PROGRESS.length) {
      $bar.textContent = PROGRESS[i++];
      setTimeout(tick, 320);
    } else {
      $prog.style.display = "none";
      $built.style.display = "flex";
      setTimeout(() => {
        $br1.style.display = "block";
        $deploy.style.display = "flex";
        setTimeout(() => {
          $br2.style.display = "block";
          $run.style.display = "flex";
          $br3.style.display = "block";
          $cursor.style.display = "flex";
          setTimeout(runTermAnim, 3800);
        }, 650);
      }, 520);
    }
  }
  setTimeout(tick, 200);
}
setTimeout(runTermAnim, 900);

/* ── Routing ─────────────────────────────────────────────────── */
function goLanding() {
  document.body.classList.remove(
    "docs",
    "mobile-nav-open",
    "docs-sidebar-open",
  );
  document.getElementById("nav-docs-btn").classList.remove("active");
  document.getElementById("docs-page").classList.remove("active");
  document.getElementById("landing").classList.remove("hidden");
  document.getElementById("mobile-nav-panel")?.classList.remove("open");
  document.getElementById("mobile-nav-backdrop")?.classList.remove("open");
  document.getElementById("docs-sidebar")?.classList.remove("open");
  document
    .getElementById("mobile-nav-panel")
    ?.setAttribute("aria-hidden", "true");
  document
    .getElementById("nav-hamburger")
    ?.setAttribute("aria-expanded", "false");
  history.pushState(null, "", location.pathname);
  window.scrollTo(0, 0);
}

function goDocs(docId) {
  document.body.classList.add("docs");
  document.body.classList.remove("mobile-nav-open", "docs-sidebar-open");
  document.getElementById("nav-docs-btn").classList.add("active");
  document.getElementById("docs-page").classList.add("active");
  document.getElementById("landing").classList.add("hidden");
  document.getElementById("mobile-nav-panel")?.classList.remove("open");
  document.getElementById("mobile-nav-backdrop")?.classList.remove("open");
  document.getElementById("docs-sidebar")?.classList.remove("open");
  document
    .getElementById("mobile-nav-panel")
    ?.setAttribute("aria-hidden", "true");
  document
    .getElementById("nav-hamburger")
    ?.setAttribute("aria-expanded", "false");
  history.pushState(null, "", "#docs/" + docId);
  loadDoc(docId);
  window.scrollTo(0, 0);
}

globalThis.addEventListener("popstate", () => {
  const h = location.hash;
  if (h.startsWith("#docs/") || h === "#docs") {
    const id = h.startsWith("#docs/") ? h.slice(6) : "index";
    document.body.classList.add("docs");
    document.getElementById("nav-docs-btn").classList.add("active");
    document.getElementById("docs-page").classList.add("active");
    document.getElementById("landing").classList.add("hidden");
    loadDoc(id || "index");
  } else {
    document.body.classList.remove("docs");
    document.getElementById("nav-docs-btn").classList.remove("active");
    document.getElementById("docs-page").classList.remove("active");
    document.getElementById("landing").classList.remove("hidden");
  }
});

/* ── Nav wiring ──────────────────────────────────────────────── */
document.getElementById("nav-logo-link").addEventListener("click", (e) => {
  e.preventDefault();
  goLanding();
});
document.getElementById("footer-logo-link").addEventListener("click", (e) => {
  e.preventDefault();
  goLanding();
});
document
  .getElementById("nav-docs-btn")
  .addEventListener("click", () => goDocs("index"));
document.getElementById("nav-features-link").addEventListener("click", (e) => {
  if (document.body.classList.contains("docs")) {
    e.preventDefault();
    goLanding();
    setTimeout(
      () =>
        document
          .getElementById("features")
          ?.scrollIntoView({ behavior: "smooth" }),
      60,
    );
  }
});
document.getElementById("hero-start-btn").addEventListener("click", (e) => {
  e.preventDefault();
  goDocs("getting-started");
});
document.getElementById("hero-docs-btn").addEventListener("click", (e) => {
  e.preventDefault();
  goDocs("index");
});
document.getElementById("cta-start-btn").addEventListener("click", (e) => {
  e.preventDefault();
  goDocs("getting-started");
});

// Footer doc links
document.querySelectorAll("[data-goto-doc]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goDocs(el.dataset.gotoDoc);
  });
});

/* ── Doc map ─────────────────────────────────────────────────── */
// When served locally from project root (landing/ is a subfolder) use ../docs/
// When deployed to GitHub Pages (landing/ is the site root) use docs/
const DOCS_BASE = globalThis.location.pathname.includes("/landing/")
  ? "../docs/"
  : "docs/";

const DOC_MAP = {
  index: DOCS_BASE + "index.md",
  "getting-started": DOCS_BASE + "getting-started.md",
  configuration: DOCS_BASE + "configuration.md",
  architecture: DOCS_BASE + "architecture.md",
  "rpc-protocol": DOCS_BASE + "rpc-protocol.md",
  extension: DOCS_BASE + "extension/README.md",
  daemon: DOCS_BASE + "daemon/README.md",
  contributing: DOCS_BASE + "contributing.md",
};

// Map bare filenames → doc IDs (for link interception)
const FILENAME_TO_ID = {
  "index.md": "index",
  "getting-started.md": "getting-started",
  "configuration.md": "configuration",
  "architecture.md": "architecture",
  "rpc-protocol.md": "rpc-protocol",
  "contributing.md": "contributing",
};

/* ── Markdown rendering ──────────────────────────────────────── */
let tocObserver = null;

marked.use({ gfm: true, breaks: false });

async function loadDoc(docId) {
  const path = DOC_MAP[docId];
  if (!path) return;

  // Sidebar active state
  document.querySelectorAll(".sb-link").forEach((el) => {
    el.classList.toggle("active", el.dataset.doc === docId);
  });

  const $body = document.getElementById("docs-body");
  $body.innerHTML = `<div class="docs-empty">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg><p>Loading…</p></div>`;

  try {
    let md;
    if (location.protocol === "file:" && globalThis.DOCS_BUNDLE?.[docId]) {
      md = globalThis.DOCS_BUNDLE[docId];
    } else {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      md = await res.text();
    }
    $body.innerHTML = marked.parse(md);

    // Intercept internal .md links
    $body.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      if (href.endsWith(".md") || href.includes(".md#")) {
        // Normalize by stripping any leading ./ or ../ sequences, keeping
        // the rest of the path intact (e.g. "daemon/README.md" stays whole).
        const normalized = href.replace(/^(?:\.\.\/|\.\/)+/, "").split("#")[0];
        const id =
          Object.keys(DOC_MAP).find((k) =>
            DOC_MAP[k].endsWith("/" + normalized),
          ) ||
          normalized
            .replace(/\/README\.md$/, "")
            .replace(/\.md$/, "");
        a.setAttribute("href", "#");
        a.addEventListener("click", (e) => {
          e.preventDefault();
          goDocs(id);
        });
      }
    });

    // External links → new tab
    $body.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });

    // Convert bottom ---  + prev/next paragraph into styled nav buttons
    const allHrs = Array.from($body.querySelectorAll("hr"));
    const lastHr = allHrs[allHrs.length - 1];
    if (lastHr) {
      const para = lastHr.nextElementSibling;
      if (para && para.tagName === "P") {
        const navAnchors = Array.from(para.querySelectorAll("a")).filter(
          (a) => a.textContent.includes("\u2190") || a.textContent.includes("\u2192"),
        );
        if (navAnchors.length > 0) {
          const nav = document.createElement("nav");
          nav.className = "docs-page-nav";
          navAnchors.forEach((a) => {
            const isPrev = a.textContent.includes("\u2190");
            const rawTitle = a.textContent.replace(/[\u2190\u2192]/g, "").trim();
            const btn = document.createElement("a");
            btn.href = "#";
            btn.className = "docs-nav-btn " + (isPrev ? "docs-nav-prev" : "docs-nav-next");
            btn.innerHTML = isPrev
              ? `<span class="nav-arrow">\u2190</span><span class="nav-label"><span class="nav-hint">Previous</span><span class="nav-title">${rawTitle}</span></span>`
              : `<span class="nav-label"><span class="nav-hint">Next</span><span class="nav-title">${rawTitle}</span></span><span class="nav-arrow">\u2192</span>`;
            // Copy the click handler from the already-intercepted anchor
            const original = a;
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              original.click();
            });
            nav.appendChild(btn);
          });
          lastHr.replaceWith(nav);
          para.remove();
        }
      }
    }

    // Build TOC
    buildTOC($body);

    document.getElementById("docs-content").scrollTo(0, 0);
  } catch (err) {
    $body.innerHTML = `<div class="docs-empty">
      <p style="color:var(--text2);font-size:.9375rem">Could not load this document.</p>
      <p style="color:var(--text3);font-size:.85rem;margin-top:8px">${err.message}</p>
    </div>`;
  }

  // Syntax highlighting — outside try/catch so a missing hljs CDN
  // never wipes already-rendered content.
  if (typeof hljs !== "undefined") {
    document.querySelectorAll("#docs-body pre code").forEach((b) => {
      if (!b.dataset.highlighted) hljs.highlightElement(b);
    });
  }
}

/* ── TOC ──────────────────────────────────────────────────────── */
function slugify(t) {
  return t
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .trim();
}

function buildTOC(container) {
  const $tocList = document.getElementById("toc-list");
  $tocList.innerHTML = "";
  if (tocObserver) {
    tocObserver.disconnect();
    tocObserver = null;
  }

  const headings = Array.from(container.querySelectorAll("h2, h3"));
  if (!headings.length) return;

  headings.forEach((h) => {
    if (!h.id) h.id = slugify(h.textContent);

    const li = document.createElement("li");
    li.className = "toc-item " + (h.tagName === "H3" ? "toc-h3" : "");
    const a = document.createElement("a");
    a.className = "toc-link";
    a.href = "#" + h.id;
    a.textContent = h.textContent;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    li.appendChild(a);
    $tocList.appendChild(li);
  });

  const links = $tocList.querySelectorAll(".toc-link");
  tocObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((l) => l.classList.remove("active"));
          const active = $tocList.querySelector(
            `a[href="#${entry.target.id}"]`,
          );
          if (active) active.classList.add("active");
        }
      });
    },
    { rootMargin: "-72px 0px -68% 0px", threshold: 0 },
  );

  headings.forEach((h) => tocObserver.observe(h));
}

/* ── Sidebar doc links ───────────────────────────────────────── */
document.querySelectorAll(".sb-link").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    goDocs(el.dataset.doc);
  });
});

/* ── Initial route ───────────────────────────────────────────── */
(function init() {
  const h = location.hash;
  if (h.startsWith("#docs/") || h === "#docs") {
    const id = h.startsWith("#docs/") ? h.slice(6) : "index";
    document.body.classList.add("docs");
    document.getElementById("nav-docs-btn").classList.add("active");
    document.getElementById("docs-page").classList.add("active");
    document.getElementById("landing").classList.add("hidden");
    loadDoc(id || "index");
  }
})();
/* ── Mobile navigation ────────────────────────────────────────────── */
const $hamburger = document.getElementById("nav-hamburger");
const $mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");
const $mobileNavPanel = document.getElementById("mobile-nav-panel");

function openMobileNav() {
  document.body.classList.add("mobile-nav-open");
  $mobileNavPanel.classList.add("open");
  $mobileNavBackdrop.classList.add("open");
  $mobileNavPanel.setAttribute("aria-hidden", "false");
  $hamburger.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  document.body.classList.remove("mobile-nav-open");
  $mobileNavPanel.classList.remove("open");
  $mobileNavBackdrop.classList.remove("open");
  $mobileNavPanel.setAttribute("aria-hidden", "true");
  $hamburger.setAttribute("aria-expanded", "false");
}

$hamburger.addEventListener("click", () => {
  document.body.classList.contains("mobile-nav-open")
    ? closeMobileNav()
    : openMobileNav();
});

$mobileNavBackdrop.addEventListener("click", closeMobileNav);

document.getElementById("mobile-logo-link").addEventListener("click", (e) => {
  e.preventDefault();
  closeMobileNav();
  goLanding();
});

document.getElementById("mobile-feat-link").addEventListener("click", (e) => {
  closeMobileNav();
  if (document.body.classList.contains("docs")) {
    e.preventDefault();
    goLanding();
    setTimeout(
      () =>
        document
          .getElementById("features")
          ?.scrollIntoView({ behavior: "smooth" }),
      60,
    );
  }
});

document.getElementById("mobile-docs-btn").addEventListener("click", () => {
  closeMobileNav();
  goDocs("index");
});

/* ── Mobile docs sidebar ──────────────────────────────────────────── */
const $sidebarToggle = document.getElementById("docs-sidebar-toggle");
const $sidebarBackdrop = document.getElementById("sidebar-backdrop");

$sidebarToggle.addEventListener("click", () => {
  document.body.classList.add("docs-sidebar-open");
  document.getElementById("docs-sidebar").classList.add("open");
});

$sidebarBackdrop.addEventListener("click", () => {
  document.body.classList.remove("docs-sidebar-open");
  document.getElementById("docs-sidebar").classList.remove("open");
});

// Close panels on resize to desktop
window.addEventListener(
  "resize",
  () => {
    if (window.innerWidth > 900) {
      document.body.classList.remove("mobile-nav-open", "docs-sidebar-open");
      $mobileNavPanel.classList.remove("open");
      $mobileNavBackdrop.classList.remove("open");
      document.getElementById("docs-sidebar")?.classList.remove("open");
      $mobileNavPanel.setAttribute("aria-hidden", "true");
      $hamburger.setAttribute("aria-expanded", "false");
    }
  },
  { passive: true },
);

/* ── Typewriter for "pace." ────────────────────────────────────── */
(function typePace() {
  const el = document.getElementById("pace-type");
  if (!el) return;

  const WORD = "pace.";
  // Delays: start after hero badge animation settles (~600 ms)
  // Each keystroke: 95 ms ± 35 ms for a natural, unhurried feel
  const START_DELAY = 620;
  const BASE_DELAY  = 95;
  const JITTER      = 35;

  let i = 0;
  // Cursor element
  const cursor = document.createElement("span");
  cursor.className = "pace-cursor";
  cursor.textContent = "|";
  el.appendChild(cursor);

  function typeNext() {
    if (i < WORD.length) {
      cursor.insertAdjacentText("beforebegin", WORD[i++]);
      const delay = BASE_DELAY + (Math.random() * JITTER * 2 - JITTER);
      setTimeout(typeNext, delay);
    } else {
      // All letters typed — remove cursor, reveal underline
      cursor.remove();
      el.classList.add("typed");
    }
  }

  setTimeout(typeNext, START_DELAY);
})();
