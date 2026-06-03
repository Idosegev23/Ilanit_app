import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neondatabase/serverless'],
  // Pin the workspace root so Next does not pick up an unrelated parent lockfile.
  turbopack: {
    root: dirname,
  },
};

export default nextConfig;
