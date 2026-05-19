/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@photo-weather/config",
    "@photo-weather/shared",
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
