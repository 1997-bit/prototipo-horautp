"""Textual TUI: subject picker -> preferences -> solve/grid -> export."""
from __future__ import annotations

import csv as csv_mod
from datetime import date, timedelta

from textual.app import App, ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.screen import Screen
from textual.widgets import (
    Button, Checkbox, DataTable, Footer, Header, Input, Label, RadioButton, RadioSet, Static,
)

from src.grid import build_week_grid
from src.model import DAY_ORDER, solve_all_schedules
from src.parser import list_subjects, load_slots
from src.preferences import section_preference_status

CSV_PATH = "data/horarios.csv"

WEEKDAY_INDEX = {
    "Lunes": 0, "Martes": 1, "Miercoles": 2, "Jueves": 3,
    "Viernes": 4, "Sabado": 5, "Domingo": 6,
}

HORARIO_OPTIONS = [
    ("manana", "Manana (<12:00pm)"),
    ("tarde", "Tarde (12:00pm-5:00pm)"),
    ("noche", "Noche (>=5:00pm)"),
    ("cualquiera", "Cualquiera"),
]


class SubjectPickerScreen(Screen):
    """Screen 1: checklist materias requeridas."""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Selecciona las materias requeridas:", classes="title")
        with VerticalScroll(id="subject-list"):
            for subj in self.app.subjects:
                yield Checkbox(
                    f"{subj['codasig']} - {subj['asignatura']}",
                    id=f"chk-{subj['codasig']}",
                )
        yield Horizontal(
            Button("Continuar", id="continue", variant="primary"),
            id="actions",
        )
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id != "continue":
            return
        selected = [chk.id.removeprefix("chk-") for chk in self.query(Checkbox) if chk.value]
        if not selected:
            self.notify("Selecciona al menos una materia.", severity="warning")
            return
        self.app.required_codasig = selected
        self.app.push_screen(PreferencesScreen())


class PreferencesScreen(Screen):
    """Screen 2: preferencias por materia."""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Preferencias (opcional):", classes="title")
        with VerticalScroll(id="prefs-list"):
            for codasig in self.app.required_codasig:
                subj = next(s for s in self.app.subjects if s["codasig"] == codasig)
                yield Label(f"{subj['codasig']} - {subj['asignatura']}", classes="subject-label")
                yield RadioSet(
                    *(
                        RadioButton(label, value=(key == "cualquiera"), id=f"{key}-{codasig}")
                        for key, label in HORARIO_OPTIONS
                    ),
                    id=f"horario-{codasig}",
                    classes="horario-radio",
                )
                yield Input(
                    placeholder="Profesor preferido (opcional)",
                    id=f"prof-{codasig}",
                    classes="prof-input",
                )
            yield Label("Preferencias globales:", classes="title")
            with Horizontal(classes="pref-row"):
                yield Label("Max. dias distintos por semana:")
                yield Input(placeholder="ej. 4", id="dias-max")
        yield Horizontal(
            Button("Atras", id="back"),
            Button("Resolver", id="solve", variant="primary"),
            id="actions",
        )
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.app.pop_screen()
            return
        if event.button.id != "solve":
            return

        prefs: dict = {}
        for codasig in self.app.required_codasig:
            entry = {}
            radio = self.query_one(f"#horario-{codasig}", RadioSet)
            if radio.pressed_button is not None:
                key = radio.pressed_button.id.split("-", 1)[0]
                if key != "cualquiera":
                    entry["horario"] = key
            prof_input = self.query_one(f"#prof-{codasig}", Input)
            if prof_input.value.strip():
                entry["profesor"] = prof_input.value.strip()
            if entry:
                prefs[codasig] = entry

        global_prefs = {}
        dias_input = self.query_one("#dias-max", Input).value.strip()
        if dias_input:
            try:
                global_prefs["dias_max"] = int(dias_input)
            except ValueError:
                self.notify("Max. dias debe ser un numero.", severity="error")
                return
        if global_prefs:
            prefs["global"] = global_prefs

        self.app.prefs = prefs
        self.app.push_screen(SolveScreen())


