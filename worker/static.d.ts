// Type declarations for static asset imports bundled into the Worker.
// Wrangler treats `import x from "./y.html"` (and .svg, .txt, .xml) as text by
// default when the file is reachable from the entry. The TS compiler needs to
// be told the module produces a string.
declare module "*.html" { const value: string; export default value }
declare module "*.svg"  { const value: string; export default value }
declare module "*.txt"  { const value: string; export default value }
declare module "*.xml"  { const value: string; export default value }
