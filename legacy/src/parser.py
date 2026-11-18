"""CSV -> list[Slot]. One Slot per CSV row (one meeting-time block)."""
from datetime import time

import pandas as pd

DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]


def _parse_time(value: str) -> time:
    return pd.to_datetime(value, format="%I:%M:%S %p").time()


def load_slots(csv_path: str) -> list[dict]:
    df = pd.read_csv(csv_path, dtype={"codasig": str, "codhora": str})

    slots = []
    for i, row in df.iterrows():
        slots.append({
            "id": i,
            "grupo": row["grupo"],
            "periodo": row["periodo"],
            "codasig": row["codasig"],
            "asignatura": row["asignatura"].strip(),
            "codhora": row["codhora"],
            "profesor": row["profesor"].strip(),
            "email": row["email"],
            "dia": row["dia"],
            "hora_inicio": _parse_time(row["hora_inicio"]),
            "hora_fin": _parse_time(row["hora_fin"]),
            "tipo": row["tipo"],
            "aula": row["aula"],
        })
    return slots


def list_subjects(slots: list[dict]) -> list[dict]:
    """Unique (codasig, asignatura) pairs available across all slots."""
    seen = {}
    for s in slots:
        seen.setdefault(s["codasig"], s["asignatura"])
    return [{"codasig": k, "asignatura": v} for k, v in seen.items()]
