import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse wraps pdfjs-dist, which resolves its worker / standard-font / cmap
  // assets from node_modules at runtime. Bundling it (the Next default) breaks
  // those path lookups, so PDFParse throws inside the /importar server action —
  // it parses fine in plain Node but fails in the bundled server. Keep it as an
  // external runtime require so PDF statement parsing works (PDF-02 / 13-03).
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
