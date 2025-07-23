#!/bin/bash

# Update package lists
sudo apt update

# Install debootstrap
sudo apt-get install debootstrap

# Init filesystem in lowerdir
sudo debootstrap --arch=amd64 stable /var/lib/keelan/crates/debian http://deb.debian.org/debian/

sudo apt install coreutils
