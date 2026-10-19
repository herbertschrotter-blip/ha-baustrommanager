#!/bin/sh
# Home Assistant neu starten – nur wenn die Konfiguration gültig ist. Gegenstück zu tools/deploy.sh.
# Prüft über die HA-API (Konfiguration prüfen), startet dann neu und wartet, bis HA wieder antwortet.
# Braucht SUPERVISOR_TOKEN (im Claude Terminal gesetzt). Aufruf: /config/projekte/ha-baustrommanager/tools/neustart.sh
set -eu

API=${HA_API:-http://supervisor/core/api}
: "${SUPERVISOR_TOKEN:?SUPERVISOR_TOKEN fehlt – nur im Claude Terminal aufrufen}"

rufe() {  # rufe <GET|POST> <pfad>
  curl -s -m 120 -X "$1" -H "Authorization: Bearer $SUPERVISOR_TOKEN" -H "Content-Type: application/json" "$API$2"
}

echo "Konfiguration prüfen …"
pruefung=$(rufe POST /config/core/check_config)
ergebnis=$(printf '%s' "$pruefung" | jq -r '.result // "unbekannt"')
if [ "$ergebnis" != "valid" ]; then
  echo "Konfiguration NICHT gültig ($ergebnis) – kein Neustart."
  printf '%s' "$pruefung" | jq -r '.errors // empty'
  exit 1
fi
echo "Konfiguration gültig."

echo "Home Assistant wird neu gestartet …"
rufe POST /services/homeassistant/restart >/dev/null || true   # die Verbindung bricht beim Neustart ab

# warten, bis HA wieder antwortet (erst weg, dann wieder da), höchstens 5 Minuten
sleep 15
i=0
while [ $i -lt 57 ]; do
  if [ "$(rufe GET /config 2>/dev/null | jq -r '.state // empty' 2>/dev/null)" = "RUNNING" ]; then
    echo "Home Assistant läuft wieder ($(rufe GET /config | jq -r '.version'))."
    exit 0
  fi
  sleep 5
  i=$((i + 1))
done
echo "Home Assistant antwortet nach 5 Minuten noch nicht – bitte im Protokoll nachsehen."
exit 1
