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
    loadDoc(id || "index");
  } else {
    document.body.classList.remove("docs");
    document.getElementById("nav-docs-btn").classList.remove("active");
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
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    $body.innerHTML = marked.parse(md);

    // Intercept internal .md links
    $body.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      if (href.endsWith(".md") || href.includes(".md#")) {
        const base = href.split("/").pop().split("#")[0];
        const id =
          FILENAME_TO_ID[base] ||
          Object.keys(DOC_MAP).find((k) => DOC_MAP[k].endsWith("/" + base)) ||
          base.replace(".md", "");
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

    // Build TOC
    buildTOC($body);

    document.getElementById("docs-content").scrollTo(0, 0);
  } catch (err) {
    const isFile = location.protocol === "file:";
    $body.innerHTML = `<div class="docs-empty">
      <p style="color:var(--text2);font-size:.9375rem">Could not load this document.</p>
      ${
        isFile
          ? `<p style="color:var(--text3);font-size:.85rem;margin-top:10px;line-height:1.6">
        This page must be served over HTTP.<br>
        From the project root, run:<br>
        <code style="background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:4px 8px;margin-top:6px;display:inline-block;font-family:var(--mono)">npx serve .</code>
        <br>then open <code style="background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:2px 6px;font-family:var(--mono)">http://localhost:3000/landing/</code>
      </p>`
          : `<p style="color:var(--text3);font-size:.85rem;margin-top:8px">${err.message}</p>`
      }
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
    loadDoc(id || "index");
  }
})();
/* ── Mobile navigation ────────────────────────────────────────────── */
const $hamburger = document.getElementById("nav-hamburger");
const $mobileNavBackdrop = document.getElementById("mobile-nav-backdrop");
const $mobileNavPanel = document.getElementById("mobile-nav-panel");

function openMobileNav() {
  document.body.classList.add("mobile-nav-open");
  $mobileNavPanel.setAttribute("aria-hidden", "false");
  $hamburger.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  document.body.classList.remove("mobile-nav-open");
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
});

$sidebarBackdrop.addEventListener("click", () => {
  document.body.classList.remove("docs-sidebar-open");
});

// Close panels on resize to desktop
window.addEventListener(
  "resize",
  () => {
    if (window.innerWidth > 900) {
      document.body.classList.remove("mobile-nav-open", "docs-sidebar-open");
      $mobileNavPanel.setAttribute("aria-hidden", "true");
      $hamburger.setAttribute("aria-expanded", "false");
    }
  },
  { passive: true },
);
