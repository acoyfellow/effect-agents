#!/usr/bin/env bun
// Build the static docs site into worker/site/pages.ts.
//
// Reads every docs/**/*.md, every examples/<NN-name>/{agent.ts,README.md}, and
// ARCHITECTURE.md. Renders each to HTML using marked + shiki, wraps with the
// shared layout, and emits a single TypeScript module that exports:
//
//   - pages: Record<RoutePath, string>   ← full HTML per route
//   - nav: SiteNav                       ← sidebar nav data
//   - meta: Record<RoutePath, PageMeta>  ← title/description for SEO
//
// The Worker imports this module at build time so no markdown is parsed at
// runtime. One Map lookup per request.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { marked } from "marked"
import { createHighlighter, type Highlighter } from "shiki"
import { renderLayout, type NavSection, type SiteNav } from "../worker/site/layout.ts"

const ROOT = join(import.meta.dir, "..")
const OUT = join(ROOT, "worker/site/pages.ts")

type PageMeta = { title: string; description: string; section?: string }
type Page = { html: string; meta: PageMeta }

// ──────────────────────────────────────────────────────────────────
// Highlighter — one shiki instance for the whole build
// ──────────────────────────────────────────────────────────────────

let highlighter: Highlighter
const initHighlighter = async () => {
  highlighter = await createHighlighter({
    themes: ["github-dark-default"],
    langs: ["ts", "typescript", "tsx", "js", "json", "jsonc", "bash", "sh", "md", "html", "css"]
  })
}

const highlightCode = (code: string, lang: string): string => {
  try {
    return highlighter.codeToHtml(code, { lang, theme: "github-dark-default" })
  } catch {
    return highlighter.codeToHtml(code, { lang: "ts", theme: "github-dark-default" })
  }
}

// Hook into marked's default code renderer
const renderMarkdown = (md: string): string => {
  const renderer = new marked.Renderer()
  renderer.code = ({ text, lang }) => highlightCode(text, lang || "ts")
  marked.setOptions({ renderer, gfm: true, breaks: false })
  return marked.parse(md) as string
}

// ──────────────────────────────────────────────────────────────────
// Front-matter extraction (minimal — first H1 = title; first ¶ = desc)
// ──────────────────────────────────────────────────────────────────

