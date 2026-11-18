"""Pivot chosen sections into a period x day weekly grid, matching UTP's
official schedule layout (see reference screenshot): one row per fixed
45-minute period with a 5-minute break, one column per weekday.

The period boundaries below aren't guesswork -- every distinct
(hora_inicio, hora_fin) block duration observed in data/horarios.csv
decomposes exactly into consecutive runs of these periods (95min blocks =
2 periods, 145min blocks = 3 periods, etc). Blocks from a different CSV
that don't align to this table still render correctly via the fallback
path below, just without pivoting into the canonical rows.
"""
from datetime import time

from src.model import DAY_ORDER

PERIODS = [
    (time(12, 50), time(13, 35)),
    (time(13, 40), time(14, 25)),
    (time(14, 30), time(15, 15)),
    (time(15, 20), time(16, 5)),
    (time(16, 10), time(16, 55)),
    (time(17, 50), time(18, 35)),
    (time(18, 40), time(19, 25)),
    (time(19, 30), time(20, 15)),
    (time(20, 20), time(21, 5)),
    (time(21, 10), time(21, 55)),
    (time(22, 0), time(22, 45)),
]


def _to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _make_cell(sec: dict, b: dict) -> dict:
    return {"asignatura": sec["asignatura"], "tipo": b["tipo"], "aula": b["aula"]}


def build_week_grid(sections: list[dict]) -> list[tuple[tuple[time, time], dict]]:
    """Returns [(period_start_end, {dia: cell_or_None}), ...] sorted by start time."""
    cells: dict[tuple[int, str], dict] = {}
    used_idxs: set[int] = set()
    unmatched: list[tuple[dict, dict]] = []

    for sec in sections:
        for b in sec["bloques"]:
            bs, be = _to_minutes(b["hora_inicio"]), _to_minutes(b["hora_fin"])
            matched = False
            for idx, (ps, pe) in enumerate(PERIODS):
                pms, pme = _to_minutes(ps), _to_minutes(pe)
                if bs <= pms and pme <= be:
                    cells[(idx, b["dia"])] = _make_cell(sec, b)
                    used_idxs.add(idx)
                    matched = True
            if not matched:
                unmatched.append((sec, b))

    rows = [
        (PERIODS[idx], {d: cells.get((idx, d)) for d in DAY_ORDER})
        for idx in sorted(used_idxs)
    ]

    # Fallback rows for blocks that don't align to the canonical period table
    # (e.g. a future CSV with a different institutional schedule).
    extra_ranges = sorted({(b["hora_inicio"], b["hora_fin"]) for _, b in unmatched})
    for ps, pe in extra_ranges:
        day_cells = {d: None for d in DAY_ORDER}
        for sec, b in unmatched:
            if b["hora_inicio"] == ps and b["hora_fin"] == pe:
                day_cells[b["dia"]] = _make_cell(sec, b)
        rows.append(((ps, pe), day_cells))

    rows.sort(key=lambda r: _to_minutes(r[0][0]))
    return rows
