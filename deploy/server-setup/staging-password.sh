#!/usr/bin/env bash
# Sets the login and password of the test stand https://test-app.whobook.ru (nginx basic auth).
# setup.sh runs it when there is no password yet; run it again to change the login or password.
# nginx reads the file on every request: the new password works at once, no reload needed.
#
# Usage (as root, in a terminal: it asks for the login and the password):
#   ssh -t crm sudo bash ~/server-setup/staging-password.sh
set -Eeuo pipefail

HTPASSWD="/etc/nginx/whobook-test-app.htpasswd"
MIN_PASSWORD_LENGTH=12

info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo bash $0"
[ -t 0 ] || die "it asks for a login and a password: run it in a terminal (ssh -t)"
command -v openssl >/dev/null 2>&1 || die "openssl is not installed"

printf '\nLogin and password for https://test-app.whobook.ru\n'
read -r -p "Login: " login
[[ "$login" =~ ^[A-Za-z0-9._-]+$ ]] || die "the login may have only latin letters, digits, dots, dashes and underscores. Nothing was changed"
# The password is not shown on the screen and is never written anywhere as is, only its hash.
read -rs -p "Password (at least $MIN_PASSWORD_LENGTH characters, not shown): " password
printf '\n'
[ "${#password}" -ge "$MIN_PASSWORD_LENGTH" ] || die "the password is shorter than $MIN_PASSWORD_LENGTH characters. Nothing was changed"
read -rs -p "The same password again: " again
printf '\n'
[ "$password" = "$again" ] || die "the passwords do not match. Nothing was changed"

# SHA-512 crypt: nginx checks it with the system crypt().
hash="$(printf '%s' "$password" | openssl passwd -6 -stdin)"
unset password again

# nginx workers (user www-data) read the file; nobody else can.
tmp="$(mktemp "$HTPASSWD.XXXXXX")"
printf '%s:%s\n' "$login" "$hash" > "$tmp"
chown root:www-data "$tmp"
chmod 640 "$tmp"
mv "$tmp" "$HTPASSWD"
info "saved $HTPASSWD: login \"$login\", the password only as a hash"
