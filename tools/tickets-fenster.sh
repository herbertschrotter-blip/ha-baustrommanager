#!/bin/sh
# Eigenes Fenster „Tickets“ (tmux-Sitzung „Baustelle-Dashboard“) im Claude Terminal: Claude Code im Projekt ha-baustrommanager für Tickets aus dem Melden-Knopf.
# Legt das tmux-Fenster beim ersten Aufruf an (neue Claude-Sitzung „baustelle-tickets“, bleibt offen, solange das
# Add-on läuft) und wechselt sonst nur dorthin. Aufruf im Claude Terminal: /config/projekte/ha-baustrommanager/tools/tickets-fenster.sh
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
SITZUNG=${TMUX_SITZUNG:-Baustelle-Dashboard}
FENSTER=Tickets

if ! tmux has-session -t "$SITZUNG" 2>/dev/null; then
  tmux new-session -d -s "$SITZUNG" -c "$REPO"
fi
if ! tmux list-windows -t "$SITZUNG" -F '#{window_name}' | grep -qx "$FENSTER"; then
  tmux new-window -t "$SITZUNG" -n "$FENSTER" -c "$REPO" "claude -n baustelle-tickets"
fi
if [ -n "${TMUX:-}" ]; then
  tmux switch-client -t "$SITZUNG:$FENSTER"  # auch aus einer anderen Sitzung heraus
else
  tmux attach -t "$SITZUNG:$FENSTER"
fi
