#!/bin/sh
# managed-by: personal-crm deploy/server-setup
# certbot runs this after it renews a certificate, so nginx starts serving the new one.
systemctl reload nginx
