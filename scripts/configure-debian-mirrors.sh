#!/bin/sh
set -eu

# Optional root argument allows isolated tests without changing the host's APT.
apt_root="${1:-/etc/apt}"
apt_mirror="${DEBIAN_APT_MIRROR:-}"
security_mirror="${DEBIAN_SECURITY_MIRROR:-}"
apt_mirror="${apt_mirror%/}"
security_mirror="${security_mirror%/}"

validate_mirror() {
  [ -z "$2" ] && return 0
  case "$2" in
    *[!A-Za-z0-9:/.~_-]*)
      echo "$1 must contain only URL characters, without whitespace or credentials." >&2
      exit 1
      ;;
  esac
  if ! printf '%s\n' "$2" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]+)?$'; then
    echo "$1 must be an HTTP(S) repository URL without credentials or query parameters." >&2
    exit 1
  fi
}

validate_mirror DEBIAN_APT_MIRROR "$apt_mirror"
validate_mirror DEBIAN_SECURITY_MIRROR "$security_mirror"

# Preserve suites, components, Signed-By and any unrelated repository entries.
for source_file in "$apt_root/sources.list" "$apt_root"/sources.list.d/*.list "$apt_root"/sources.list.d/*.sources; do
  [ -f "$source_file" ] || continue
  if [ -n "$security_mirror" ]; then
    sed -E -i "s#https?://(deb|security)\.debian\.org/debian-security([/[:space:]]|$)#${security_mirror}\2#g" "$source_file"
  fi
  if [ -n "$apt_mirror" ]; then
    sed -E -i "s#https?://deb\.debian\.org/debian([/[:space:]]|$)#${apt_mirror}\1#g" "$source_file"
  fi
done

mkdir -p "$apt_root/apt.conf.d"
cat > "$apt_root/apt.conf.d/80photo-weather-downloads" <<'EOF'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::http::Pipeline-Depth "0";
EOF

printf 'Debian APT mirror: %s\n' "${apt_mirror:-upstream (unchanged)}"
printf 'Debian security mirror: %s\n' "${security_mirror:-upstream (unchanged)}"
