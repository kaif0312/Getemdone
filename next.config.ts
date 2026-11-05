import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The calendar images (lib/calendar/render.tsx) read their fonts from disk at runtime; tell the bundler to ship them.
  outputFileTracingIncludes: {
    '/api/wa/inbound': ['./lib/calendar/fonts/**/*'],
  },
};

export default nextConfig;