class SolveScreen(Screen):
    """Screen 3: [RESOLVER] -> grid horario semanal, navegable entre opciones."""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Resolviendo...", id="status", classes="title")
        with VerticalScroll(id="solve-body"):
            yield DataTable(id="grid")
            yield Label("Materias asignadas:", classes="title")
            yield DataTable(id="legend")
            yield Label("Validacion de preferencias:", classes="title")
            yield DataTable(id="validation")
        yield Horizontal(
            Button("Atras", id="back"),
            Button("< Anterior", id="prev", disabled=True),
            Button("Siguiente >", id="next", disabled=True),
            Button("Exportar", id="export", variant="primary", disabled=True),
            id="actions",
        )
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#grid", DataTable).add_columns("Hora", *DAY_ORDER)
        self.query_one("#legend", DataTable).add_columns(
            "Asignatura", "CodAsig", "CodHora", "Profesor", "Email", "Grupo"
        )
        self.query_one("#validation", DataTable).add_columns(
            "Materia", "Profesor", "Franja", "Pref. horario", "Pref. profesor"
        )
        self.run_solver()

    def run_solver(self) -> None:
        result = solve_all_schedules(self.app.slots, self.app.required_codasig, self.app.prefs)
        self.app.solve_options = result.get("options", [])
        self.app.option_index = 0

        status_label = self.query_one("#status", Label)
        if result["status"] == "INFEASIBLE" or not self.app.solve_options:
            status_label.update(f"Sin solucion: {result.get('reason', 'no hay combinaciones validas')}")
            return

        note = ""
        if result.get("capped"):
            note = f" (mostrando las primeras {len(self.app.solve_options)} combinaciones posibles)"
        self._capped_note = note
        self.query_one("#export", Button).disabled = False
        if len(self.app.solve_options) > 1:
            self.query_one("#next", Button).disabled = False
        self.render_current()

    def render_current(self) -> None:
        options = self.app.solve_options
        idx = self.app.option_index
        option = options[idx]
        sections = option["sections"]

        status_label = self.query_one("#status", Label)
        status_label.update(
            f"Opcion {idx + 1} de {len(options)} - penalidad: {option['penalty']}{getattr(self, '_capped_note', '')}"
        )

        grid = self.query_one("#grid", DataTable)
        grid.clear()
        for (period_start, period_end), day_cells in build_week_grid(sections):
            hora_label = f"{period_start.strftime('%I:%M%p')}-{period_end.strftime('%I:%M%p')}"
            grid.add_row(
                hora_label,
                *(self._cell_text(day_cells[d]) for d in DAY_ORDER),
                height=2,
            )

        legend = self.query_one("#legend", DataTable)
        legend.clear()
        for sec in sections:
            legend.add_row(
                sec["asignatura"], sec["codasig"], sec["codhora"],
                sec["profesor"], sec["email"], sec["grupo"],
            )

        validation = self.query_one("#validation", DataTable)
        validation.clear()
        for sec in sections:
            codasig_prefs = self.app.prefs.get(sec["codasig"], {})
            status = section_preference_status(sec, codasig_prefs)
            franjas = ", ".join(sorted({
                b["hora_inicio"].strftime("%I:%M%p") for b in sec["bloques"]
            }))
            validation.add_row(
                sec["asignatura"],
                sec["profesor"],
                franjas,
                self._mark(status["horario_ok"]),
                self._mark(status["profesor_ok"]),
            )

        self.query_one("#prev", Button).disabled = idx == 0
        self.query_one("#next", Button).disabled = idx == len(options) - 1

    @staticmethod
    def _mark(value: bool | None) -> str:
        if value is None:
            return "-"
        return "OK" if value else "X"

    @staticmethod
    def _cell_text(cell: dict | None) -> str:
        if cell is None:
            return ""
        suffix = {"Lab": " (L)", "Clase+Lab": " (C+L)"}.get(cell["tipo"], "")
        return f"{cell['asignatura']}{suffix}\naula {cell['aula']}"

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.app.pop_screen()
        elif event.button.id == "export":
            self.app.push_screen(ExportScreen())
        elif event.button.id == "prev":
            self.app.option_index = max(0, self.app.option_index - 1)
            self.render_current()
        elif event.button.id == "next":
            self.app.option_index = min(len(self.app.solve_options) - 1, self.app.option_index + 1)
            self.render_current()


