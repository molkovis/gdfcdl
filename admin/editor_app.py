from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import tkinter as tk
from datetime import date, datetime
from pathlib import Path
from tkinter import messagebox, ttk


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LEVELS_PATH = DATA / "levels.json"
PLAYERS_PATH = DATA / "players.json"
CONFIG_PATH = DATA / "config.json"
SITE_URL = "https://molkovis.github.io/gdfcdl/"
REPO_URLS = {"https://github.com/molkovis/gdfcdl", "git@github.com:molkovis/gdfcdl"}
BG = "#101820"
PANEL = "#17232e"
PANEL_2 = "#202e3a"
ENTRY = "#101920"
LINE = "#344450"
TEXT = "#f2f5f6"
MUTED = "#9aabb6"
ORANGE = "#ffa34f"
RED = "#ff9e98"


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
URL_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)


def valid_date(value: str) -> bool:
    if not DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def valid_url(value: str) -> bool:
    return bool(URL_RE.match(value))


def today() -> str:
    return date.today().isoformat()


def slugify(value: str) -> str:
    value = value.strip().lower().replace("ё", "e")
    value = value.translate(str.maketrans("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", "abvgdeejziyklmnoprstufhccss_y_eua"))
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value)).strip("-") or "new-level"


def atomic_write(path: Path, value: object) -> None:
    serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=path.parent, delete=False) as temp:
        temp.write(serialized)
        temp_path = Path(temp.name)
    try:
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


