#!/bin/bash

# Update package lists
sudo apt update

# Install debootstrap
sudo apt-get install -y debootstrap

# Init filesystem in lowerdir
sudo debootstrap --arch=amd64 stable /var/lib/keelan/crates/debian http://deb.debian.org/debian/

# Install coreutils just in case
sudo apt install -y coreutils

echo "Installing Keelan..."
# Run npm install, migrate and build
npm install
npm run migrate
npm run build

# Install keelan
sudo npm install -g .

echo "✅ Keelan CLI installed globally. Run with: keelan"

# Create system service

echo "Creating system service..."

SERVICE_NAME="keelan"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

KEELAN_PATH=$(which keelan)

echo "Keelan path: $KEELAN_PATH"

sudo bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=Keelan Container Engine
After=network.target

[Service]
Type=simple
ExecStart=$KEELAN_PATH daemon start
Restart=always
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF

echo "System service created: $SERVICE_FILE"
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload
echo "Enabling Keelan service..."
sudo systemctl enable "$SERVICE_NAME"
echo "Starting Keelan service..."
sudo systemctl start "$SERVICE_NAME"

echo
echo "🎉 Try running:"
echo "   keelan --help"