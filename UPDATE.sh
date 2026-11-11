#!/usr/bin/env bash
set -Eeuo pipefail
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target=/www/wwwroot/life-settings
service=life-settings
backup_root=/www/backup/life-settings
stamp="$(date +%Y%m%d-%H%M%S)-$$"
backup="$backup_root/life-settings-$stamp.tar.gz"
changed=0
if [[ $EUID -ne 0 ]]; then echo '请在宝塔 root 终端执行本脚本。'; exit 1; fi
if [[ "$source_dir" == "$target" ]]; then echo '请将更新包解压到单独目录，不要直接覆盖旧网站。'; exit 1; fi
for file in public/life.html public/life.js public/poster.js public/fields.js shared/core.mjs local/server.mjs deploy/life-settings.service; do
 [[ -f "$source_dir/$file" ]] || { echo "更新文件缺失：$file"; exit 1; }
done
[[ -f "$target/local/server.mjs" ]] || { echo '未找到原网站，请检查 /www/wwwroot/life-settings'; exit 1; }
id www >/dev/null
/usr/bin/node --check "$source_dir/local/server.mjs"
/usr/bin/node --check "$source_dir/shared/core.mjs"
/usr/bin/node --check "$source_dir/public/life.js"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
rollback(){
 code=$?
 trap - ERR
 echo '升级未完成，正在恢复原网站。'
 if [[ $changed == 1 ]]; then
  systemctl stop "$service" || true
  mv "$target" "$target.failed-$stamp"
  tar -xzf "$backup" -C /www/wwwroot
 fi
 systemctl start "$service" || true
 echo "备份：$backup"
 echo '请保留错误信息，勿反复运行脚本。'
 exit "$code"
}
trap rollback ERR
systemctl stop "$service"
tar -czf "$backup" -C /www/wwwroot life-settings
chmod 600 "$backup"
changed=1
for dir in public shared local deploy; do cp -a "$source_dir/$dir/." "$target/$dir/"; done
chown -R www:www "$target"
cp "$target/deploy/life-settings.service" /etc/systemd/system/life-settings.service
systemctl daemon-reload
systemctl enable "$service"
systemctl start "$service"
healthy=0
for attempt in {1..15}; do
 if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health | /usr/bin/node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{const d=JSON.parse(s);process.exit(d.ok&&d.version===3?0:1)}catch{process.exit(1)}})'; then healthy=1; break; fi
 sleep 1
done
[[ $healthy == 1 ]]
trap - ERR
echo '升级成功：Life Settings 3.0 已在后台运行。'
echo "完整备份（含旧数据库）：$backup"
echo '请强制刷新主持页面。可继续使用v2房间；正式展示建议创建新房间。v1房间数据保留。'
echo '域名解析、宝塔反向代理和 SSL 配置不需要修改。'
