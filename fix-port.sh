#!/bin/bash
# 端口冲突自动修复脚本 — 杀掉占用3006端口的僵尸进程，重启PM2
# 用法: ./fix-port.sh 或加入crontab定时执行

PORT=3006
APP_NAME="article-rewriter"
LOG_FILE="/home/admin/pm2-fix.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查端口被谁占用
OCCUPIER=$(sudo fuser ${PORT}/tcp 2>/dev/null | awk '{print $1}')
if [ -z "$OCCUPIER" ]; then
  # 端口空闲，检查PM2状态
  PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const a=d.find(x=>x.name==='$APP_NAME'); console.log(a?a.status:'not_found')")
  if [ "$PM2_STATUS" = "online" ]; then
    log "OK — PM2 online, port ${PORT} 正常"
  else
    log "WARN — 端口空闲但PM2状态异常(${PM2_STATUS})，重启中..."
    pm2 restart "$APP_NAME" --update-env >> "$LOG_FILE" 2>&1
    log "已执行 pm2 restart"
  fi
  exit 0
fi

# 端口被占用，检查是否和PM2管理的进程一致
PM2_PID=$(pm2 jlist 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const a=d.find(x=>x.name==='$APP_NAME'); console.log(a?a.pid:'')")

if [ "$OCCUPIER" = "$PM2_PID" ]; then
  log "OK — 端口${PORT}由PM2进程${PM2_PID}正常占用"
  exit 0
fi

# 端口被非PM2进程（僵尸）占用 → 清理
log "CONFLICT — 端口${PORT}被PID ${OCCUPIER}占用，PM2进程是${PM2_PID}，清理僵尸..."
sudo kill -9 "$OCCUPIER" 2>/dev/null
sleep 1

# 再次确认端口已释放
STILL=$(sudo fuser ${PORT}/tcp 2>/dev/null | awk '{print $1}')
if [ -n "$STILL" ]; then
  log "FAIL — PID ${STILL}仍占用端口，强制杀掉"
  sudo kill -9 "$STILL" 2>/dev/null
  sleep 1
fi

# 重启PM2
pm2 restart "$APP_NAME" --update-env >> "$LOG_FILE" 2>&1
sleep 2

# 最终验证
FINAL=$(sudo fuser ${PORT}/tcp 2>/dev/null | awk '{print $1}')
FINAL_PM2=$(pm2 jlist 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const a=d.find(x=>x.name==='$APP_NAME'); console.log(a?a.pid:'')")

if [ -n "$FINAL" ] && [ "$FINAL" = "$FINAL_PM2" ]; then
  log "FIXED ✓ — 僵尸已清理，PM2 ${FINAL_PM2} 正常监听端口${PORT}"
else
  log "CHECK — 端口PID:${FINAL}, PM2 PID:${FINAL_PM2}，请手动确认"
fi
