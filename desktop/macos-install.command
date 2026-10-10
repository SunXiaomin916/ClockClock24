#!/bin/zsh
set -euo pipefail
cd -- "$(dirname -- "$0")"
echo 'ClockClock 24 — 安装到个人应用程序目录'
echo '此包未经 Apple 公证；安装时会在本机生成临时签名，不修改系统安全设置。'
SOURCE="$PWD/ClockClock 24.app"
DEST="$HOME/Applications/ClockClock 24.app"
if [[ ! -d "$SOURCE" ]]; then echo '请先完整解压安装包，再运行本脚本。'; read '?按回车退出'; exit 1; fi
if [[ -e "$DEST" ]]; then echo "目标已存在：$DEST"; echo '请先退出旧版、关闭旧版开机启动并将旧应用移走，再安装。'; read '?按回车退出'; exit 1; fi
mkdir -p "$HOME/Applications"
/usr/bin/ditto "$SOURCE" "$DEST"
/usr/bin/codesign --force --deep --sign - --entitlements "$PWD/entitlements.plist" "$DEST"
/usr/bin/codesign --verify --deep --strict "$DEST"
echo '安装完成。开机启动默认关闭，可从菜单栏图标 → 设置中打开。'
echo '如系统要求确认，请在系统设置 → 隐私与安全性中允许这款应用。'
/usr/bin/open "$DEST"
