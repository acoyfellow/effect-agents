// Shared HTML layout for every docs page.
//
// Codex aesthetic + Google Sans Flex/Code typography + persistent sidebar.
// One CSS block, inlined. No client JS.

export type NavItem = { title: string; href: string; prefix?: string; external?: boolean }
export type NavSection = { title: string; href: string; items: ReadonlyArray<NavItem> }
export type SiteNav = {
  agents: NavSection
  guides: ReadonlyArray<NavSection>
  extras: ReadonlyArray<NavItem>
}

export interface LayoutOptions {
  pathname: string
  title: string
  description: string
  nav: SiteNav
  body: string
}

const SITE = "https://effect-agents.coey.dev"

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const isActive = (current: string, href: string): boolean => current === href

const renderNavSection = (section: NavSection, current: string): string => {
  return `
    <div class="nav-section">
      <a href="${section.href}" class="nav-section-title${isActive(current, section.href) ? " is-active" : ""}">${escapeHtml(section.title)}</a>
      ${
        section.items.length > 0
          ? `<ul class="nav-list">
        ${section.items
          .map(
            (item) =>
              `<li><a href="${item.href}" class="${isActive(current, item.href) ? "is-active" : ""}">${item.prefix ? `<span class="nav-prefix">${escapeHtml(item.prefix)}</span>` : ""}${escapeHtml(item.title)}</a></li>`
          )
          .join("\n        ")}
      </ul>`
          : ""
      }
    </div>
  `
}