class LevelEditor:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("GDFC Demonlist — Редактор данных")
        self.root.geometry("1240x820")
        self.root.minsize(980, 650)
        self.root.configure(bg=BG)
        self.style = ttk.Style(root)
        try:
            self.style.theme_use("clam")
        except tk.TclError:
            pass
        self.configure_style()

        self.levels: list[dict] = []
        self.players: list[dict] = []
        self.categories: list[dict] = []
        self.selected = -1
        self.query = tk.StringVar()
        self.status = tk.StringVar(value="Загружаю JSON…")
        self.fields: dict[str, tk.Variable] = {}
        self.victor_vars: list[dict[str, tk.Variable]] = []
        self.category_names: dict[str, str] = {}
        self._build_shell()
        self.load_data()

    def configure_style(self) -> None:
        self.style.configure("TFrame", background=BG)
        self.style.configure("Panel.TFrame", background=PANEL)
        self.style.configure("Nested.TFrame", background=PANEL_2)
        self.style.configure("TLabel", background=BG, foreground=TEXT, font=("Segoe UI", 10))
        self.style.configure("Panel.TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI", 10))
        self.style.configure("Muted.TLabel", background=PANEL, foreground=MUTED, font=("Segoe UI", 9))
        self.style.configure("Eyebrow.TLabel", background=BG, foreground=ORANGE, font=("Consolas", 9, "bold"))
        self.style.configure("PanelEyebrow.TLabel", background=PANEL, foreground=ORANGE, font=("Consolas", 9, "bold"))
        self.style.configure("Title.TLabel", background=BG, foreground=TEXT, font=("Segoe UI", 22, "bold"))
        self.style.configure("Section.TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI", 13, "bold"))
        self.style.configure("TButton", background=PANEL_2, foreground=TEXT, bordercolor=LINE, padding=(12, 8), font=("Segoe UI", 9, "bold"))
        self.style.map("TButton", background=[("active", "#2b3b48"), ("disabled", "#28333b")], foreground=[("disabled", "#788690")])
        self.style.configure("Primary.TButton", background="#e99545", foreground="#17191b", bordercolor="#d38236")
        self.style.map("Primary.TButton", background=[("active", "#ffb261"), ("disabled", "#815a36")])
        self.style.configure("Small.TButton", padding=(9, 6), font=("Segoe UI", 9))
        self.style.configure("TEntry", fieldbackground=ENTRY, foreground=TEXT, insertcolor=TEXT, bordercolor=LINE, padding=8)
        self.style.configure("TCombobox", fieldbackground=ENTRY, background=ENTRY, foreground=TEXT, arrowcolor=ORANGE, bordercolor=LINE, padding=7)
        self.style.map("TCombobox", fieldbackground=[("readonly", ENTRY)], foreground=[("readonly", TEXT)], selectbackground=[("readonly", ENTRY)], selectforeground=[("readonly", TEXT)])
        self.style.configure("Treeview", background=PANEL, fieldbackground=PANEL, foreground=TEXT, bordercolor=LINE, rowheight=37, font=("Segoe UI", 9))
        self.style.configure("Treeview.Heading", background=PANEL_2, foreground=MUTED, font=("Segoe UI", 8, "bold"), relief="flat")
        self.style.map("Treeview", background=[("selected", "#3b3024")], foreground=[("selected", TEXT)])

    def _build_shell(self) -> None:
        header = ttk.Frame(self.root, padding=(18, 13, 18, 11))
        header.pack(fill="x")
        ttk.Label(header, text="GDFC  /  DEMONLIST", style="Eyebrow.TLabel").pack(side="left")
        ttk.Label(header, text="ЛОКАЛЬНЫЙ РЕДАКТОР", style="Muted.TLabel").pack(side="left", padx=(18, 0))
        ttk.Button(header, text="Открыть сайт ↗", command=lambda: self.open_site()).pack(side="right")
        ttk.Separator(self.root).pack(fill="x")

        titlebar = ttk.Frame(self.root, padding=(22, 16, 22, 14))
        titlebar.pack(fill="x")
        left_title = ttk.Frame(titlebar)
        left_title.pack(side="left", fill="x", expand=True)
        ttk.Label(left_title, text="ПАНЕЛЬ УПРАВЛЕНИЯ / ДАННЫЕ", style="Eyebrow.TLabel").pack(anchor="w")
        ttk.Label(left_title, text="Редактор уровней", style="Title.TLabel").pack(anchor="w", pady=(3, 3))
        ttk.Label(left_title, text="Showcase уровня и отдельные видео победителей. Сначала сохранение локально, затем отправка.", style="Muted.TLabel").pack(anchor="w")
        actions = ttk.Frame(titlebar)
        actions.pack(side="right", anchor="e", padx=(18, 0))
        self.pull_button = ttk.Button(actions, text="Загрузить с GitHub ↓", command=self.pull_remote)
        self.pull_button.grid(row=0, column=0, padx=3)
        ttk.Button(actions, text="Редактировать JSON", command=self.open_json_editor).grid(row=0, column=1, padx=3)
        ttk.Button(actions, text="Сохранить локально", command=self.save_local).grid(row=0, column=2, padx=3)
        self.publish_button = ttk.Button(actions, text="Отправить на GitHub ↗", style="Primary.TButton", command=self.publish)
        self.publish_button.grid(row=0, column=3, padx=(3, 0))

        body = ttk.Panedwindow(self.root, orient="horizontal")
        body.pack(fill="both", expand=True, padx=18, pady=(3, 12))
        self.browser_panel = ttk.Frame(body, style="Panel.TFrame", padding=13)
        self.editor_panel = ttk.Frame(body, style="Panel.TFrame", padding=18)
        body.add(self.browser_panel, weight=1)
        body.add(self.editor_panel, weight=3)
        self._build_browser()
        self._build_editor_area()
        ttk.Separator(self.root).pack(fill="x")
        ttk.Label(self.root, textvariable=self.status, anchor="w", padding=(18, 8), style="Muted.TLabel").pack(fill="x")

    def _build_browser(self) -> None:
        top = ttk.Frame(self.browser_panel, style="Panel.TFrame")
        top.pack(fill="x", pady=(0, 10))
        label = ttk.Frame(top, style="Panel.TFrame")
        label.pack(side="left", fill="x", expand=True)
        ttk.Label(label, text="КАТАЛОГ", style="PanelEyebrow.TLabel").pack(anchor="w")
        self.count_label = ttk.Label(label, text="Уровни", style="Section.TLabel")
        self.count_label.pack(anchor="w", pady=(2, 0))
        ttk.Button(top, text="+ Добавить", style="Small.TButton", command=self.add_level).pack(side="right", anchor="n")
        search = ttk.Entry(self.browser_panel, textvariable=self.query)
        search.pack(fill="x", pady=(0, 9))
        search.insert(0, "")
        self.query.trace_add("write", lambda *_: self.render_level_list())
        tree_wrap = ttk.Frame(self.browser_panel, style="Panel.TFrame")
        tree_wrap.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(tree_wrap, columns=("position", "name", "category"), show="headings", selectmode="browse")
        self.tree.heading("position", text="#")
        self.tree.heading("name", text="УРОВЕНЬ")
        self.tree.heading("category", text="LIST")
        self.tree.column("position", width=43, minwidth=38, stretch=False, anchor="center")
        self.tree.column("name", width=150, minwidth=80, stretch=True)
        self.tree.column("category", width=63, minwidth=52, stretch=False, anchor="center")
        scroll = ttk.Scrollbar(tree_wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self.select_level)

    def _build_editor_area(self) -> None:
        self.canvas = tk.Canvas(self.editor_panel, bg=PANEL, highlightthickness=0)
        self.editor_scroll = ttk.Scrollbar(self.editor_panel, orient="vertical", command=self.canvas.yview)
        self.form_frame = ttk.Frame(self.canvas, style="Panel.TFrame")
        self.form_window = self.canvas.create_window((0, 0), window=self.form_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.editor_scroll.set)
        self.form_frame.bind("<Configure>", lambda _: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda event: self.canvas.itemconfigure(self.form_window, width=event.width))
        self.canvas.pack(side="left", fill="both", expand=True)
        self.editor_scroll.pack(side="right", fill="y")
        self.canvas.bind("<Enter>", lambda _e: self.canvas.bind_all("<MouseWheel>", self._mousewheel))
        self.canvas.bind("<Leave>", lambda _e: self.canvas.unbind_all("<MouseWheel>"))

    def _mousewheel(self, event: tk.Event) -> None:
        if self.canvas.winfo_exists():
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def load_data(self) -> None:
        try:
            self.levels = json.loads(LEVELS_PATH.read_text(encoding="utf-8-sig"))
            player_data = json.loads(PLAYERS_PATH.read_text(encoding="utf-8-sig"))
            self.players = player_data if isinstance(player_data, list) else player_data.get("players", [])
            config = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
            self.categories = config.get("categories", [])
            if isinstance(self.categories, dict):
                self.categories = [self.categories]
            self.category_names = {item.get("id", "main"): item.get("name", item.get("id", "Main List")) for item in self.categories}
            self.selected = 0 if self.levels else -1
            self.render_level_list()
            self.render_editor()
            self.status.set(f"Загружено: {len(self.levels)} уровней, {len(self.players)} игроков · файлы хранятся локально")
        except (OSError, json.JSONDecodeError, AttributeError) as error:
            messagebox.showerror("Ошибка JSON", f"Не удалось загрузить данные проекта:\n{error}")
            self.status.set("Не удалось прочитать data JSON.")

    def render_level_list(self) -> None:
        if not hasattr(self, "tree"):
            return
        self.tree.delete(*self.tree.get_children())
        query = self.query.get().casefold()
        ordered = sorted(enumerate(self.levels), key=lambda pair: (int(pair[1].get("position", 999999) or 999999), pair[0]))
        for index, level in ordered:
            if query and query not in f"{level.get('name', '')} {level.get('id', '')} {level.get('position', '')}".casefold():
                continue
            category = level.get("category") or (level.get("categories") or [""])[0]
            self.tree.insert("", "end", iid=str(index), values=(f"#{level.get('position', '—')}", level.get("name", "Без названия"), category.upper()))
        self.count_label.configure(text=f"Уровни  ·  {len(self.levels):02d}")
        if self.selected >= 0 and self.tree.exists(str(self.selected)):
            self.tree.selection_set(str(self.selected))
            self.tree.see(str(self.selected))

    def select_level(self, _event: tk.Event | None = None) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        selected = int(selection[0])
        if selected == self.selected:
            return
        self.selected = selected
        self.render_editor()

    def add_level(self) -> None:
        used = {item.get("id") for item in self.levels}
        suffix = len(self.levels) + 1
        level_id = f"new-level-{suffix}"
        while level_id in used:
            suffix += 1
            level_id = f"new-level-{suffix}"
        max_position = max((item.get("position", 0) for item in self.levels if isinstance(item.get("position"), int)), default=0)
        category = next(iter(self.category_names), "main")
        self.levels.append({"id": level_id, "name": "Новый уровень", "position": max_position + 1, "category": category, "levelId": "", "creators": [], "verifier": "", "showcase": "", "description": "", "victors": []})
        self.selected = len(self.levels) - 1
        self.render_level_list()
        self.render_editor()
        self.status.set("Добавлен новый уровень. Заполните поля, затем сохраните локально.")

    def render_editor(self) -> None:
        for child in self.form_frame.winfo_children():
            child.destroy()
        self.fields = {}
        self.victor_vars = []
        if self.selected < 0 or self.selected >= len(self.levels):
            empty = ttk.Frame(self.form_frame, style="Panel.TFrame", padding=(24, 150))
            empty.pack(fill="both", expand=True)
            ttk.Label(empty, text="Выберите уровень или добавьте новый.", style="Muted.TLabel").pack()
            self.render_level_list()
            return
        level = self.levels[self.selected]
        level.setdefault("victors", [])
        if not isinstance(level["victors"], list):
            level["victors"] = []
        heading = ttk.Frame(self.form_frame, style="Panel.TFrame")
        heading.pack(fill="x", pady=(0, 13))
        left = ttk.Frame(heading, style="Panel.TFrame")
        left.pack(side="left", fill="x", expand=True)
        ttk.Label(left, text=f"УРОВЕНЬ / ПОЗИЦИЯ #{level.get('position', '—')}", style="PanelEyebrow.TLabel").pack(anchor="w")
        ttk.Label(left, text=level.get("name", "Новый уровень"), style="Section.TLabel").pack(anchor="w", pady=(2, 0))
        ttk.Button(heading, text="Удалить", command=self.delete_level).pack(side="right", anchor="n")
        ttk.Button(heading, text="▼ Ниже", command=lambda: self.shift_level(1)).pack(side="right", anchor="n", padx=(0, 6))
        ttk.Button(heading, text="▲ Выше", command=lambda: self.shift_level(-1)).pack(side="right", anchor="n", padx=(0, 6))
        ttk.Separator(self.form_frame).pack(fill="x", pady=(0, 13))

        fields = [
            ("name", "Название", 0, 0, "Например, Tidal Wave"),
            ("id", "ID в JSON", 0, 1, "tidal-wave"),
            ("position", "Позиция  ·  Enter: вставить сюда, остальные сдвинутся", 1, 0, "1"),
            ("category", "Категория", 1, 1, ""),
            ("levelId", "ID Geometry Dash", 2, 0, "88464846"),
            ("creators", "Создатели (через запятую)", 2, 1, "Автор 1, Автор 2"),
            ("verifier", "Верифер", 3, 0, ""),
            ("showcase", "Showcase уровня", 3, 1, "https://youtu.be/..."),
        ]
        grid = ttk.Frame(self.form_frame, style="Panel.TFrame")
        grid.pack(fill="x")
        grid.columnconfigure(0, weight=1, uniform="field")
        grid.columnconfigure(1, weight=1, uniform="field")
        for key, label, row, col, placeholder in fields:
            box = ttk.Frame(grid, style="Panel.TFrame")
            box.grid(row=row, column=col, sticky="ew", padx=(0 if col == 0 else 8, 8 if col == 0 else 0), pady=5)
            ttk.Label(box, text=label, style="Muted.TLabel").pack(anchor="w", pady=(0, 4))
            initial = ", ".join(level.get("creators", [])) if key == "creators" and isinstance(level.get("creators"), list) else level.get(key, "")
            if key == "category":
                initial = level.get("category") or (level.get("categories") or [next(iter(self.category_names), "main")])[0]
                variable = tk.StringVar(value=self.category_names.get(initial, initial))
                widget = ttk.Combobox(box, textvariable=variable, state="readonly", values=list(self.category_names.values()))
                widget.bind("<<ComboboxSelected>>", lambda _e, k=key, var=variable: self.update_field(k, var.get()))
            elif key == "verifier":
                verifier_options = {"— Не выбран —": ""}
                current_verifier = str(level.get("verifier", "")).strip()
                selected_label = "— Не выбран —"
                for player in self.players:
                    player_id = str(player.get("id", "")).strip()
                    nickname = str(player.get("nickname", "")).strip()
                    if not player_id or not nickname:
                        continue
                    option = nickname if nickname not in verifier_options else f"{nickname} · {player_id}"
                    verifier_options[option] = player_id
                    if current_verifier in (player_id, nickname):
                        selected_label = option
                if current_verifier and current_verifier not in verifier_options.values() and not any(current_verifier == str(p.get("nickname", "")).strip() for p in self.players):
                    selected_label = f"Неизвестный игрок · {current_verifier}"
                    verifier_options[selected_label] = current_verifier
                variable = tk.StringVar(value=selected_label)
                widget = ttk.Combobox(box, textvariable=variable, state="readonly", values=list(verifier_options))
                widget.bind("<<ComboboxSelected>>", lambda _e, var=variable, options=verifier_options: self.update_verifier(options.get(var.get(), "")))
            else:
                variable = tk.StringVar(value=str(initial))
                widget = ttk.Entry(box, textvariable=variable)
                if placeholder:
                    widget.configure(exportselection=False)
                if key == "position":
                    widget.bind("<Return>", lambda _e: self.commit_position())
                    widget.bind("<KP_Enter>", lambda _e: self.commit_position())
                    widget.bind("<FocusOut>", lambda _e: self.commit_position())
                else:
                    variable.trace_add("write", lambda *_args, k=key, var=variable: self.update_field(k, var.get()))
            widget.pack(fill="x")
            self.fields[key] = variable

        description_box = ttk.Frame(self.form_frame, style="Panel.TFrame")
        description_box.pack(fill="x", pady=(7, 0))
        ttk.Label(description_box, text="Описание", style="Muted.TLabel").pack(anchor="w", pady=(0, 4))
        self.description = tk.Text(description_box, height=3, wrap="word", bg=ENTRY, fg=TEXT, insertbackground=TEXT, relief="flat", highlightthickness=1, highlightbackground=LINE, highlightcolor=ORANGE, padx=9, pady=8, font=("Segoe UI", 9))
        self.description.pack(fill="x")
        self.description.insert("1.0", level.get("description", ""))
        self.description.bind("<KeyRelease>", lambda _e: level.__setitem__("description", self.description.get("1.0", "end-1c")))

        section = ttk.Frame(self.form_frame, style="Panel.TFrame")
        section.pack(fill="x", pady=(18, 8))
        titles = ttk.Frame(section, style="Panel.TFrame")
        titles.pack(side="left", fill="x", expand=True)
        ttk.Label(titles, text="Победители", style="Section.TLabel").pack(anchor="w")
        ttk.Label(titles, text="Дата полного прохождения и собственная ссылка на видео каждого игрока.", style="Muted.TLabel").pack(anchor="w", pady=(3, 0))
        ttk.Button(section, text="+ Добавить победителя", command=self.add_victor).pack(side="right", anchor="n")
        self.victor_frame = ttk.Frame(self.form_frame, style="Panel.TFrame")
        self.victor_frame.pack(fill="x")
        self.render_victors()
        ttk.Separator(self.form_frame).pack(fill="x", pady=(16, 9))
        bottom = ttk.Frame(self.form_frame, style="Panel.TFrame")
        bottom.pack(fill="x")
        ttk.Button(bottom, text="+ Добавить игрока", command=self.add_player_dialog).pack(side="left")
        self.render_level_list()

    def move_level(self, level: dict, new_position: int) -> int:
        """Поставить уровень на new_position и сдвинуть уровни между старым и новым местом.

        Возвращает, сколько других уровней сдвинуто. Работает и для вставки:
        новый уровень добавляется в конец, а затем «перемещается» на нужное место.
        """
        old = level.get("position")
        old = old if isinstance(old, int) and not isinstance(old, bool) else None
        others = [item for item in self.levels if item is not level and isinstance(item.get("position"), int)]
        top = max([item["position"] for item in others] + ([old] if old else []) + [0])
        new_position = max(1, min(new_position, top if old else top + 1))
        shifted = 0
        for item in others:
            pos = item["position"]
            if old is None:
                hit = pos >= new_position
                step = 1
            elif new_position < old:
                hit = new_position <= pos < old
                step = 1
            else:
                hit = old < pos <= new_position
                step = -1
            if hit:
                item["position"] = pos + step
                shifted += 1
        level["position"] = new_position
        return shifted

    def commit_position(self) -> None:
        level = self.current_level()
        variable = self.fields.get("position")
        if not level or variable is None:
            return
        raw = variable.get().strip()
        if not raw.isdigit() or int(raw) < 1:
            variable.set(str(level.get("position", "")))
            if raw:
                self.status.set("Позиция должна быть целым числом от 1.")
            return
        if level.get("position") == int(raw):
            return
        shifted = self.move_level(level, int(raw))
        self.status.set(f"Уровень поставлен на #{level['position']}; сдвинуто других уровней: {shifted}. Сохраните локально.")
        self.render_level_list()
        self.render_editor()

    def shift_level(self, delta: int) -> None:
        level = self.current_level()
        if not level or not isinstance(level.get("position"), int):
            return
        target = level["position"] + delta
        if target < 1:
            return
        if not any(item is not level and item.get("position") == target for item in self.levels):
            self.status.set("Дальше в эту сторону уровней нет.")
            return
        self.move_level(level, target)
        self.status.set(f"Уровень перемещён на #{level['position']}. Сохраните локально.")
        self.render_level_list()
        self.render_editor()

    def update_field(self, key: str, value: str) -> None:
        level = self.current_level()
        if not level:
            return
        if key == "position":
            level[key] = int(value) if value.isdigit() else value
        elif key == "category":
            level[key] = next((cat_id for cat_id, name in self.category_names.items() if name == value), value)
        else:
            level[key] = value
        if key in ("name", "position", "category"):
            self.render_level_list()

    def update_verifier(self, player_id: str) -> None:
        level = self.current_level()
        if not level:
            return
        level["verifier"] = player_id

    def current_level(self) -> dict | None:
        if 0 <= self.selected < len(self.levels):
            return self.levels[self.selected]
        return None

    def render_victors(self) -> None:
        for child in self.victor_frame.winfo_children():
            child.destroy()
        level = self.current_level()
        if not level:
            return
        if not level["victors"]:
            ttk.Label(self.victor_frame, text="Победителей пока нет.", style="Muted.TLabel").pack(anchor="w", pady=9)
            return
        player_names = [f"{player.get('nickname', player.get('id'))}  ·  {player.get('id')}" for player in self.players]
        for index, victor in enumerate(level["victors"]):
            card = ttk.Frame(self.victor_frame, style="Nested.TFrame", padding=9)
            card.pack(fill="x", pady=4)
            card.columnconfigure(0, weight=2)
            card.columnconfigure(1, weight=1)
            card.columnconfigure(2, weight=3)
            player_id = victor.get("playerId", "")
            player_label = next((f"{p.get('nickname', p.get('id'))}  ·  {p.get('id')}" for p in self.players if p.get("id") == player_id), "Выберите игрока")
            player_var = tk.StringVar(value=player_label)
            date_var = tk.StringVar(value=victor.get("date", ""))
            video_var = tk.StringVar(value=victor.get("video", ""))
            self.victor_vars.append({"playerId": player_var, "date": date_var, "video": video_var})
            ttk.Label(card, text="Игрок", style="Muted.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 7))
            ttk.Label(card, text="Дата 100%", style="Muted.TLabel").grid(row=0, column=1, sticky="w", padx=7)
            ttk.Label(card, text="Видео прохождения", style="Muted.TLabel").grid(row=0, column=2, sticky="w", padx=7)
            player_combo = ttk.Combobox(card, textvariable=player_var, state="readonly", values=player_names, width=24)
            player_combo.grid(row=1, column=0, sticky="ew", padx=(0, 7), pady=(4, 0))
            date_entry = ttk.Entry(card, textvariable=date_var, width=13)
            date_entry.grid(row=1, column=1, sticky="ew", padx=7, pady=(4, 0))
            ttk.Entry(card, textvariable=video_var).grid(row=1, column=2, sticky="ew", padx=7, pady=(4, 0))
            ttk.Button(card, text="×", width=3, command=lambda i=index: self.remove_victor(i)).grid(row=1, column=3, padx=(5, 0), pady=(4, 0))

            def update_player(*_args: object, i=index, var=player_var) -> None:
                selected_name = var.get()
                player = next((p for p in self.players if f"{p.get('nickname', p.get('id'))}  ·  {p.get('id')}" == selected_name), None)
                if player and i < len(level["victors"]):
                    level["victors"][i]["playerId"] = player["id"]

            def update_value(key: str, var: tk.StringVar, i: int = index) -> None:
                if i < len(level["victors"]):
                    level["victors"][i][key] = var.get()

            player_var.trace_add("write", update_player)
            date_var.trace_add("write", lambda *_args, i=index, var=date_var: update_value("date", var, i))
            video_var.trace_add("write", lambda *_args, i=index, var=video_var: update_value("video", var, i))

    def add_victor(self) -> None:
        level = self.current_level()
        if not level:
            return
        if not self.players:
            if messagebox.askyesno("Нужен игрок", "Сначала добавьте игрока. Открыть карточку игрока?"):
                self.add_player_dialog()
            return
        level["victors"].append({"playerId": "", "percent": 100, "date": today(), "video": ""})
        self.render_editor()
        self.status.set("Добавлен победитель. Выберите игрока, дату и ссылку на его прохождение.")

    def remove_victor(self, index: int) -> None:
        level = self.current_level()
        if level and 0 <= index < len(level["victors"]):
            level["victors"].pop(index)
            self.render_victors()

    def add_player_dialog(self) -> None:
        dialog = tk.Toplevel(self.root)
        dialog.title("Добавить игрока")
        dialog.configure(bg=BG)
        dialog.transient(self.root)
        dialog.grab_set()
        dialog.geometry("430x390")
        frame = ttk.Frame(dialog, style="Panel.TFrame", padding=20)
        frame.pack(fill="both", expand=True, padx=14, pady=14)
        ttk.Label(frame, text="СПИСОК ИГРОКОВ", style="PanelEyebrow.TLabel").pack(anchor="w")
        ttk.Label(frame, text="Новый игрок", style="Section.TLabel").pack(anchor="w", pady=(4, 14))
        entries: dict[str, ttk.Entry] = {}
        for key, label, hint in (("nickname", "Никнейм", "Имя в Geometry Dash"), ("id", "ID игрока", "Например, zoink"), ("country", "Страна, ISO-2 (необязательно)", "например, US"), ("youtube", "YouTube игрока (необязательно)", "https://youtube.com/@...")):
            ttk.Label(frame, text=label, style="Muted.TLabel").pack(anchor="w", pady=(7, 4))
            entry = ttk.Entry(frame)
            entry.pack(fill="x")
            if key in ("country", "youtube"):
                ttk.Label(frame, text=hint, style="Muted.TLabel").pack(anchor="w", pady=(2, 0))
            entries[key] = entry

        def save_player() -> None:
            nickname = entries["nickname"].get().strip()
            player_id = entries["id"].get().strip() or slugify(nickname)
            if not nickname:
                messagebox.showerror("Не хватает данных", "Укажите никнейм.", parent=dialog)
                return
            if youtube_check := entries["youtube"].get().strip():
                if not valid_url(youtube_check):
                    messagebox.showerror("Некорректная ссылка", "Ссылка YouTube должна начинаться с http:// или https://.", parent=dialog)
                    return
            if any(player.get("id") == player_id for player in self.players):
                messagebox.showerror("ID уже занят", f"Игрок с ID {player_id} уже существует.", parent=dialog)
                return
            player = {"id": player_id, "nickname": nickname}
            country = entries["country"].get().strip().upper()
            youtube = entries["youtube"].get().strip()
            if country:
                player["country"] = country
            if youtube:
                player["youtube"] = youtube
            self.players.append(player)
            dialog.destroy()
            self.render_editor()
            self.status.set(f"Игрок {nickname} добавлен в локальные данные.")

        buttons = ttk.Frame(frame, style="Panel.TFrame")
        buttons.pack(fill="x", pady=(17, 0))
        ttk.Button(buttons, text="Отмена", command=dialog.destroy).pack(side="right", padx=(6, 0))
        ttk.Button(buttons, text="Добавить игрока", style="Primary.TButton", command=save_player).pack(side="right")

    def delete_level(self) -> None:
        level = self.current_level()
        if not level or not messagebox.askyesno("Удалить уровень", f"Удалить «{level.get('name', 'без названия')}» из данных? Позиции ниже сдвинутся на 1 вверх. Запись исчезнет после сохранения."):
            return
        removed = level.get("position")
        self.levels.pop(self.selected)
        if isinstance(removed, int):
            for item in self.levels:
                if isinstance(item.get("position"), int) and item["position"] > removed:
                    item["position"] -= 1
        self.selected = min(self.selected, len(self.levels) - 1)
        self.render_level_list()
        self.render_editor()
        self.status.set("Уровень удалён из редактора. Сохраните изменения локально.")

    def normalize_data(self) -> None:
        for level in self.levels:
            if "creators" not in level:
                old_creator = str(level.pop("creator", "")).strip()
                level["creators"] = [old_creator] if old_creator else []
            elif isinstance(level.get("creators"), str):
                level["creators"] = [name.strip() for name in level["creators"].split(",") if name.strip()]
            level["verifier"] = str(level.get("verifier", "")).strip()
            level.pop("difficulty", None)
            try:
                level["position"] = int(level["position"])
            except (KeyError, TypeError, ValueError):
                pass
            level["victors"] = level.get("victors") if isinstance(level.get("victors"), list) else []
            level["showcase"] = str(level.get("showcase", "")).strip()
            level["victors"] = [victor for victor in level["victors"] if isinstance(victor, dict)]
            for victor in level["victors"]:
                victor["percent"] = 100
                victor["date"] = str(victor.get("date", "")).strip()
                victor["video"] = str(victor.get("video", "")).strip()

    def validate_data(self) -> None:
        self.normalize_data()
        ids: set[str] = set()
        for player in self.players:
            player_id = str(player.get("id", "")).strip()
            if not player_id or not str(player.get("nickname", "")).strip():
                raise ValueError("У каждого игрока должны быть ID и никнейм.")
            if player_id in ids:
                raise ValueError(f"ID игрока {player_id} повторяется.")
            ids.add(player_id)
            youtube = str(player.get("youtube", "")).strip()
            if youtube and not valid_url(youtube):
                raise ValueError(f"Игрок {player_id}: ссылка YouTube должна начинаться с http:// или https://.")
        level_ids: set[str] = set()
        positions: set[int] = set()
        for level in self.levels:
            name = str(level.get("name", "")).strip()
            level_id = str(level.get("id", "")).strip()
            if not name or not level_id:
                raise ValueError("У каждого уровня должны быть название и ID.")
            if level_id in level_ids:
                raise ValueError(f"ID уровня {level_id} повторяется.")
            level_ids.add(level_id)
            position = level.get("position")
            if not isinstance(position, int) or position < 1:
                raise ValueError(f"{name}: позиция должна быть целым числом от 1.")
            if position in positions:
                raise ValueError(f"Позиция #{position} указана у нескольких уровней.")
            positions.add(position)
            for url in [level.get("showcase", ""), *(victor.get("video", "") for victor in level["victors"])]:
                if url and not valid_url(str(url).strip()):
                    raise ValueError(f"{name}: ссылки должны начинаться с http:// или https:// и не содержать пробелов.")
            winners: set[str] = set()
            for victor in level["victors"]:
                player_id = str(victor.get("playerId", "")).strip()
                if player_id not in ids:
                    raise ValueError(f"{name}: неизвестный игрок {player_id or '(без ID)'}. Добавьте игрока в список.")
                if player_id in winners:
                    raise ValueError(f"{name}: игрок {player_id} уже есть среди победителей.")
                winners.add(player_id)
                if not valid_date(victor["date"]):
                    raise ValueError(f"{name}, {player_id}: дата нужна в формате ГГГГ-ММ-ДД.")

    def save_local(self, quiet: bool = False) -> bool:
        self.commit_position()
        try:
            self.validate_data()
            atomic_write(LEVELS_PATH, self.levels)
            atomic_write(PLAYERS_PATH, {"players": self.players})
        except (ValueError, OSError) as error:
            if not quiet:
                messagebox.showerror("Не удалось сохранить", str(error), parent=self.root)
            self.status.set(f"Ошибка: {error}")
            return False
        self.render_level_list()
        if not quiet:
            self.status.set("JSON сохранён локально в data/levels.json и data/players.json.")
        return True

    def git(self, *args: str) -> str:
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
        try:
            result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240, env=env, creationflags=flags)
        except FileNotFoundError:
            raise RuntimeError("Git не найден. Установите Git for Windows и перезапустите редактор.") from None
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).strip() or "Ошибка Git.")
        return result.stdout.strip()

    def check_origin(self) -> None:
        remote = self.git("remote", "get-url", "origin").lower().removesuffix(".git").rstrip("/")
        if remote not in REPO_URLS:
            raise RuntimeError("origin не указывает на molkovis/gdfcdl; операция отменена.")

    def pull_remote(self) -> None:
        if not messagebox.askyesno(
            "Загрузить с GitHub",
            "Заменить данные в редакторе версией из main на GitHub?\n\n"
            "Несохранённые изменения и локальные data/levels.json и data/players.json будут заменены. "
            "Копия текущей версии сохранится в admin/backup.",
            parent=self.root,
        ):
            return
        self.pull_button.configure(state="disabled", text="Загрузка…")
        self.root.update_idletasks()
        note = ""
        try:
            self.check_origin()
            self.git("fetch", "origin", "main")
            new_levels = json.loads(self.git("show", "origin/main:data/levels.json"))
            new_players = json.loads(self.git("show", "origin/main:data/players.json"))
            if not isinstance(new_levels, list) or not (isinstance(new_players, list) or isinstance(new_players, dict) and isinstance(new_players.get("players"), list)):
                raise RuntimeError("Файлы на GitHub имеют неожиданную структуру; загрузка отменена.")
            new_players_list = new_players if isinstance(new_players, list) else new_players["players"]

            current = (json.dumps(self.levels, sort_keys=True), json.dumps(self.players, sort_keys=True))
            incoming = (json.dumps(new_levels, sort_keys=True), json.dumps(new_players_list, sort_keys=True))
            disk_same = False
            try:
                disk_same = (
                    json.dumps(json.loads(LEVELS_PATH.read_text(encoding="utf-8-sig")), sort_keys=True) == incoming[0]
                    and json.dumps(json.loads(PLAYERS_PATH.read_text(encoding="utf-8-sig")).get("players", []), sort_keys=True) == incoming[1]
                )
            except (OSError, ValueError, AttributeError):
                pass
            if current == incoming and disk_same:
                note = "Редактор уже совпадает с GitHub."
            else:
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                backup_dir = ROOT / "admin" / "backup" / stamp
                suffix = 1
                while backup_dir.exists():
                    suffix += 1
                    backup_dir = ROOT / "admin" / "backup" / f"{stamp}-{suffix}"
                stamp = backup_dir.name
                backup_dir.mkdir(parents=True)
                atomic_write(backup_dir / "levels.json", self.levels)
                atomic_write(backup_dir / "players.json", {"players": self.players})
                note = f"Данные загружены с GitHub. Копия прежней версии: admin/backup/{stamp}."

            # Подтягиваем локальный main, чтобы следующая отправка не упёрлась в «non-fast-forward».
            synced = False
            if self.git("branch", "--show-current") == "main":
                behind = int(self.git("rev-list", "--count", "HEAD..origin/main") or "0")
                ahead = int(self.git("rev-list", "--count", "origin/main..HEAD") or "0")
                if behind and ahead:
                    note += " Локальная ветка main расходится с GitHub — выполните git pull вручную."
                elif behind:
                    try:
                        self.git("checkout", "-q", "HEAD", "--", "data/levels.json", "data/players.json")
                        self.git("merge", "--ff-only", "origin/main")
                        synced = True
                    except RuntimeError as error:
                        note += f" Локальный git не обновлён ({str(error).splitlines()[0]})."
                else:
                    synced = False
            if not synced:
                atomic_write(LEVELS_PATH, new_levels)
                atomic_write(PLAYERS_PATH, {"players": new_players_list})
            keep = self.current_level().get("id") if self.current_level() else None
            self.load_data()
            if keep:
                index = next((i for i, item in enumerate(self.levels) if item.get("id") == keep), 0 if self.levels else -1)
                if index != self.selected:
                    self.selected = index
                    self.render_level_list()
                    self.render_editor()
        except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            self.status.set(f"Ошибка загрузки: {error}")
            messagebox.showerror("Не удалось загрузить", f"Данные в редакторе не изменены.\n\n{error}", parent=self.root)
        else:
            self.status.set(note)
        finally:
            self.pull_button.configure(state="normal", text="Загрузить с GitHub ↓")

    def publish(self) -> None:
        if not self.save_local(quiet=True):
            messagebox.showerror("Исправьте данные", self.status.get(), parent=self.root)
            return
        if not messagebox.askyesno("Отправить на GitHub", "Отправить data/levels.json и data/players.json в публичный molkovis/gdfcdl?\n\nПосле этого GitHub Pages обновит сайт.", parent=self.root):
            return
        self.publish_button.configure(state="disabled", text="Отправка…")
        self.root.update_idletasks()
        try:
            allowed_paths = {"data/levels.json", "data/players.json"}
            staged = self.git("diff", "--cached", "--name-only").splitlines()
            if set(staged) - allowed_paths:
                raise RuntimeError("Отправка остановлена: в Git уже подготовлены другие файлы. Закоммитьте их отдельно.")
            branch = self.git("branch", "--show-current")
            if branch != "main":
                raise RuntimeError(f"Для публикации нужна ветка main; сейчас выбрана {branch or '(нет ветки)' }.")
            remote = self.git("remote", "get-url", "origin").lower().removesuffix(".git").rstrip("/")
            if remote not in REPO_URLS:
                raise RuntimeError("origin не указывает на molkovis/gdfcdl; отправка отменена.")
            self.git("fetch", "origin", "main")
            if int(self.git("rev-list", "--count", "HEAD..origin/main") or "0"):
                raise RuntimeError("На GitHub есть более новая версия данных. Нажмите «Загрузить с GitHub», затем внесите правки и отправьте снова.")
            self.git("add", "--", "data/levels.json", "data/players.json")
            staged = self.git("diff", "--cached", "--name-only").splitlines()
            if set(staged) - allowed_paths:
                raise RuntimeError("В staged попали посторонние файлы; отправка отменена.")
            if staged:
                self.git("commit", "-m", "Update Demon List data")
            else:
                ahead = int(self.git("rev-list", "--count", "origin/main..HEAD") or "0")
                if not ahead:
                    self.status.set("Новых изменений в JSON нет.")
                    return
                pending_paths = set(self.git("diff", "--name-only", "origin/main...HEAD").splitlines())
                if not pending_paths or pending_paths - allowed_paths:
                    raise RuntimeError("В main есть неопубликованные изменения, кроме JSON данных. Отправьте их отдельно.")
            self.git("push", "origin", "main")
        except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
            self.status.set(f"Ошибка отправки: {error}")
            messagebox.showerror("Не удалось отправить", f"Данные сохранены локально, но push не прошёл.\n\n{error}", parent=self.root)
        else:
            self.status.set("Изменения отправлены. GitHub Actions скоро обновит сайт: " + SITE_URL)
            messagebox.showinfo("Отправлено", f"Данные загружены. Сайт обновится автоматически.\n\n{SITE_URL}", parent=self.root)
        finally:
            self.publish_button.configure(state="normal", text="Отправить на GitHub ↗")

    def open_json_editor(self) -> None:
        dialog = tk.Toplevel(self.root)
        dialog.title("Редактировать JSON")
        dialog.geometry("850x650")
        dialog.minsize(620, 440)
        dialog.configure(bg=BG)
        dialog.transient(self.root)
        dialog.grab_set()
        outer = ttk.Frame(dialog, style="Panel.TFrame", padding=14)
        outer.pack(fill="both", expand=True)
        bar = ttk.Frame(outer, style="Panel.TFrame")
        bar.pack(fill="x", pady=(0, 10))
        target = tk.StringVar(value="levels")
        ttk.Label(bar, text="ФАЙЛ", style="PanelEyebrow.TLabel").pack(side="left", padx=(0, 10))
        combo = ttk.Combobox(bar, textvariable=target, values=("levels", "players"), state="readonly", width=14)
        combo.pack(side="left")
        text = tk.Text(outer, wrap="none", undo=True, bg=ENTRY, fg=TEXT, insertbackground=TEXT, relief="flat", highlightthickness=1, highlightbackground=LINE, font=("Consolas", 10), padx=10, pady=10)
        ybar = ttk.Scrollbar(outer, orient="vertical", command=text.yview)
        xbar = ttk.Scrollbar(outer, orient="horizontal", command=text.xview)
        text.configure(yscrollcommand=ybar.set, xscrollcommand=xbar.set)
        text.pack(side="left", fill="both", expand=True)
        ybar.pack(side="right", fill="y")
        xbar.pack(side="bottom", fill="x")

        def show_json(*_args: object) -> None:
            value = self.levels if target.get() == "levels" else {"players": self.players}
            text.delete("1.0", "end")
            text.insert("1.0", json.dumps(value, ensure_ascii=False, indent=2))

        def apply_json() -> None:
            try:
                value = json.loads(text.get("1.0", "end-1c"))
                if target.get() == "levels":
                    if not isinstance(value, list):
                        raise ValueError("levels.json должен содержать массив уровней.")
                    self.levels = value
                    self.selected = min(self.selected, len(self.levels) - 1)
                else:
                    players = value if isinstance(value, list) else value.get("players")
                    if not isinstance(players, list):
                        raise ValueError("players.json должен содержать массив players.")
                    self.players = players
                self.render_level_list()
                self.render_editor()
                dialog.destroy()
                self.status.set("JSON применён в редакторе. Сохраните локально или отправьте на GitHub.")
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                messagebox.showerror("Некорректный JSON", str(error), parent=dialog)

        combo.bind("<<ComboboxSelected>>", show_json)
        show_json()
        buttons = ttk.Frame(outer, style="Panel.TFrame")
        buttons.pack(fill="x", pady=(10, 0))
        ttk.Button(buttons, text="Закрыть", command=dialog.destroy).pack(side="right", padx=(7, 0))
        ttk.Button(buttons, text="Применить JSON", style="Primary.TButton", command=apply_json).pack(side="right")

    def open_site(self) -> None:
        import webbrowser
        webbrowser.open(SITE_URL)


def main() -> None:
    root = tk.Tk()
    LevelEditor(root)
    root.mainloop()


if __name__ == "__main__":
    main()
