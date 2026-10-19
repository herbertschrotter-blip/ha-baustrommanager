#!/bin/sh
# Datenbank-Server für die Baustelle einrichten (BSM-026, docs/bauplan-datenbank.md §4a) – führt Herbert selbst aus,
# in einem Terminal-Fenster (fragt Passwörter ab, zeigt sie nie an):
#
#   /config/projekte/ha-baustrommanager/tools/db-einrichten.sh                        einrichten (wiederholbar)
#   /config/projekte/ha-baustrommanager/tools/db-einrichten.sh --postgres-zuruecksetzen  postgres-Passwort vergessen
#
# Einrichten: Add-on „TimescaleDB“ starten (falls aus), das Standard-Passwort von postgres ersetzen, Benutzer
# `baustelle` (schreibt, Eigentümer der Datenbank `baustelle`) und `baustelle_leser` (nur lesen: Excel/Power BI, Rechte
# auf die Ansichten vergibt die Integration) anlegen, TimescaleDB in `baustelle` einschalten.
# Steht `baustelle_db_url` schon in secrets.yaml, nimmt das Skript das Passwort von `baustelle` von dort – so passen
# Datenbank und HA immer zusammen (am 08.10.2026 hatte die Handy-Tastatur zwei Eingaben unterschiedlich gemacht).
# Geheimnisse schreibt es nirgends hin – die Zeile für secrets.yaml trägst du selbst ein.
#
# Zurücksetzen: Das Add-on kennt kein „Passwort vergessen“, und seine Option pg_hba_config bricht den Start ab
# (schreibt „null“ in pg_hba.conf). Darum setzt das Skript über die Start-Befehle des Add-ons (init_commands, laufen
# vor PostgreSQL) für ein paar Minuten eine Regel „postgres vom Terminal ohne Passwort“, setzt das neue Passwort von
# postgres (und `baustelle` aus secrets.yaml), nimmt die Regel wieder heraus und stellt die Start-Befehle zurück.
# Das Add-on startet dabei zweimal neu; die Integration puffert so lange und schreibt danach nach.
set -eu

SLUG=77b2833f_timescaledb
HOST=77b2833f-timescaledb
API="http://supervisor/addons/$SLUG"
SECRETS=${BAUSTELLE_SECRETS:-/config/secrets.yaml}
MARKE=baustelle-db-einrichten   # kennzeichnet die vorübergehende Zeile in pg_hba.conf

# Passwörter werden verdeckt am Terminal abgefragt – mit „! …“ in Claude Code gibt es keines
if ! (: </dev/tty) 2>/dev/null; then
  echo "Kein Terminal: bitte in einem eigenen Terminal-Fenster starten (tmux: Strg+b, c)."; exit 1
fi

command -v psql >/dev/null 2>&1 || apk add --no-cache postgresql17-client >/dev/null

frage() {   # $1 = Text; Passwort zweimal, ohne Anzeige
  while :; do
    printf '%s: ' "$1" >/dev/tty; stty -echo </dev/tty; read -r a </dev/tty; stty echo </dev/tty; echo >/dev/tty
    printf '%s (nochmal): ' "$1" >/dev/tty; stty -echo </dev/tty; read -r b </dev/tty; stty echo </dev/tty; echo >/dev/tty
    [ -n "$a" ] && [ "$a" = "$b" ] && { printf '%s' "$a"; return; }
    echo "Leer oder ungleich – bitte nochmal." >/dev/tty
  done
}

secrets_passwort() {   # Passwort von baustelle aus baustelle_db_url in secrets.yaml, sonst leer
  [ -r "$SECRETS" ] || return 0
  python3 - "$SECRETS" <<'PY'
import sys, urllib.parse as p
for z in open(sys.argv[1], encoding="utf-8"):
    if z.startswith("baustelle_db_url:"):
        print(p.unquote(p.urlsplit(z.split(":", 1)[1].strip().strip("\"'")).password or ""))
        break
PY
}

addon() {   # $1 = Methode, $2 = Pfad unter $API, $3 = JSON (optional)
  curl -s -X "$1" -H "Authorization: Bearer $SUPERVISOR_TOKEN" -H "Content-Type: application/json" \
    ${3:+-d "$3"} "$API$2"
}

warten() {   # bis PostgreSQL Verbindungen annimmt (nach dem Start meldet pg_isready das vor der Anmeldung)
  i=0; until pg_isready -h "$HOST" -p 5432 -q || [ $i -ge 60 ]; do sleep 2; i=$((i + 1)); done
  pg_isready -h "$HOST" -p 5432 -q || { echo "Server antwortet nicht ($HOST:5432)"; exit 1; }
}

