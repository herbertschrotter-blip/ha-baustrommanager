"""Konstanten der Heizung (BSM-023): Gründe, Modi, Texte, Zeiten."""

from __future__ import annotations
from datetime import time
from ...logik.regelung import MODI as MODI, HandEnde, SollGrund   # MODI: eine Quelle (logik/regelung.modus_von)

HEIZ_GRUENDE = {
    SollGrund.FRUEHSTART, SollGrund.VORHEIZEN, SollGrund.ARBEITSZEIT, SollGrund.NACHHEIZEN, SollGrund.TROCKNEN,
    SollGrund.BEDARF, SollGrund.BOOST, SollGrund.FROST, SollGrund.ABSENKEN, SollGrund.TASTE, SollGrund.BASELINE,
}
# lernende Regelung: nur in diesen Gründen regelt der Container selbst (K außen lernen)
LERN_GRUENDE = {
    SollGrund.FRUEHSTART, SollGrund.VORHEIZEN, SollGrund.ARBEITSZEIT, SollGrund.NACHHEIZEN, SollGrund.TROCKNEN,
    SollGrund.BEDARF, SollGrund.ABSENKEN,
}
# Takt der lernenden Regelung auf der Seite (laufzeit.container.<id>.takt): Gründe, in denen TPI auf das Soll regelt
# (Absenken regelt auf das Absenk-Ziel, die Taste am Plug zeigt ihren eigenen Text)
TAKT_GRUENDE = {
    SollGrund.FRUEHSTART, SollGrund.VORHEIZEN, SollGrund.ARBEITSZEIT, SollGrund.NACHHEIZEN, SollGrund.TROCKNEN,
    SollGrund.BEDARF,
}
HAND_ENDE_TEXT = {   # Protokoll, wenn die Automatik einen Heizkörper aus dem Handbetrieb übernimmt (FE-0004)
    HandEnde.VORRANG: "Automatik übernimmt ({grund})",
    HandEnde.SOLL: "Soll {soll} °C erreicht – Automatik übernimmt",
    HandEnde.DAUER: "{h} h von Hand, keine Antwort – Automatik übernimmt",
    HandEnde.SCHALTPUNKT: "Automatik übernimmt ({grund})",
}
MODUS_TEXT = {"plan": "Zeitplan", "thermo": "Thermostat", "bedarf": "Bei Bedarf", "hand": "Hand", "aus": "Aus"}
STANDARD_HEIZ_KW = 2.0  # Heizkörper ohne Messung (Mockup: 2,0 kW)
FRUEHSTART_NACHRICHT = time(18, 0)  # Abend vorher: „Morgen −4 °C – Vorheizen startet schon um …“
FRUEHER_MIN = 30  # Knopf „Noch früher“
VERSCH_BIS = time(3, 0)
ABSCHNITT_TEXT = {"fruehstart": "Frühstart", "vorheizen": "Vorheizen", "arbeitszeit": "Arbeitszeit", "nachheizen": "Nachheizen"}   # FE-0015  # + / − am Rad (Soll gleitend) gilt bis morgen früh, vor dem Vorheizen
WETTER_PROTOKOLL_AB = time(5, 0)  # Mockup: „05:00 wetter …“
