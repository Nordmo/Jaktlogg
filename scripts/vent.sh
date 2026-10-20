#!/bin/bash
# Kjører en kommando med tidsgrense, som GNU timeout, men virker også på macOS (der timeout ikke finnes).
# Bruk: scripts/vent.sh <sekunder> <kommando> [argumenter ...]. Exit 124 når tiden går ut, ellers kommandoens exit.
secs=$1; shift
case "$secs" in ''|*[!0-9]*) echo "Bruk: scripts/vent.sh <sekunder> <kommando> ..." >&2; exit 2 ;; esac
"$@" & pid=$!
# Vakten sover ett sekund om gangen og stopper kommandoen når tiden er ute. Utdata til /dev/null, så ingen venter på den.
( for ((i = 0; i < secs; i++)); do sleep 1; kill -0 "$pid" 2>/dev/null || exit 0; done; kill -TERM "$pid" 2>/dev/null; exit 1 ) >/dev/null 2>&1 &
w=$!
wait "$pid" 2>/dev/null; code=$?
kill "$w" 2>/dev/null; wait "$w" 2>/dev/null
[ $? -eq 1 ] && exit 124
exit "$code"
