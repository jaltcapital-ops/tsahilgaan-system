#!/usr/bin/env bash
set -e

echo "==== 1/7: Node.js суулгаж байна ===="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==== 2/7: Апп-ын хавтас бэлдэж байна ===="
mkdir -p ~/tsahilgaan-system/files
cd ~/tsahilgaan-system

echo "==== 3/7: Кодыг GitHub-оос татаж байна ===="
curl -fsSL -o server.js https://raw.githubusercontent.com/jaltcapital-ops/tsahilgaan-system/main/server.js
curl -fsSL -o index.html https://raw.githubusercontent.com/jaltcapital-ops/tsahilgaan-system/main/index.html
curl -fsSL -o file-server.js https://raw.githubusercontent.com/jaltcapital-ops/tsahilgaan-system/main/file-server.js
curl -fsSL -o package.json https://raw.githubusercontent.com/jaltcapital-ops/tsahilgaan-system/main/package.json

echo "==== 4/7: Хуучин дата сэргээж байна ===="
curl -fsSL -o data.json https://tmpfiles.org/dl/wowwa29gNAWb/data.json
wc -c data.json
node -e "JSON.parse(require('fs').readFileSync('data.json','utf8'));console.log('data.json OK')"

echo "==== 5/7: Package суулгаж байна ===="
npm install --omit=dev

echo "==== 6/7: systemd үйлчилгээ бэлдэж байна ===="
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
FILE_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
APPDIR="$HOME/tsahilgaan-system"
NODEBIN=$(command -v node)
USERNAME=$(whoami)

sudo tee /etc/systemd/system/tsahilgaan.service > /dev/null <<EOF
[Unit]
Description=Tsahilgaan main app
After=network.target

[Service]
Type=simple
User=$USERNAME
WorkingDirectory=$APPDIR
ExecStart=$NODEBIN $APPDIR/server.js
Restart=always
RestartSec=3
Environment=PORT=3000
Environment=SECRET=$SECRET
Environment=FILE_API_URL=http://localhost:8081
Environment=FILE_API_KEY=$FILE_KEY

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/tsahilgaan-files.service > /dev/null <<EOF
[Unit]
Description=Tsahilgaan file storage
After=network.target

[Service]
Type=simple
User=$USERNAME
WorkingDirectory=$APPDIR
ExecStart=$NODEBIN $APPDIR/file-server.js
Restart=always
RestartSec=3
Environment=FILE_PORT=8081
Environment=FILES_DIR=$APPDIR/files
Environment=FILE_API_KEY=$FILE_KEY

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/tsahilgaan-tunnel.service > /dev/null <<EOF
[Unit]
Description=Tsahilgaan serveo.net tunnel
After=network.target tsahilgaan.service

[Service]
Type=simple
User=$USERNAME
ExecStart=/usr/bin/ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -N -R ettelec:80:localhost:3000 serveo.net
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tsahilgaan tsahilgaan-files tsahilgaan-tunnel
sudo systemctl restart tsahilgaan tsahilgaan-files tsahilgaan-tunnel

echo "==== 7/7: Шалгаж байна (5 секунд хүлээгээд) ===="
sleep 5
sudo systemctl status tsahilgaan --no-pager -l | head -10
echo "---"
sudo systemctl status tsahilgaan-files --no-pager -l | head -10
echo "---"
curl -s -o /dev/null -w "MAIN APP local status: %{http_code}\n" http://localhost:3000/api/data
echo "---"
echo "Serveo tunnel лог:"
sudo journalctl -u tsahilgaan-tunnel -n 20 --no-pager

echo ""
echo "=========================================================="
echo "БҮГД ДУУСЛАА."
echo "Апп ажиллаж байвал: https://ettelec.serveousercontent.com"
echo "SECRET=$SECRET"
echo "FILE_API_KEY=$FILE_KEY"
echo "=========================================================="
