"""Validate deployment values without sourcing shell code or displaying secrets."""
import ipaddress
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def read_env(path):
    values = {}
    for number, line in enumerate(Path(path).read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, raw = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z0-9_]+", key) or key in values:
            raise ValueError(f"环境文件第 {number} 行格式错误或变量重复。")
        # The installer emits plain values or double quotes with shell metacharacters escaped.
        # Reject executable shell syntax before legacy scripts source the validated file.
        if not re.fullmatch(r'[A-Za-z0-9_./:@%+=,?\-]*', raw):
            if not (raw.startswith('"') and raw.endswith('"')):
                raise ValueError(f"{key} 必须使用安装器支持的双引号格式。")
            inner = raw[1:-1]
            decoded = []
            index = 0
            while index < len(inner):
                char = inner[index]
                if char == "\\":
                    index += 1
                    if index >= len(inner) or inner[index] not in '\\$`"':
                        raise ValueError(f"{key} 包含不支持的转义。")
                    decoded.append(inner[index])
                elif char in '$`"\r\n':
                    raise ValueError(f"{key} 包含未转义的 Shell 字符。")
                else:
                    decoded.append(char)
                index += 1
            values[key] = ''.join(decoded)
        else:
            values[key] = raw
    return values


def validate(env):
    errors = []
    def require(condition, field):
        if not condition:
            errors.append(field)
    expected = {
        "NODE_ENV": "production", "APP_ENV": "production", "DATABASE_ENABLED": "true",
        "ADMIN_AUTH_BYPASS": "false", "LOCAL_ADMIN_PREVIEW": "false", "LOCAL_MAP_PREVIEW": "false",
        "NEXT_PUBLIC_API_BASE_URL": "/api/service", "API_BASE_URL": "http://api:4000",
        "WEATHER_PROVIDER": "open_meteo", "WEATHER_PROVIDER_MODE": "real",
        "OPEN_METEO_ENABLED": "true", "OPEN_METEO_MODE": "free", "API_TRUST_PROXY": "false",
        "API_RATE_LIMIT_ENABLED": "true",
    }
    for field, value in expected.items():
        require(env.get(field) == value, field)
    for field in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "REDIS_PASSWORD", "JWT_SECRET", "ADMIN_EMAIL", "DOMAIN"):
        value = env.get(field, "")
        require(bool(value) and "PLACEHOLDER" not in value, field)
    require(len(env.get("JWT_SECRET", "")) >= 32, "JWT_SECRET 长度")
    require(len(env.get("POSTGRES_PASSWORD", "")) >= 16, "POSTGRES_PASSWORD 长度")
    require(len(env.get("REDIS_PASSWORD", "")) >= 16, "REDIS_PASSWORD 长度")
    require(not env.get("OPEN_METEO_API_KEY") and not env.get("OPEN_METEO_CUSTOMER_ENDPOINT"), "Open-Meteo 免费模式")
    require(env.get("ENABLE_ASTRO_SERVICE") in ("true", "false"), "ENABLE_ASTRO_SERVICE")
    domain = env.get("DOMAIN", "")
    require(bool(re.fullmatch(r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}", domain)), "DOMAIN 格式")
    for field in ("SITE_URL", "PUBLIC_SITE_URL"):
        require(env.get(field, "").rstrip("/") == f"https://{domain}", field)
    try:
        db = urlsplit(env.get("DATABASE_URL", ""))
        require(db.scheme in ("postgres", "postgresql") and db.hostname == "postgres" and db.port == 5432
                and unquote(db.username or "") == env.get("POSTGRES_USER")
                and unquote(db.password or "") == env.get("POSTGRES_PASSWORD")
                and db.path == "/" + env.get("POSTGRES_DB", ""), "DATABASE_URL 与数据库配置一致性")
        redis = urlsplit(env.get("REDIS_URL", ""))
        require(redis.scheme == "redis" and redis.hostname == "redis" and redis.port == 6379
                and unquote(redis.password or "") == env.get("REDIS_PASSWORD"), "REDIS_URL 与密码一致性")
        network = ipaddress.ip_network(env.get("APP_NETWORK_SUBNET", ""))
        dynamic_range = ipaddress.ip_network(env.get("APP_NETWORK_IP_RANGE", ""))
        proxy = ipaddress.ip_address(env.get("CADDY_INTERNAL_IP", ""))
        require(network.version == 4 and network.is_private and network.prefixlen >= 24 and proxy in network and proxy not in (network.network_address, network.broadcast_address), "Caddy 私有网络")
        require(dynamic_range.version == network.version and dynamic_range.subnet_of(network)
                and proxy not in dynamic_range and dynamic_range.num_addresses >= 16, "Docker 动态地址范围")
        require(env.get("API_TRUSTED_PROXIES") == f"{proxy}/32", "API_TRUSTED_PROXIES")
    except ValueError:
        errors.append("连接地址或可信代理格式")
    if errors:
        raise ValueError("生产配置检查失败：" + "、".join(errors) + "。请对照免费版生产模板修正；未显示配置值。")


if __name__ == "__main__":
    try:
        validate(read_env(sys.argv[1]))
        print("免费版生产配置检查通过。")
    except (ValueError, OSError, IndexError):
        # Re-read validation errors only; never print input or secret-bearing OS paths.
        error = sys.exc_info()[1]
        print(str(error) if isinstance(error, ValueError) else "无法读取生产配置文件。", file=sys.stderr)
        sys.exit(1)