class ExportScreen(Screen):
    """Screen 4: export (CSV / .ics) de la opcion actualmente seleccionada."""

    def compose(self) -> ComposeResult:
        yield Header()
        yield Label("Exportar horario", classes="title")
        yield Static(id="export-status")
        yield Horizontal(
            Button("Atras", id="back"),
            Button("Exportar CSV", id="csv"),
            Button("Exportar .ics", id="ics"),
            id="actions",
        )
        yield Footer()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "back":
            self.app.pop_screen()
            return
        sections = self.app.solve_options[self.app.option_index]["sections"]
        status = self.query_one("#export-status", Static)
        if event.button.id == "csv":
            path = export_csv(sections)
            status.update(f"CSV exportado a {path}")
        elif event.button.id == "ics":
            path = export_ics(sections)
            status.update(f"ICS exportado a {path}")


def export_csv(sections: list[dict], path: str = "export_horario.csv") -> str:
    with open(path, "w", newline="") as f:
        writer = csv_mod.writer(f)
        writer.writerow(["dia", "hora_inicio", "hora_fin", "asignatura", "tipo", "profesor", "aula", "grupo"])
        for sec in sections:
            for b in sec["bloques"]:
                writer.writerow([
                    b["dia"], b["hora_inicio"].strftime("%H:%M"), b["hora_fin"].strftime("%H:%M"),
                    sec["asignatura"], b["tipo"], sec["profesor"], b["aula"], sec["grupo"],
                ])
    return path


def _next_weekday(start: date, weekday_index: int) -> date:
    delta = (weekday_index - start.weekday()) % 7
    return start + timedelta(days=delta)


def export_ics(sections: list[dict], path: str = "export_horario.ics", weeks: int = 16) -> str:
    today = date.today()
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//horario-optimizer//ES"]
    uid_counter = 0
    for sec in sections:
        for b in sec["bloques"]:
            weekday_idx = WEEKDAY_INDEX[b["dia"]]
            first = _next_weekday(today, weekday_idx)
            dtstart = f"{first.strftime('%Y%m%d')}T{b['hora_inicio'].strftime('%H%M%S')}"
            dtend = f"{first.strftime('%Y%m%d')}T{b['hora_fin'].strftime('%H%M%S')}"
            uid_counter += 1
            lines += [
                "BEGIN:VEVENT",
                f"UID:{uid_counter}-{sec['codhora']}@horario-optimizer",
                f"DTSTART:{dtstart}",
                f"DTEND:{dtend}",
                f"RRULE:FREQ=WEEKLY;COUNT={weeks}",
                f"SUMMARY:{sec['asignatura']} ({b['tipo']})",
                f"DESCRIPTION:Profesor: {sec['profesor']} | Grupo: {sec['grupo']}",
                f"LOCATION:{b['aula']}",
                "END:VEVENT",
            ]
    lines.append("END:VCALENDAR")
    with open(path, "w") as f:
        f.write("\r\n".join(lines))
    return path


class ScheduleApp(App):
    """University schedule optimizer TUI."""

    CSS = """
    .title { padding: 1 2 0 2; text-style: bold; }
    .subject-label { padding: 1 2 0 2; text-style: bold; }
    .pref-row { padding: 0 2; height: auto; }
    .horario-radio { height: auto; padding: 0 2 0 4; }
    .prof-input { margin: 0 2 1 4; width: 40; }
    #actions { padding: 1 2; height: auto; }
    #subject-list, #prefs-list { padding: 0 1; }
    #solve-body { padding: 0 1; }
    #grid { height: auto; max-height: 26; }
    #legend { height: auto; max-height: 10; margin-top: 1; }
    #validation { height: auto; max-height: 10; margin-top: 1; }
    """

    def on_mount(self) -> None:
        self.slots = load_slots(CSV_PATH)
        self.subjects = list_subjects(self.slots)
        self.required_codasig: list[str] = []
        self.prefs: dict = {}
        self.solve_options: list[dict] = []
        self.option_index: int = 0
        self.push_screen(SubjectPickerScreen())
