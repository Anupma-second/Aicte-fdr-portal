import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The home folder above this project is also a repo; pin tracing to the project.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  // Tests need dev-only packages, which production installs leave out.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Lets a production build be checked without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // These load their own worker files and data from disk, so they must not be bundled.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "pdfjs-dist", "@napi-rs/canvas", "node-cron", "nodemailer", "exceljs", "pdfkit"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // SAMEORIGIN rather than DENY so the portal can preview its own PDFs.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