const extractMeta = (md: string, fallbackTitle: string): { title: string; description: string; bodyMd: string } => {
  const lines = md.split("\n")
  let titleIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^#\s+(.+?)\s*$/)
    if (m) {
      titleIdx = i
      break
    }
  }
  const title = titleIdx >= 0 ? lines[titleIdx]!.replace(/^#\s+/, "").trim() : fallbackTitle
  // First non-empty paragraph after the title becomes the description.
  let desc = ""
  if (titleIdx >= 0) {
    for (let i = titleIdx + 1; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (!line) continue
      if (line.startsWith("#")) break
      // Strip leading "> " (blockquote tagline) and inline markdown
      desc = line
        .replace(/^>\s*/, "")
        .replace(/\*\*?([^*]+)\*\*?/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      break
    }
  }
  // Remove the H1 from the body since we render it ourselves
  const bodyMd = titleIdx >= 0 ? [...lines.slice(0, titleIdx), ...lines.slice(titleIdx + 1)].join("\n").trim() : md
  return { title, description: desc, bodyMd }
}

// ──────────────────────────────────────────────────────────────────
// Routes — derived from filesystem
// ──────────────────────────────────────────────────────────────────

// docs/<section>/<slug>.md → /<section>/<slug>  (with /<section>/index → /<section>)
const docsRoute = (section: string, slug: string) =>
  slug === "index" ? `/${section}` : `/${section}/${slug}`

const examplesRoute = (slug: string) => `/agents/${slug}`

// ──────────────────────────────────────────────────────────────────
// Build each kind of page
// ──────────────────────────────────────────────────────────────────

const collectDocs = async (): Promise<Array<{ route: string; meta: PageMeta; bodyMd: string }>> => {
  const sections = ["tutorials", "how-to", "reference", "explanation"]
  const out: Array<{ route: string; meta: PageMeta; bodyMd: string }> = []
  for (const section of sections) {
    const dir = join(ROOT, "docs", section)
    let entries: string[] = []
    try {
      entries = (await readdir(dir)).filter((f) => f.endsWith(".md"))
    } catch {
      continue
    }
    for (const file of entries) {
      const slug = file.replace(/\.md$/, "")
      const md = await readFile(join(dir, file), "utf-8")
      const { title, description, bodyMd } = extractMeta(md, slug)
      out.push({
        route: docsRoute(section, slug),
        meta: { title, description, section },
        bodyMd
      })
    }
  }
  return out
}

const collectExamples = async (): Promise<
  Array<{ route: string; slug: string; meta: PageMeta; agentTs: string; readmeMd: string }>
> => {
  const dir = join(ROOT, "examples")
  const entries = (await readdir(dir)).filter((f) => /^\d{2}-/.test(f))
  entries.sort()
  const out: Array<{ route: string; slug: string; meta: PageMeta; agentTs: string; readmeMd: string }> = []
  for (const slug of entries) {
    const agentTs = await readFile(join(dir, slug, "agent.ts"), "utf-8")
    const readmeMd = await readFile(join(dir, slug, "README.md"), "utf-8").catch(() => "")
    const { title, description } = extractMeta(readmeMd, slug)
    out.push({
      route: examplesRoute(slug),
      slug,
      meta: { title: title || slug, description, section: "agents" },
      agentTs,
      readmeMd
    })
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// Build the SiteNav from the collected content
// ──────────────────────────────────────────────────────────────────

const buildNav = (
  examples: Awaited<ReturnType<typeof collectExamples>>,
  docs: Awaited<ReturnType<typeof collectDocs>>
): SiteNav => {
  const sectionLabel = (section: string): string => {
    switch (section) {
      case "tutorials":
        return "Tutorial"
      case "how-to":
        return "How-to"
      case "reference":
        return "Reference"
      case "explanation":
        return "Why"
      default:
        return section
    }
  }
  const docSection = (section: string): NavSection => ({
    title: sectionLabel(section),
    href: `/${section}`,
    items: docs
      .filter((d) => d.meta.section === section && !d.route.endsWith(`/${section}`))
      .map((d) => ({ title: d.meta.title, href: d.route }))
  })
  return {
    agents: {
      title: "Agents",
      href: "/agents",
      items: examples.map((e) => ({
        title: e.meta.title.replace(/^\d{2}\s*[·•]?\s*/, ""),
        href: e.route,
        prefix: e.slug.slice(0, 2)
      }))
    },
    guides: [
      docSection("tutorials"),
      docSection("how-to"),
      docSection("reference"),
      docSection("explanation")
    ],
    extras: [
      { title: "Architecture", href: "/architecture" },
      { title: "Endpoints", href: "/api" },
      { title: "GitHub", href: "https://github.com/acoyfellow/effect-agents", external: true }
    ]
  }
}

// ──────────────────────────────────────────────────────────────────
// Render each page (body HTML + layout chrome)
// ──────────────────────────────────────────────────────────────────

const renderDocPage = (
  d: { route: string; meta: PageMeta; bodyMd: string },
  nav: SiteNav
): Page => {
  const body = `
    <p class="label">${escapeHtml(d.meta.section ?? "")}</p>
    <h1>${escapeHtml(d.meta.title)}</h1>
    <article class="prose">${renderMarkdown(d.bodyMd)}</article>
  `
  return {
    html: renderLayout({ pathname: d.route, title: d.meta.title, description: d.meta.description, nav, body }),
    meta: d.meta
  }
}

const renderExamplePage = (
  e: { route: string; slug: string; meta: PageMeta; agentTs: string; readmeMd: string },
  nav: SiteNav
): Page => {
  const sourceHtml = highlightCode(e.agentTs, "ts")
  // Drop the H1 of the README (we render the title ourselves)
  const { bodyMd } = extractMeta(e.readmeMd, e.meta.title)
  const proseHtml = renderMarkdown(bodyMd)
  const body = `
    <p class="label">agents · ${e.slug.slice(0, 2)}</p>
    <h1>${escapeHtml(e.meta.title)}</h1>
    <p class="lede">${escapeHtml(e.meta.description)}</p>

    <section class="source-block">
      <p class="sublabel">${escapeHtml(`examples/${e.slug}/agent.ts`)}</p>
      <div class="source">${sourceHtml}</div>
    </section>

    <article class="prose">${proseHtml}</article>
  `
  return {
    html: renderLayout({
      pathname: e.route,
      title: e.meta.title,
      description: e.meta.description,
      nav,
      body
    }),
    meta: e.meta
  }
}

const renderIndexPage = (
  section: string,
  docs: Awaited<ReturnType<typeof collectDocs>>,
  nav: SiteNav
): Page => {
  const sectionDocs = docs.filter((d) => d.meta.section === section)
  const index = sectionDocs.find((d) => d.route === `/${section}`)
  const others = sectionDocs.filter((d) => d.route !== `/${section}`)
  const introMd = index?.bodyMd ?? ""
  const body = `
    <p class="label">${escapeHtml(section)}</p>
    <h1>${escapeHtml(index?.meta.title ?? section)}</h1>
    <article class="prose">${renderMarkdown(introMd)}</article>
    <ol class="gallery">
      ${others
        .map(
          (d) => `<li><a href="${d.route}">
        <span class="num">${"·"}</span>
        <span class="body">
          <span class="name">${escapeHtml(d.meta.title)}</span>
          ${d.meta.description ? `<span class="hero">${escapeHtml(d.meta.description)}</span>` : ""}
        </span>
      </a></li>`
        )
        .join("\n")}
    </ol>
  `
  return {
    html: renderLayout({
      pathname: `/${section}`,
      title: index?.meta.title ?? section,
      description: index?.meta.description ?? "",
      nav,
      body
    }),
    meta: { title: index?.meta.title ?? section, description: index?.meta.description ?? "", section }
  }
}

const renderAgentsIndex = (
  examples: Awaited<ReturnType<typeof collectExamples>>,
  nav: SiteNav
): Page => {
  const body = `
    <p class="label">agents</p>
    <h1>Five small Effect agents</h1>
    <p class="lede">Each is one file. Open one and read it.</p>
    <ol class="gallery">
      ${examples
        .map(
          (e) => `<li><a href="${e.route}">
        <span class="num">${e.slug.slice(0, 2)}</span>
        <span class="body">
          <span class="name">${escapeHtml(e.meta.title.replace(/^\d{2}\s*[·•]?\s*/, ""))}</span>
          ${e.meta.description ? `<span class="hero">${escapeHtml(e.meta.description)}</span>` : ""}
        </span>
      </a></li>`
        )
        .join("\n")}
    </ol>
  `
  return {
    html: renderLayout({
      pathname: "/agents",
      title: "Agents",
      description: "Five small agents, built with Effect v4. Each agent is just an Effect value.",
      nav,
      body
    }),
    meta: { title: "Agents", description: "", section: "agents" }
  }
}

const renderArchitecture = async (nav: SiteNav): Promise<Page> => {
  const md = await readFile(join(ROOT, "ARCHITECTURE.md"), "utf-8")
  const { title, description, bodyMd } = extractMeta(md, "Architecture")
  const body = `
    <p class="label">contributors</p>
    <h1>${escapeHtml(title)}</h1>
    <article class="prose">${renderMarkdown(bodyMd)}</article>
  `
  return {
    html: renderLayout({ pathname: "/architecture", title, description, nav, body }),
    meta: { title, description }
  }
}

const renderHomePage = (
  examples: Awaited<ReturnType<typeof collectExamples>>,
  nav: SiteNav
): Page => {
  const body = `
    <p class="label">an experiment · may 2026</p>
    <h1>Five small Effect agents.</h1>
    <p class="lede">Each agent is just an <code>Effect</code> value. One Cloudflare Worker runs all five.</p>

    <div class="quick">
      <div><span class="p">$</span> git clone https://github.com/acoyfellow/effect-agents</div>
      <div><span class="p">$</span> cd effect-agents &amp;&amp; bun install</div>
      <div><span class="p">$</span> bun run smoke      <span class="c"># all 5 run offline · no API key</span></div>
    </div>

    <ol class="gallery">
      ${examples
        .map(
          (e) => `<li><a href="${e.route}">
        <span class="num">${e.slug.slice(0, 2)}</span>
        <span class="body">
          <span class="name">${escapeHtml(e.meta.title.replace(/^\d{2}\s*[·•]?\s*/, ""))}</span>
          ${e.meta.description ? `<span class="hero">${escapeHtml(e.meta.description)}</span>` : ""}
        </span>
      </a></li>`
        )
        .join("\n")}
    </ol>
  `
  return {
    html: renderLayout({
      pathname: "/",
      title: "effect-agents — five small agents, built with Effect v4",
      description:
        "Five small agents, built with Effect v4 (beta). Each agent is just an Effect value. One Cloudflare Worker runs all of them.",
      nav,
      body
    }),
    meta: {
      title: "effect-agents",
      description: "Five small agents, built with Effect v4. Each agent is just an Effect value."
    }
  }
}

const renderApiReference = (nav: SiteNav): Page => {
  const md = `
The same Worker that serves this docs site also runs the five agents at the URLs below. Hit them with \`curl\`.

\`\`\`text
POST /01           parallel-research
POST /02           streaming-tools  (returns NDJSON)
POST /03           approval-gated turn 1
POST /03/decide    approval-gated turn 2
POST /04           typed-errors
POST /05           mcp-from-toolkit
*    /mcp          MCP HTTP transport
GET  /health
\`\`\`

Example:

\`\`\`bash
curl -sS https://effect-agents.coey.dev/04 \\
  -H 'content-type: application/json' \\
  -d '{"question":"Reply with one word: pong."}'
\`\`\`
`
  const body = `
    <p class="label">endpoints</p>
    <h1>HTTP endpoints</h1>
    <article class="prose">${renderMarkdown(md)}</article>
  `
  return {
    html: renderLayout({
      pathname: "/api",
      title: "Endpoints",
      description: "Worker endpoints for the five agents.",
      nav,
      body
    }),
    meta: { title: "Endpoints", description: "Worker endpoints for the five agents." }
  }
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const main = async () => {
  await initHighlighter()

  const examples = await collectExamples()
  const docs = await collectDocs()
  const nav = buildNav(examples, docs)

  const pages: Record<string, Page> = {}

  // Homepage — hero + the five, with sidebar.
  pages["/"] = renderHomePage(examples, nav)

  // Per-doc pages — but only the ones that AREN'T section indexes (those are
  // rendered with the gallery shape via renderIndexPage).
  for (const d of docs) {
    if (d.route.match(/^\/[^/]+$/)) continue // skip /<section> indexes; handled below
    pages[d.route] = renderDocPage(d, nav)
  }
  // Section index pages
  for (const section of ["tutorials", "how-to", "reference", "explanation"]) {
    pages[`/${section}`] = renderIndexPage(section, docs, nav)
  }
  // Per-agent pages
  for (const e of examples) pages[e.route] = renderExamplePage(e, nav)
  // Agents index
  pages["/agents"] = renderAgentsIndex(examples, nav)
  // Architecture
  pages["/architecture"] = await renderArchitecture(nav)
  // API reference (de-emphasized)
  pages["/api"] = renderApiReference(nav)

  // Emit a single TS module
  await mkdir(join(ROOT, "worker/site"), { recursive: true })
  const entries = Object.entries(pages)
    .map(([route, p]) => `  ${JSON.stringify(route)}: ${JSON.stringify(p.html)}`)
    .join(",\n")
  const metaEntries = Object.entries(pages)
    .map(([route, p]) => `  ${JSON.stringify(route)}: ${JSON.stringify(p.meta)}`)
    .join(",\n")
  const navJson = JSON.stringify(nav, null, 2).replace(/^/gm, "  ").trim()
  const out = `// GENERATED by scripts/build-site.ts. Do not edit by hand.
// Run \`bun run site:build\` to regenerate.
/* eslint-disable */

export const pages: Record<string, string> = {
${entries}
}

export const meta: Record<string, { title: string; description: string; section?: string }> = {
${metaEntries}
}

export const nav = ${navJson} as const

export const routes = Object.keys(pages)
`
  await writeFile(OUT, out, "utf-8")
  console.log(`✓ built ${Object.keys(pages).length} pages → ${OUT}`)
  console.log(`  ${(out.length / 1024).toFixed(1)}KB`)
}

await main()
