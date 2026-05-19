/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@photo-weather/config",
    "@photo-weather/shared",
    "@photo-weather/weather",
    "@photo-weather/geo",
    "@photo-weather/scoring",
  ],
};

export default nextConfig;
