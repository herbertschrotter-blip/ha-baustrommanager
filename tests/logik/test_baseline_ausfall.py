"""Baseline-Tage zählen nur, wenn der Container gemessen wurde (Bauplan Hochrechnung §6, Lauf a8f0d4a7 vom 07.–08.11.2026)."""

from datetime import date

from logik.baseline import Lauf, ausfall, ausfall_text, lauf_anzeige, tag_ausfall, zaehlende_tage
from logik.hochrechnung import VOLL_ANTEIL, TagRoh

SA, SO, MO = date(2026, 11, 7), date(2026, 11, 8), date(2026, 11, 9)
TAG = 86400.0


def roh(d, geraete_s=TAG, erfasst_s=TAG, kwh=8.0):
    return TagRoh(d, kwh, 5.0, erfasst_s, TAG, geraete_s)


def test_tag_voll_gemessen_zaehlt():
    assert tag_ausfall(roh(SA)) is None
    assert tag_ausfall(roh(SA, geraete_s=None)) is None   # ohne Heizkörper bzw. unbekannt: wie bisher nur die Mitschrift


def test_tag_mit_ausfall_zaehlt_nicht():
    # Sa 07.11.: Plugs ab 11:51 nicht erreichbar, HA schrieb die Container-Minuten weiter (erfasst voll)
    assert tag_ausfall(roh(SA, geraete_s=(11 * 60 + 51) * 60)) == "offline"
    assert tag_ausfall(roh(SO, geraete_s=0.0)) == "offline"
    assert tag_ausfall(roh(SA, erfasst_s=TAG / 2)) == "nicht mitgeschrieben"
    assert tag_ausfall(roh(SA, kwh=None)) == "keine Daten"
    assert tag_ausfall(None) == "keine Daten"


def test_grenzfall_schwelle():
    assert tag_ausfall(roh(SA, geraete_s=VOLL_ANTEIL * TAG)) is None
    assert tag_ausfall(roh(SA, geraete_s=VOLL_ANTEIL * TAG - 1)) == "offline"
    assert tag_ausfall(TagRoh(SA, 8.0, 5.0, 23 * 3600, 23 * 3600, VOLL_ANTEIL * (23 * 3600))) is None   # Sommerzeit: 23-h-Tag


def test_lauf_a8f0d4a7_zaehlt_nicht_mehr():
    l = Lauf("a8f0d4a7", "002", SA, MO, "fertig", 9.0, kwh=16.79)
    weg = ausfall([l], {"002": [roh(SA, geraete_s=42660.0), roh(SO, geraete_s=0.0)]}, date(2026, 10, 1), date(2026, 11, 17))
    assert weg == {"a8f0d4a7": {"2026-11-07": "offline", "2026-11-08": "offline"}}
    assert zaehlende_tage([l], weg).get("002", set()) == set()
    assert zaehlende_tage([l]) == {"002": {SA, SO}}   # ohne Bewertung wie bisher
    d = lauf_anzeige(l, "002_C_MAN", "konvektor", None, weg["a8f0d4a7"])
    assert d["status"] == "fertig" and d["zaehlt"] == 0 and d["tage"] == 2
    assert d["grund"] == "offline: Sa 07.11., So 08.11. – zählen nicht"
    assert d["ausfall"] == [{"tag": "2026-11-07", "grund": "offline"}, {"tag": "2026-11-08", "grund": "offline"}]


def test_ausfall_nur_ein_tag_und_abbruch():
    l = Lauf("1", "a", SA, MO, "fertig")
    weg = ausfall([l], {"a": [roh(SA), roh(SO, geraete_s=0.0)]}, date(2026, 10, 1), MO)
    assert zaehlende_tage([l], weg) == {"a": {SA}}
    ab = Lauf("2", "a", SA, MO, "abgebrochen", grund="Taste am Plug", ende=SO)
    w2 = ausfall([ab], {"a": [roh(SA, geraete_s=0.0), roh(SO, geraete_s=0.0)]}, date(2026, 10, 1), MO)
    assert w2 == {"2": {"2026-11-07": "offline"}}   # der Abbruchtag zählt ohnehin nicht
    assert lauf_anzeige(ab, "x", "", None, w2["2"])["grund"] == "Taste am Plug · offline: Sa 07.11. – zählt nicht"


def test_ausfall_bewertung_zeitraum():
    l = Lauf("1", "a", SA, MO, "fertig")
    # Tage ab heute: noch nicht bewertet (zählen vorläufig); gestern ohne Zeile ebenso (Nachtrag steht evtl. aus);
    # ältere Tage ohne Zeile: keine Daten
    assert ausfall([l], {"a": [roh(SA)]}, date(2026, 10, 1), SO) == {}
    assert ausfall([l], {"a": [roh(SA)]}, date(2026, 10, 1), MO) == {}
    assert ausfall([l], {"a": [roh(SA)]}, date(2026, 10, 1), date(2026, 11, 10)) == {"1": {"2026-11-08": "keine Daten"}}
    # gestern mit Zeile, aber offline: sofort bewertet
    assert ausfall([l], {"a": [roh(SA), roh(SO, geraete_s=0.0)]}, date(2026, 10, 1), MO) == {"1": {"2026-11-08": "offline"}}
    # vor `von` (außerhalb der gelesenen Tage) bleibt die alte Bewertung; ab `von` wird neu bewertet
    alt = {"1": {"2026-11-07": "offline", "2026-11-08": "offline"}}
    assert ausfall([l], {"a": [roh(SO)]}, SO, MO, alt) == {"1": {"2026-11-07": "offline"}}
    # geplante, laufende und abgesagte Läufe werden nicht bewertet
    assert ausfall([Lauf("2", "a", SA, MO, "laeuft"), Lauf("3", "a", SA, MO, "abgesagt")], {}, date(2026, 10, 1), MO) == {}


def test_ausfall_text():
    assert ausfall_text({}) is None
    assert ausfall_text({"2026-11-08": "keine Daten", "2026-11-07": "offline"}) == "offline: Sa 07.11.; keine Daten: So 08.11. – zählen nicht"


def test_vermutete_tuer_nicht_im_baseline_lauf() -> None:
    """Thermostat am Gerät voll auf: Gerät schaltet selbst ab, Raum kühlt – im Baseline-Lauf keine vermutete Tür."""
    from logik.baseline import tuer_vermuten
    assert tuer_vermuten(baseline=False) is True
    assert tuer_vermuten(baseline=True) is False
