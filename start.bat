@echo off
cd /d C:\Users\pc\Desktop\article-rewriter

echo Starting Article Rewriter...
start "ArticleRewriter" node server.js

echo Starting tunnel...
:loop
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3006 serveo.net
echo Tunnel dropped, reconnecting in 5s...
timeout /t 5 >nul
goto loop
