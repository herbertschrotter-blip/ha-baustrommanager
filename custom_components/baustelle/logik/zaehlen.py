"""Zählen: Energie aus Zählerständen, mittlere Leistung im Betrieb, Hochrechnungen – ohne Home-Assistant-Code."""

from __future__ import annotations

from datetime import date, timedelta

# Sprung eines Zählerstands, den wir nicht glauben (z. B. falscher Sensor gewählt), in kWh – nur noch, wenn die Zeit
# seit dem letzten Stand unbekannt ist
MAX_SPRUNG_KWH = 50.0
# Audit 0.8.165: so viel gilt auch bei sehr kurzem Abstand noch als glaubwürdig (Zähler meldet in Schüben)
MIN_SPRUNG_KWH = 0.5
# BSM-003: nach einer Lücke (Ausfall von HA, VPN oder Shelly) höchstens so viel je Stunde der Lücke – mehr kann ein
# Shelly Plug S nicht schalten (16 A · 230 V), mit Reserve
MAX_KW_GERAET = 3.68
SPRUNG_RESERVE = 1.1
# Gewicht eines neuen Messwerts im gleitenden Mittel der Leistung im Betrieb
MITTEL_GEWICHT = 0.05
# ab dieser Leistung gilt ein Heizgerät als „heizt gerade“ (W)
BETRIEB_AB_W = 5.0


# FE-0016: so weit springt ein Shelly-Zähler manchmal zurück (Messrauschen, ~1 Wh) – das ist kein Neustart
RUECKSPRUNG_KWH = 0.1


def sprung_grenze(stunden: float | None) -> float:
    """Größter glaubwürdiger Zuwachs (kWh) zwischen zwei Ständen, die `stunden` auseinander liegen (None = unbekannt).

    So viel, wie ein Shelly in der Zeit höchstens schalten kann, mindestens `MIN_SPRUNG_KWH` (BSM-003: vorher fehlte
    nach einem Ausfall von mehr als ≈ 25 h Heizen der ganze Verbrauch). Audit 0.8.165: früher galten immer mindestens
    `MAX_SPRUNG_KWH` – ein Plug-Tausch oder ein Rücksprung knapp über dem Rauschen buchte dann in einer Minute den ganzen
    Stand (z. B. 32 kWh) in Energie, Kosten und Abrechnung. Ohne bekannte Zeit bleibt `MAX_SPRUNG_KWH`.
    """
    if stunden is None:
        return MAX_SPRUNG_KWH
    return max(MIN_SPRUNG_KWH, stunden * MAX_KW_GERAET * SPRUNG_RESERVE)


def energie_zuwachs(alt: float | None, neu: float | None, stunden: float | None = None) -> float:
    """Zuwachs zwischen zwei Ständen eines Energiezählers (kWh); `stunden` = Zeit seit dem letzten Stand.

    Zählt der Shelly neu (Stand deutlich kleiner als vorher), gilt der neue Stand als Zuwachs. Ein Rücksprung um
    höchstens `RUECKSPRUNG_KWH` ist Rauschen und zählt nichts (FE-0016: vorher wurde dann der ganze Stand noch einmal
    gezählt). Unglaubwürdige Sprünge (über `sprung_grenze`) und fehlende Werte zählen nicht.
    """
    if alt is None or neu is None:
        return 0.0
    if neu < alt and alt - neu <= RUECKSPRUNG_KWH:
        return 0.0
    zuwachs = neu - alt if neu >= alt else neu
    return zuwachs if 0.0 <= zuwachs <= sprung_grenze(stunden) else 0.0


def zaehlerstand(alt: float | None, neu: float) -> float:
    """Stand, den sich die Integration merkt: bei Rauschen (kleiner Rücksprung) der alte – sonst würde der Rücksprung
    beim nächsten Wert noch einmal gezählt."""
    return alt if alt is not None and neu < alt and alt - neu <= RUECKSPRUNG_KWH else neu