start_befehle() {   # $1 = an | aus | zurueck: Start-Befehle setzen (die eigenen ersetzen, fremde bleiben)
  addon GET /info | python3 -c "
import json, sys
o = json.load(sys.stdin)['data']['options']
fremd = [b for b in o.get('init_commands') or [] if '$MARKE' not in b]
weg = \"sed -i '/$MARKE/d' /data/postgres/pg_hba.conf\"
neu = {'an': [weg + \" && sed -i '1i host all postgres $1 trust # $MARKE' /data/postgres/pg_hba.conf\"],
       'aus': [weg + ' # $MARKE'], 'zurueck': []}['$2']
o['init_commands'] = fremd + neu
print(json.dumps({'options': o}))"
}

if [ "${1:-}" = "--postgres-zuruecksetzen" ]; then
  ICH=$(hostname -i | cut -d' ' -f1)/32
  echo "postgres-Passwort zurücksetzen: vorübergehend Anmeldung ohne Passwort von $ICH, Add-on startet neu …"
  addon POST /options "$(start_befehle "$ICH" an)" >/dev/null
  addon POST /restart >/dev/null; sleep 5; warten
  i=0; until psql -h "$HOST" -U postgres -d postgres -w -tAc "SELECT 1" >/dev/null 2>&1 || [ $i -ge 15 ]; do sleep 2; i=$((i + 1)); done
  if psql -h "$HOST" -U postgres -d postgres -w -tAc "SELECT 1" >/dev/null 2>&1; then
    ADMIN=$(frage "Neues Passwort für postgres (Verwaltung)")
    SCHREIBER=$(secrets_passwort)
    psql -h "$HOST" -U postgres -d postgres -w -v ON_ERROR_STOP=1 -q -v admin="$ADMIN" -v schreiber="$SCHREIBER" <<'SQL'
ALTER ROLE postgres PASSWORD :'admin';
SELECT 'ALTER ROLE baustelle PASSWORD ' || quote_literal(:'schreiber')
  WHERE :'schreiber' <> '' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baustelle') \gexec
SQL
    echo "postgres neu gesetzt${SCHREIBER:+, baustelle wie in secrets.yaml}."
  else
    echo "Anmeldung ohne Passwort ging nicht – Protokoll des Add-ons ansehen. Regel wird wieder entfernt."
  fi
  echo "Regel entfernen, Add-on startet neu …"
  addon POST /options "$(start_befehle "$ICH" aus)" >/dev/null
  addon POST /restart >/dev/null; sleep 5; warten
  addon POST /options "$(start_befehle "$ICH" zurueck)" >/dev/null
  if psql -h "$HOST" -U postgres -d postgres -w -tAc "SELECT 1" >/dev/null 2>&1; then
    echo "ACHTUNG: postgres meldet sich noch ohne Passwort an – Add-on-Optionen und pg_hba.conf prüfen."; exit 1
  fi
  echo "Fertig. Die Integration verbindet sich innerhalb einer Minute wieder (Sensor „Datenbank“: ok)."
  exit 0
fi

zustand=$(addon GET /info | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['state'])")
if [ "$zustand" != "started" ]; then
  echo "Add-on TimescaleDB starten …"
  addon POST /start >/dev/null
  warten
fi
warten

# Anmeldung als postgres: zuerst das Standard-Passwort des Add-ons (bis 30 s warten, die Anmeldung geht nach dem
# Start erst etwas später), sonst das bisherige erfragen
export PGPASSWORD=homeassistant
i=0; until psql -h "$HOST" -U postgres -d postgres -tAc "SELECT 1" >/dev/null 2>&1 || [ $i -ge 15 ]; do sleep 2; i=$((i + 1)); done
if ! psql -h "$HOST" -U postgres -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then
  printf 'Bisheriges Passwort von postgres (vergessen? Strg+C und --postgres-zuruecksetzen): ' >/dev/tty
  stty -echo </dev/tty; read -r PGPASSWORD </dev/tty; stty echo </dev/tty; echo >/dev/tty
  export PGPASSWORD
fi

ADMIN=$(frage "Neues Passwort für postgres (Verwaltung)")
SCHREIBER=$(secrets_passwort)
if [ -n "$SCHREIBER" ]; then
  echo "Passwort für baustelle aus secrets.yaml übernommen."
else
  SCHREIBER=$(frage "Passwort für den Benutzer baustelle (Integration)")
fi
LESER=$(frage "Passwort für den Benutzer baustelle_leser (Excel/Power BI)")

psql -h "$HOST" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -v admin="$ADMIN" -v schreiber="$SCHREIBER" -v leser="$LESER" <<'SQL'
SELECT 'CREATE ROLE baustelle LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baustelle') \gexec
SELECT 'CREATE ROLE baustelle_leser LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baustelle_leser') \gexec
SELECT 'CREATE DATABASE baustelle' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'baustelle') \gexec
ALTER ROLE baustelle PASSWORD :'schreiber';
ALTER ROLE baustelle_leser PASSWORD :'leser';
ALTER DATABASE baustelle OWNER TO baustelle;
REVOKE ALL ON DATABASE baustelle FROM PUBLIC;
GRANT CONNECT ON DATABASE baustelle TO baustelle, baustelle_leser;
\c baustelle
CREATE EXTENSION IF NOT EXISTS timescaledb;
ALTER SCHEMA public OWNER TO baustelle;
GRANT USAGE ON SCHEMA public TO baustelle_leser;
\c postgres
ALTER ROLE postgres PASSWORD :'admin';
SQL

cat <<EOF

Fertig. Jetzt selbst eintragen (falls noch nicht geschehen):

1. /config/secrets.yaml (Sonderzeichen im Passwort wie @ : / # % in der URL als %40 %3A %2F %23 %25 schreiben):
     baustelle_db_url: postgresql://baustelle:<Passwort von baustelle>@$HOST:5432/baustelle

2. /config/packages/baustelle.yaml (legt Claude an, sobald du es willst):
     baustelle:
       db_url: !secret baustelle_db_url

3. Konfiguration prüfen, Neustart – beim ersten Start zieht die Integration die SQLite-Datei einmal um
   (dauert je nach Größe einige Minuten; die Datei bleibt als Rückweg liegen).

Für Excel/Power BI: Benutzer baustelle_leser, Datenbank baustelle (Port 5432 dafür im Add-on freigeben).
EOF