export const renderLayout = (opts: LayoutOptions): string => {
  const { pathname, title, description, nav, body } = opts
  const fullTitle = pathname === "/" ? `${title}` : `${title} · effect-agents`
  const ogUrl = `${SITE}${pathname}`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="canonical" href="${ogUrl}" />
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="author" content="acoyfellow" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:site_name" content="effect-agents" />
  <meta property="og:title" content="${escapeHtml(fullTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${SITE}/og.svg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/svg+xml" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@acoyfellow" />
  <meta name="twitter:creator" content="@acoyfellow" />
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${SITE}/og.svg" />

  <meta name="theme-color" content="#0a0a0f" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,100..1000&family=Google+Sans+Code:wght@300..800&display=swap" />

  <style>
    :root {
      --bg: #0a0a0f;
      --bg-2: #111118;
      --fg: #f4f4f5;
      --fg-2: #a1a1aa;
      --fg-3: #52525b;
      --line: #27272a;
      --line-2: #1f1f23;
      --hot: #F38020;
      --sans: "Google Sans Flex", ui-sans-serif, system-ui, -apple-system, sans-serif;
      --mono: "Google Sans Code", ui-monospace, "SF Mono", Menlo, Monaco, monospace;
    }
    @media (prefers-color-scheme: light) {
      :root { --bg: #fafafa; --bg-2: #fff; --fg: #09090b; --fg-2: #52525b; --fg-3: #a1a1aa; --line: #e4e4e7; --line-2: #f4f4f5; --hot: #D9651A; }
    }
    *,*:before,*:after { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--sans);
      font-optical-sizing: auto;
      line-height: 1.6;
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }

    /* ──────────────────────────────────────────────── */
    /*  Layout shell — sidebar + main                   */
    /* ──────────────────────────────────────────────── */
    .shell {
      display: grid;
      grid-template-columns: 260px 1fr;
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      align-self: start;
      height: 100vh;
      overflow-y: auto;
      padding: 2.5rem 1.75rem;
      border-right: 1px solid var(--line);
      background: var(--bg);
    }
    .main {
      min-width: 0;
      padding: 4rem clamp(1.5rem, 5vw, 4rem) 6rem;
      max-width: 980px;
    }
    @media (max-width: 880px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar {
        position: static;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
        padding: 1.5rem 1.5rem;
      }
      .main { padding: 2.5rem 1.5rem 4rem; }
    }

    /* ──────────────────────────────────────────────── */
    /*  Sidebar                                          */
    /* ──────────────────────────────────────────────── */
    .brand {
      display: block;
      font-family: var(--mono);
      font-weight: 700;
      font-size: 1.05rem;
      color: var(--fg);
      letter-spacing: -0.02em;
      text-decoration: none;
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--line);
    }
    .brand:hover { color: var(--hot); }
    .brand .v {
      font-size: .7rem;
      color: var(--fg-3);
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: .25rem;
      display: block;
    }

    .nav-section { margin-bottom: 2rem; }
    .nav-section-title {
      display: block;
      font-family: var(--mono);
      font-size: .7rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--fg-3);
      text-decoration: none;
      margin-bottom: .75rem;
      transition: color .12s;
    }
    .nav-section-title:hover { color: var(--fg); }
    .nav-section-title.is-active { color: var(--fg); }
    .nav-list { list-style: none; margin: 0; padding: 0; }
    .nav-list li { margin: 0; padding: 0; }
    .nav-list a {
      display: block;
      padding: .35rem 0;
      font-family: var(--mono);
      font-size: .85rem;
      color: var(--fg-2);
      text-decoration: none;
      letter-spacing: -0.005em;
      transition: color .12s;
    }
    .nav-list a:hover { color: var(--fg); }
    .nav-list a.is-active { color: var(--hot); }
    .nav-prefix {
      display: inline-block;
      width: 2.5ch;
      color: var(--fg-3);
      margin-right: .25rem;
    }
    .nav-list a:hover .nav-prefix { color: var(--fg-2); }

    /* ──────────────────────────────────────────────── */
    /*  Main content typography                          */
    /* ──────────────────────────────────────────────── */
    .label {
      font-family: var(--mono);
      font-size: .7rem;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--fg-3);
      margin: 0 0 1.5rem;
      padding-bottom: .75rem;
      border-bottom: 1px solid var(--line);
    }
    .sublabel {
      font-family: var(--mono);
      font-size: .75rem;
      color: var(--fg-3);
      letter-spacing: 0.04em;
      margin: 0 0 .5rem;
    }
    .main h1 {
      font-family: var(--mono);
      font-size: clamp(2rem, 5vw, 3.25rem);
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: -0.035em;
      margin: 0 0 1.5rem;
      color: var(--fg);
    }
    .lede {
      font-size: clamp(1.05rem, 1.6vw, 1.25rem);
      line-height: 1.5;
      color: var(--fg-2);
      letter-spacing: -0.01em;
      max-width: 640px;
      margin: 0 0 2.5rem;
    }

    /* ──────────────────────────────────────────────── */
    /*  Hero (homepage only — small quick block)         */
    /* ──────────────────────────────────────────────── */
    .quick {
      font-family: var(--mono);
      font-size: .9rem;
      line-height: 1.7;
      padding: 1rem 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      overflow-x: auto;
      margin: 2rem 0;
    }
    .quick .p { color: var(--fg-3); user-select: none; }
    .quick .c { color: var(--fg-3); }

    /* ──────────────────────────────────────────────── */
    /*  Divider-led gallery                              */
    /* ──────────────────────────────────────────────── */
    .gallery { list-style: none; margin: 2rem 0; padding: 0; border-top: 1px solid var(--line); }
    .gallery li { border-bottom: 1px solid var(--line); }
    .gallery a {
      display: grid;
      grid-template-columns: 3rem 1fr;
      gap: 1.25rem;
      padding: 1.25rem 0;
      color: var(--fg);
      text-decoration: none;
      transition: background .12s;
    }
    .gallery a:hover { background: color-mix(in srgb, var(--fg) 3%, transparent); }
    .gallery .num {
      font-family: var(--mono);
      font-size: 1rem;
      font-weight: 500;
      color: var(--fg-3);
      letter-spacing: 0.05em;
    }
    .gallery .body { display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
    .gallery .name {
      font-family: var(--mono);
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .gallery .hero {
      font-size: .95rem;
      color: var(--fg-2);
      line-height: 1.5;
    }

    /* ──────────────────────────────────────────────── */
    /*  Article prose                                    */
    /* ──────────────────────────────────────────────── */
    .prose { max-width: 720px; }
    .prose p { margin: 1rem 0; color: var(--fg); }
    .prose h2 {
      font-family: var(--sans);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 3rem 0 1rem;
      padding-bottom: .5rem;
      border-bottom: 1px solid var(--line);
    }
    .prose h3 {
      font-family: var(--sans);
      font-size: 1.15rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 2rem 0 .75rem;
    }
    .prose a { color: var(--fg); border-bottom: 1px solid var(--line); text-decoration: none; padding-bottom: 1px; transition: border-color .15s; }
    .prose a:hover { border-color: var(--hot); }
    .prose strong { font-weight: 600; }
    .prose ul, .prose ol { padding-left: 1.5rem; }
    .prose li { margin: .25rem 0; }
    .prose blockquote {
      border-left: 2px solid var(--line);
      padding-left: 1rem;
      margin: 1rem 0;
      color: var(--fg-2);
    }
    .prose blockquote p { margin: .25rem 0; }
    .prose hr { border: 0; border-top: 1px solid var(--line); margin: 2.5rem 0; }
    .prose table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: .9rem; }
    .prose th, .prose td {
      text-align: left;
      padding: .65rem .75rem;
      border-bottom: 1px solid var(--line);
    }
    .prose th {
      font-family: var(--mono);
      font-size: .75rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--fg-3);
      border-bottom: 1px solid var(--line);
    }
    /* Inline code in flowing prose (not inside a pre). */
    .prose :not(pre) > code {
      font-family: var(--mono);
      font-size: .85em;
      background: var(--bg-2);
      padding: 1px 6px;
      border-radius: 3px;
      color: var(--fg);
      border: 1px solid var(--line);
    }

    /* Shiki blocks — keep shiki's per-span inline colors. Only restyle the
       outer pre; never set color on the inner code. */
    pre.shiki {
      margin: 1.5rem 0;
      padding: 1rem 1.25rem;
      background-color: #0d1117 !important;
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow-x: auto;
      font-family: var(--mono);
      font-size: .85rem;
      line-height: 1.6;
    }
    pre.shiki code {
      display: block;
      background: transparent;
      padding: 0;
      border-radius: 0;
      border: 0;
      font-size: inherit;
      /* deliberately no color here — shiki sets per-span inline colors */
    }
    pre.shiki .line { display: block; min-height: 1.6em; }

    /* ──────────────────────────────────────────────── */
    /*  Agent source block                               */
    /* ──────────────────────────────────────────────── */
    /* Agent source block: outer chrome for the highlighted agent.ts on /agents/<slug> */
    .source-block { margin: 2rem 0 3rem; }
    .source pre.shiki { margin: 0; font-size: .82rem; }

    footer {
      margin-top: 6rem;
      padding-top: 2rem;
      border-top: 1px solid var(--line);
      font-size: .85rem;
      color: var(--fg-3);
      line-height: 1.7;
    }
    footer code { font-family: var(--mono); font-size: .8rem; color: var(--fg-2); }
    footer a { color: var(--fg-2); text-decoration: none; border-bottom: 1px dotted var(--fg-3); }
    footer a:hover { color: var(--fg); border-color: var(--fg); }
  </style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <a href="/" class="brand">effect-agents<span class="v">v4 · beta</span></a>

    ${renderNavSection(nav.agents, pathname)}

    ${nav.guides.map((s) => renderNavSection(s, pathname)).join("\n")}

    <div class="nav-section">
      <span class="nav-section-title">More</span>
      <ul class="nav-list">
        ${nav.extras
          .map(
            (item) =>
              `<li><a href="${item.href}"${item.external ? ' target="_blank" rel="noopener"' : ""} class="${isActive(pathname, item.href) ? "is-active" : ""}">${escapeHtml(item.title)}${item.external ? " ↗" : ""}</a></li>`
          )
          .join("\n        ")}
      </ul>
    </div>
  </aside>

  <main class="main">
    ${body}
    <footer>
      MIT · <a href="https://github.com/acoyfellow/effect-agents">github.com/acoyfellow/effect-agents</a> · <a href="https://coey.dev">coey.dev</a>
    </footer>
  </main>
</div>
</body>
</html>`
}
