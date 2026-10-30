#!/bin/sh
# Liefert die Integration nach /config aus (die Seite „Baustelle“ ist Teil davon). Nur Kopieren – Konfiguration prüfen und
# Neustart bleiben eigene Schritte (siehe README.md, Abschnitt Auslieferung).
#
# Eine Filterregel für Kopieren und Aufräumen (BSM-022, bauplan-lit §4): aus frontend/ nur die gebaute Seite und der
# Verlauf (Positivliste) – Quellen (src/), Bauwerkzeuge (bauen.mjs, package*.json, version.json) und node_modules nie.
# Im Ziel wird entfernt, was nicht zugelassen ist oder in der Quelle fehlt. Die Seite wird über eine Zwischendatei
# ersetzt, changelog.json (Versions-Hinweis der Seite) zuletzt.
#
# Vorher (Audit 0.8.165): nur aus einem sauberen, eingecheckten Stand (kein uncommitteter Code in /config) und nur, wenn
# Seite, Version und Mockup zum Stand passen (--pruefen). Der Commit steht danach in .ausgeliefert im Ziel.
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
ZIEL=${HA_CONFIG:-/config}
QUELLE="$REPO/custom_components/baustelle"
ZIEL_INT="$ZIEL/custom_components/baustelle"

ausliefern() {   # $1 = Pfad relativ zur Integration, z. B. ./frontend/baustelle-panel.js
  case "$1" in
    */__pycache__/*) return 1 ;;
    ./frontend/baustelle-panel.js|./frontend/changelog.json) return 0 ;;
    ./frontend/*) return 1 ;;
    *) return 0 ;;
  esac
}

dateien() {   # alle Dateien unter $1 (ohne __pycache__ und node_modules), relativ
  (cd "$1" && find . \( -type d \( -name __pycache__ -o -name node_modules \) -prune \) -o -type f -print)
}

kopieren() {
  mkdir -p "$ZIEL_INT/$(dirname "$1")"
  cp "$QUELLE/$1" "$ZIEL_INT/$1.neu"
  mv -f "$ZIEL_INT/$1.neu" "$ZIEL_INT/$1"
}

if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  echo "Abbruch: nicht eingecheckte Änderungen in $REPO – erst committen (oder aus einem git worktree ausliefern)." >&2
  exit 1
fi
NM="$QUELLE/frontend/node_modules"   # Bauwerkzeug für --pruefen; ein git worktree hat keins – das des Haupt-Checkouts leihen
if [ ! -e "$NM" ]; then
  HAUPT=$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)")
  if [ -d "$HAUPT/custom_components/baustelle/frontend/node_modules" ]; then
    ln -s "$HAUPT/custom_components/baustelle/frontend/node_modules" "$NM"
    trap 'rm -f "$NM"' EXIT
  fi
fi
(cd "$REPO" && python3 tools/changelog.py --pruefen && node custom_components/baustelle/frontend/bauen.mjs --pruefen) >/dev/null || {
  echo "Abbruch: Seite oder Version passen nicht zum Stand (tools/changelog.py, bauen.mjs --pruefen)." >&2
  exit 1
}
COMMIT=$(git -C "$REPO" rev-parse --short HEAD)
# CI (GitHub Actions) des Commits: rot → Abbruch (DEPLOY_TROTZ_CI=1 übergeht das); läuft noch oder ohne gh → nur Hinweis
if command -v gh >/dev/null 2>&1 && LAEUFE=$(cd "$REPO" && gh api "repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs" \
    -q '.check_runs[] | "\(.name)=\(.conclusion)"' 2>/dev/null); then
  ROT=$(printf '%s\n' "$LAEUFE" | grep -E '=(failure|timed_out|cancelled)$' || true)
  if [ -n "$ROT" ] && [ "${DEPLOY_TROTZ_CI:-}" != 1 ]; then
    echo "Abbruch: CI für $COMMIT ist rot ($(echo $ROT)) – erst beheben (oder DEPLOY_TROTZ_CI=1)." >&2
    exit 1
  fi
  [ -z "$LAEUFE" ] || printf '%s\n' "$LAEUFE" | grep -q '=null$' && echo "Hinweis: CI für $COMMIT läuft noch oder fehlt."
else
  echo "Hinweis: CI-Stand nicht abrufbar (gh fehlt, offline oder Commit noch nicht auf GitHub)."
fi

mkdir -p "$ZIEL_INT"
dateien "$QUELLE" | while read -r datei; do
  [ "$datei" = "./frontend/changelog.json" ] && continue   # zuletzt
  if ausliefern "$datei"; then kopieren "$datei"; fi
done
kopieren "./frontend/changelog.json"
dateien "$ZIEL_INT" | while read -r datei; do
  if ! ausliefern "$datei" || [ ! -e "$QUELLE/$datei" ]; then rm -f "$ZIEL_INT/$datei"; echo "entfernt: $datei"; fi
done
find "$ZIEL_INT" -mindepth 1 -type d -empty ! -name __pycache__ -delete   # leer gewordene Ordner (z. B. frontend/src)
printf '%s %s\n' "$COMMIT" "$(date -Iseconds)" > "$ZIEL_INT/.ausgeliefert"   # welcher Stand läuft (Audit 0.8.165)
echo "ausgeliefert: $ZIEL_INT (Version $(sed -n 's/.*"version": "\(.*\)".*/\1/p' "$ZIEL_INT/manifest.json"), Commit $COMMIT)"

echo "Jetzt: Konfiguration prüfen und Home Assistant neu starten."
