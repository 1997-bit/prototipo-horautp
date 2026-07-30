"""CP-SAT scheduling model.

A CSV row is one meeting-time block (Slot). The unit a student actually
registers for is a *section*: all rows sharing (grupo, codasig, codhora).
Grouping by codhora is also what satisfies the "Lab requires its matching
Clase" rule for free -- Lab and Clase rows of the same offering share a
codhora, so they are always chosen or dropped together.

solve_all_schedules enumerates every feasible combination (one section per
required subject, no time overlaps) rather than a single optimum, since the
soft preferences are just used to rank/annotate options, not to prune them.
"""
from collections import defaultdict

from ortools.sat.python import cp_model

from src.preferences import DEFAULT_WEIGHTS, section_penalty

DAY_ORDER = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

MAX_SOLUTIONS = 500
DEFAULT_TIME_LIMIT_S = 30.0


def _to_minutes(t) -> int:
    return t.hour * 60 + t.minute


def build_sections(slots: list[dict]) -> list[dict]:
    grouped = defaultdict(list)
    for s in slots:
        grouped[(s["grupo"], s["codasig"], s["codhora"])].append(s)

    sections = []
    for idx, ((grupo, codasig, codhora), rows) in enumerate(grouped.items()):
        rows = sorted(rows, key=lambda r: (DAY_ORDER.index(r["dia"]), r["hora_inicio"]))
        sections.append({
            "section_id": idx,
            "grupo": grupo,
            "codasig": codasig,
            "asignatura": rows[0]["asignatura"],
            "codhora": codhora,
            "profesor": rows[0]["profesor"],
            "email": rows[0]["email"],
            "bloques": [
                {
                    "dia": r["dia"],
                    "hora_inicio": r["hora_inicio"],
                    "hora_fin": r["hora_fin"],
                    "tipo": r["tipo"],
                    "aula": r["aula"],
                }
                for r in rows
            ],
        })
    return sections


def _overlaps(a: dict, b: dict) -> bool:
    for ba in a["bloques"]:
        for bb in b["bloques"]:
            if ba["dia"] != bb["dia"]:
                continue
            sa, ea = _to_minutes(ba["hora_inicio"]), _to_minutes(ba["hora_fin"])
            sb, eb = _to_minutes(bb["hora_inicio"]), _to_minutes(bb["hora_fin"])
            if sa < eb and sb < ea:
                return True
    return False


def _dias_excess_penalty(sections: list[dict], global_prefs: dict, weights: dict) -> int:
    dias_max = global_prefs.get("dias_max")
    if dias_max is None:
        return 0
    dias_usados = {b["dia"] for s in sections for b in s["bloques"]}
    excess = max(0, len(dias_usados) - dias_max)
    return weights["dias_excess"] * excess


def _combo_penalty(sections: list[dict], prefs: dict, weights: dict) -> int:
    penalty = sum(section_penalty(s, prefs.get(s["codasig"], {}), weights) for s in sections)
    penalty += _dias_excess_penalty(sections, prefs.get("global", {}), weights)
    return penalty


class _CollectAllSolutions(cp_model.CpSolverSolutionCallback):
    def __init__(self, choice_vars: dict[int, cp_model.IntVar], sections_by_id: dict[int, dict], max_solutions: int):
        super().__init__()
        self._choice_vars = choice_vars
        self._sections_by_id = sections_by_id
        self._max_solutions = max_solutions
        self.combos: list[list[dict]] = []
        self.capped = False

    def on_solution_callback(self) -> None:
        picked = [
            self._sections_by_id[sid]
            for sid, var in self._choice_vars.items()
            if self.Value(var) == 1
        ]
        self.combos.append(picked)
        if len(self.combos) >= self._max_solutions:
            self.capped = True
            self.StopSearch()


def solve_all_schedules(
    slots: list[dict],
    required_codasig: list[str],
    prefs: dict | None = None,
    max_solutions: int = MAX_SOLUTIONS,
    time_limit_s: float = DEFAULT_TIME_LIMIT_S,
) -> dict:
    prefs = prefs or {}
    weights = {**DEFAULT_WEIGHTS, **prefs.get("global", {}).get("weights", {})}

    sections = build_sections(slots)
    by_codasig = defaultdict(list)
    for sec in sections:
        by_codasig[sec["codasig"]].append(sec)

    missing = [c for c in required_codasig if c not in by_codasig]
    if missing:
        return {"status": "INFEASIBLE", "reason": f"sin secciones para: {missing}", "options": []}

    model = cp_model.CpModel()
    choice_vars: dict[int, cp_model.IntVar] = {}

    for codasig in required_codasig:
        candidates = by_codasig[codasig]
        cvars = [model.NewBoolVar(f"sec_{s['section_id']}") for s in candidates]
        model.AddExactlyOne(cvars)
        for s, v in zip(candidates, cvars):
            choice_vars[s["section_id"]] = v

    chosen_pool = [s for s in sections if s["section_id"] in choice_vars]

    for i, a in enumerate(chosen_pool):
        for b in chosen_pool[i + 1:]:
            if a["codasig"] == b["codasig"]:
                continue  # already mutually exclusive via AddExactlyOne
            if _overlaps(a, b):
                model.Add(choice_vars[a["section_id"]] + choice_vars[b["section_id"]] <= 1)

    sections_by_id = {s["section_id"]: s for s in chosen_pool}

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.enumerate_all_solutions = True
    solver.parameters.num_search_workers = 1  # required for full enumeration

    collector = _CollectAllSolutions(choice_vars, sections_by_id, max_solutions)
    status = solver.Solve(model, collector)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE) or not collector.combos:
        return {
            "status": "INFEASIBLE",
            "reason": "no hay combinacion de secciones sin choques",
            "options": [],
        }

    options = [
        {"sections": sorted(combo, key=lambda s: s["codasig"]), "penalty": _combo_penalty(combo, prefs, weights)}
        for combo in collector.combos
    ]
    options.sort(key=lambda o: o["penalty"])

    return {
        "status": "OK",
        "options": options,
        "capped": collector.capped,
        "total_found": len(options),
    }
