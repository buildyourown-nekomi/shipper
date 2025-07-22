#!/bin/bash

# Install debootstrap
sudo apt-get install debootstrap

# Create a debian boostrap lowerdir (directory for the debian package)
mkdir -p images/debian_rootfs

# Init filesystem in lowerdir
sudo debootstrap --arch=amd64 stable /var/lib/shipper/images/debian_rootfs http://deb.debian.org/debian/