def leistung_integriert(leistung_w: float | None, stunden: float) -> float:
    """Energie aus Leistung × Zeit (kWh), für Shellys ohne Energiezähler."""
    if leistung_w is None or leistung_w <= 0 or stunden <= 0:
        return 0.0
    return leistung_w * stunden / 1000


def mittel_im_betrieb(bisher: float | None, leistung_w: float | None) -> float | None:
    """Gleitendes Mittel der Leistung, nur während das Gerät heizt."""
    if leistung_w is None or leistung_w < BETRIEB_AB_W:
        return bisher
    if bisher is None:
        return leistung_w
    return bisher + MITTEL_GEWICHT * (leistung_w - bisher)


def tage_heizperiode(von_monat: int, bis_monat: int, jahr_beginn: int, bis_tag: date | None = None) -> int:
    """Tage einer Heizperiode, z. B. Oktober bis April (über den Jahreswechsel).

    `bis_tag`: geplantes Ende der Baustelle – liegt es in der Heizperiode, zählt sie nur bis dahin (einschließlich).
    """
    beginn = date(jahr_beginn, von_monat, 1)
    ende_jahr = jahr_beginn if bis_monat >= von_monat else jahr_beginn + 1
    ende = date(ende_jahr + (bis_monat == 12), 1 if bis_monat == 12 else bis_monat + 1, 1)
    if bis_tag is not None and bis_tag < ende:
        ende = max(beginn, bis_tag + timedelta(days=1))
    return (ende - beginn).days


def hochrechnung(summe: float, tage_gezaehlt: float, tage_ziel: int) -> float | None:
    """Bisherigen Tagesschnitt auf einen Zeitraum hochrechnen; erst ab einem Tag Daten."""
    if tage_gezaehlt < 1:
        return None
    return summe / tage_gezaehlt * tage_ziel


# Temperaturverhalten eines Containers (Vergleich Ölradiator/Konvektor)
RATE_GEWICHT = 0.3
AUFHEIZ_MIN_H = 0.5   # so lange muss durchgehend geheizt werden, bevor eine Aufheizrate zählt
ABKUEHL_MIN_H = 1.0   # so lange muss durchgehend aus sein, bevor eine Abkühlrate zählt


def rate(t_start: float, t_jetzt: float, stunden: float) -> float | None:
    """Temperaturänderung in °C je Stunde; None, wenn die Zeit zu kurz ist."""
    if stunden <= 0:
        return None
    return (t_jetzt - t_start) / stunden


def mittel(bisher: float | None, neu: float | None, gewicht: float = RATE_GEWICHT) -> float | None:
    """Gleitendes Mittel für Raten."""
    if neu is None:
        return bisher
    return neu if bisher is None else bisher + gewicht * (neu - bisher)


def gradstunden(innen: float | None, aussen: float | None, stunden: float) -> float:
    """Temperaturunterschied innen–außen × Zeit (nur wenn innen wärmer ist)."""
    if innen is None or aussen is None or stunden <= 0:
        return 0.0
    return max(0.0, innen - aussen) * stunden


def ersparnis_buchen(gebucht_kwh: float | None, eur: float | None, kwh: float, preis: float) -> tuple[float, float]:
    """Sensor „Ersparnis“ (€) fortlaufend buchen wie „Kosten“ (FE-0035): jede Änderung der gesparten kWh (ohne − geheizt,
    nie unter 0) zählt zum Preis, der gerade gilt – ein neuer Strompreis bewertet die Vergangenheit nicht um. Ergebnis:
    (gebuchte kWh, €). Erster Aufruf (bisher rechnete der Sensor Summe × Preis von heute): Startwert = genau dieser
    Wert, damit die Statistik von HA beim Umstellen nicht springt."""
    if gebucht_kwh is None or eur is None:
        return kwh, kwh * preis
    return kwh, eur + (kwh - gebucht_kwh) * preis
