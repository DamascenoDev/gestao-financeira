import type { NextConfig } from "next";

// pdfjs-dist (wrapped by pdf-parse) sets up a "fake worker" by DYNAMICALLY importing
// `pdf.worker.mjs` at parse time. Vercel's static file tracer (@vercel/nft) can't see
// that dynamic import, so the worker was omitted from the deployed function →
// `Cannot find module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'` and every PDF
// upload failed in PROD (the OFX/CSV paths were unaffected). Force-include the worker
// (the actual failure) plus cmaps/standard_fonts (cheap insurance for getText on
// encoded / standard-font PDFs). Paths are relative to the project root; pdfjs-dist is
// hoisted to top-level node_modules (matches the `/var/task/node_modules/...` error).
const PDFJS_RUNTIME_ASSETS = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/cmaps/**",
  "./node_modules/pdfjs-dist/standard_fonts/**",
];

const nextConfig: NextConfig = {
  // pdf-parse wraps pdfjs-dist, which resolves its worker / standard-font / cmap
  // assets from node_modules at runtime. Bundling it (the Next default) breaks
  // those path lookups, so PDFParse throws inside the /importar server action —
  // it parses fine in plain Node but fails in the bundled server. Keep it as an
  // external runtime require so PDF statement parsing works (PDF-02 / 13-03).
  serverExternalPackages: ["pdf-parse"],

  // Force the pdfjs runtime assets (esp. the dynamically-imported worker) into the
  // serverless function bundle for the routes that run `ingestStatement`.
  outputFileTracingIncludes: {
    "/importar": PDFJS_RUNTIME_ASSETS,
    "/importar/[statementId]": PDFJS_RUNTIME_ASSETS,
  },
};

export default nextConfig;
