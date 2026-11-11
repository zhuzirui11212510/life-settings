#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 && $# -eq 1 && -f "$1" ]] || { echo '用法：bash ROLLBACK.sh /www/backup/life-settings/指定备份.tar.gz'; exit 1; }
backup="$(realpath "$1")"
[[ "$backup" == /www/backup/life-settings/life-settings-*.tar.gz ]] || { echo '请选择本更新脚本生成的备份。'; exit 1; }
echo '恢复会切回备份时的程序和数据。升级后新增的房间不会出现在旧版中；当前目录会完整保留。'
read -r -p '确认恢复请输入 RESTORE: ' answer
[[ "$answer" == RESTORE ]] || exit 0
stamp="$(date +%Y%m%d-%H%M%S)-$$"
systemctl stop life-settings
mv /www/wwwroot/life-settings "/www/wwwroot/life-settings.before-restore-$stamp"
tar -xzf "$backup" -C /www/wwwroot
systemctl start life-settings
curl -fsS --max-time 5 http://127.0.0.1:8787/api/health
echo
echo '已恢复；请强制刷新浏览器。'
