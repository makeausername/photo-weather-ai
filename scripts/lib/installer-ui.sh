#!/usr/bin/env bash
# Quiet, width-aware terminal UI; all decoration goes to stderr so input capture stays clean.
UI_ACCENT="" UI_MUTED="" UI_GOOD="" UI_BAD="" UI_RESET="" UI_BOLD=""
if [[ -t 2 && "${TERM:-dumb}" != dumb && -z "${NO_COLOR:-}" ]]; then
  UI_ACCENT=$'\033[38;5;215m'; UI_MUTED=$'\033[38;5;245m'
  UI_GOOD=$'\033[38;5;114m'; UI_BAD=$'\033[38;5;203m'
  UI_RESET=$'\033[0m'; UI_BOLD=$'\033[1m'
fi

ui_width() {
  local width
  width="$(tput cols 2>/dev/null || printf '64')"
  [[ "${width}" =~ ^[0-9]+$ ]] || width=64
  ((width > 72)) && width=72
  ((width < 24)) && width=24
  printf '%s' "${width}"
}

line() {
  local width
  width="$(ui_width)"
  printf '%s' "${UI_MUTED}" >&2
  printf '%*s\n' "$((width - 4))" '' | tr ' ' '-' >&2
  printf '%s' "${UI_RESET}" >&2
}

title() {
  printf '\n%s  逐光天气%s\n' "${UI_ACCENT}${UI_BOLD}" "${UI_RESET}" >&2
  printf '  一键部署安装程序 · 免费版\n' >&2
  printf '%s  填写信息，后续交给安装向导。%s\n\n' "${UI_MUTED}" "${UI_RESET}" >&2
  line
  if (( $(ui_width) >= 56 )); then
    printf '  01 环境  /  02 站点  /  03 账号  /  04 证书\n' >&2
    printf '  05 确认  /  06 构建  /  07 初始化  /  08 验证\n' >&2
  else
    printf '  01 环境     02 站点\n  03 账号     04 证书\n  05 确认     06 构建\n  07 初始化   08 验证\n' >&2
  fi
  printf '%s  密码输入不回显；Ctrl+C 可退出。%s\n' "${UI_MUTED}" "${UI_RESET}" >&2
}

section() {
  local number="$1" label="$2"
  printf '\n' >&2; line
  printf '%s  [%02d/08] %s%s\n\n' "${UI_ACCENT}${UI_BOLD}" "${number}" "${label}" "${UI_RESET}" >&2
}

ok() { printf '%s  [完成]%s %s\n' "${UI_GOOD}" "${UI_RESET}" "$1" >&2; }
warn() { printf '%s  [提示]%s %s\n' "${UI_ACCENT}" "${UI_RESET}" "$1" >&2; }
error_message() { printf '%s  [失败]%s %s\n' "${UI_BAD}" "${UI_RESET}" "$1" >&2; }
ui_note() { printf '%s  %s%s\n' "${UI_MUTED}" "$1" "${UI_RESET}" >&2; }

ui_input() {
  local label="$1" default_value="${2:-}" value=""
  printf '%s  › %s%s' "${UI_ACCENT}" "${label}" "${UI_RESET}" >&2
  [[ -z "${default_value}" ]] || printf ' [%s]' "${default_value}" >&2
  printf ': ' >&2
  if ! IFS= read -r value; then
    printf '\n输入已结束，安装已停止。\n' >&2
    return 1
  fi
  printf '%s' "${value:-${default_value}}"
}
