/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async rewrites() {
    return [
      {
        source: "/api/service/:path*",
        destination: `${process.env.API_BASE_URL ?? "http://127.0.0.1:4000"}/:path*`,
      },
    ];
  },
  transpilePackages: [
    "@photo-weather/config",
    "@photo-weather/shared",
    "@photo-weather/astro",
    "@photo-weather/calendar",
    "@photo-weather/weather",
    "@photo-weather/geo",
    "@photo-weather/scoring",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };

    return config;
  },
};

export default nextConfig;
