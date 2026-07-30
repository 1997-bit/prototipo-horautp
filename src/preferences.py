"""Preference DSL and penalty scoring for candidate sections.

prefs = {
  "1474": {"horario": "manana" | "tarde" | "noche", "profesor": "ZURITA"},
  "global": {"dias_max": 4, "weights": {...}},
}
"""
from datetime import time

MANANA_TARDE_BOUNDARY = time(12, 0)
TARDE_NOCHE_BOUNDARY = time(17, 0)

FRANJAS = ("manana", "tarde", "noche")

DEFAULT_WEIGHTS = {
    "horario": 10,
    "profesor": 15,
    "dias_excess": 20,
}


def clasificar_franja(hora_inicio: time) -> str:
    if hora_inicio < MANANA_TARDE_BOUNDARY:
        return "manana"
    if hora_inicio < TARDE_NOCHE_BOUNDARY:
        return "tarde"
    return "noche"


def section_franjas(section: dict) -> set[str]:
    return {clasificar_franja(b["hora_inicio"]) for b in section["bloques"]}


def section_matches_horario(section: dict, deseado: str) -> bool:
    if deseado not in FRANJAS:
        return True  # "cualquiera" or unset
    return section_franjas(section) == {deseado}


def section_matches_profesor(section: dict, deseado: str) -> bool:
    return deseado.strip().upper() in section["profesor"].upper()


def section_preference_status(section: dict, codasig_prefs: dict) -> dict:
    horario = codasig_prefs.get("horario")
    profesor = codasig_prefs.get("profesor")
    return {
        "horario_ok": section_matches_horario(section, horario) if horario else None,
        "profesor_ok": section_matches_profesor(section, profesor) if profesor else None,
    }


def section_penalty(section: dict, codasig_prefs: dict, weights: dict = DEFAULT_WEIGHTS) -> int:
    penalty = 0

    horario = codasig_prefs.get("horario")
    if horario and not section_matches_horario(section, horario):
        penalty += weights["horario"]

    profesor = codasig_prefs.get("profesor")
    if profesor and not section_matches_profesor(section, profesor):
        penalty += weights["profesor"]

    return penalty
