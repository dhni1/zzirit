# -*- coding: utf-8 -*-
"""Laptop touch current simulator.

Run:
    python3 laptop_touch_current_simulator.py

For a console-only sample:
    python3 laptop_touch_current_simulator.py --sample
"""

from __future__ import annotations

import argparse
import csv
import math
import os

os.environ.setdefault("TK_SILENCE_DEPRECATION", "1")

import tkinter as tk
from dataclasses import dataclass
from tkinter import filedialog, messagebox, ttk


HAND_PROFILES = {
    "젖은 손 (1 kΩ)": 1_000.0,
    "보통 손 (10 kΩ)": 10_000.0,
    "건조한 손 (100 kΩ)": 100_000.0,
    "사용자 입력": None,
}

GROUND_PROFILES = {
    "접지 없음": None,
    "접지 나쁨 (100 Ω)": 100.0,
    "접지 보통 (10 Ω)": 10.0,
    "접지 좋음 (1 Ω)": 1.0,
    "사용자 입력": "custom",
}

RISK_BANDS = [
    (0.0, 0.5, "거의 느끼기 어려움", "#2f8f5b"),
    (0.5, 2.0, "약한 감각 가능", "#b88900"),
    (2.0, 5.0, "찌릿함 가능", "#d86622"),
    (5.0, float("inf"), "위험 가능성 증가", "#c83e36"),
]


@dataclass(frozen=True)
class SimulationResult:
    v_touch: float
    body_current_a: float
    body_current_ma: float
    r_eq: float
    reduction_percent: float
    risk_label: str
    risk_color: str


def parallel_resistance(r_body: float, r_ground: float | None) -> float:
    if r_ground is None or math.isinf(r_ground):
        return r_body
    if r_body <= 0 or r_ground <= 0:
        return 0.0
    return 1.0 / ((1.0 / r_body) + (1.0 / r_ground))


def classify_risk(current_ma: float) -> tuple[str, str]:
    for low, high, label, color in RISK_BANDS:
        if low <= current_ma < high:
            return label, color
    return RISK_BANDS[-1][2], RISK_BANDS[-1][3]


def calculate_touch_current(
    v0: float,
    r_leak: float,
    r_body: float,
    r_ground: float | None,
) -> tuple[float, float, float]:
    r_eq = parallel_resistance(r_body, r_ground)
    if r_leak <= 0 or r_body <= 0:
        return 0.0, 0.0, r_eq
    v_touch = v0 * (r_eq / (r_leak + r_eq))
    body_current_a = v_touch / r_body
    return v_touch, body_current_a, r_eq


def simulate(
    v0: float,
    r_leak: float,
    r_body: float,
    r_ground: float | None,
) -> SimulationResult:
    v_touch, body_current_a, r_eq = calculate_touch_current(
        v0=v0,
        r_leak=r_leak,
        r_body=r_body,
        r_ground=r_ground,
    )
    _, baseline_current_a, _ = calculate_touch_current(
        v0=v0,
        r_leak=r_leak,
        r_body=r_body,
        r_ground=None,
    )

    if baseline_current_a <= 0:
        reduction = 0.0
    else:
        reduction = (baseline_current_a - body_current_a) / baseline_current_a * 100.0

    current_ma = body_current_a * 1000.0
    label, color = classify_risk(current_ma)
    return SimulationResult(
        v_touch=v_touch,
        body_current_a=body_current_a,
        body_current_ma=current_ma,
        r_eq=r_eq,
        reduction_percent=max(0.0, reduction),
        risk_label=label,
        risk_color=color,
    )


def capacitive_reactance(freq_hz: float, capacitance_nf: float) -> float:
    capacitance_f = capacitance_nf * 1e-9
    if freq_hz <= 0 or capacitance_f <= 0:
        return float("inf")
    return 1.0 / (2.0 * math.pi * freq_hz * capacitance_f)


class TouchCurrentApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("노트북 접촉 전류 및 찌릿함 위험도 계산기")
        self.root.geometry("1120x720")
        self.root.minsize(980, 640)
        self.root.configure(bg="#f4f1ea")

        self.v0_var = tk.DoubleVar(value=120.0)
        self.r_leak_kohm_var = tk.DoubleVar(value=500.0)
        self.hand_var = tk.StringVar(value="보통 손 (10 kΩ)")
        self.custom_body_kohm_var = tk.StringVar(value="10")
        self.ground_var = tk.StringVar(value="접지 없음")
        self.custom_ground_ohm_var = tk.StringVar(value="10")
        self.freq_var = tk.DoubleVar(value=60.0)
        self.cap_nf_var = tk.DoubleVar(value=1.0)
        self.graph_mode_var = tk.StringVar(value="접지 저항 변화")

        self.result_labels: dict[str, ttk.Label] = {}
        self.risk_canvas: tk.Canvas | None = None
        self.graph_canvas: tk.Canvas | None = None
        self.is_ready = False

        self._configure_style()
        self._build_layout()
        self._bind_updates()
        self.is_ready = True
        self.update_results()

    def _configure_style(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("Root.TFrame", background="#f4f1ea")
        style.configure("Panel.TFrame", background="#fffdf8", relief="flat")
        style.configure("Title.TLabel", background="#f4f1ea", foreground="#1f2a2e", font=("Apple SD Gothic Neo", 22, "bold"))
        style.configure("Subtitle.TLabel", background="#f4f1ea", foreground="#667078", font=("Apple SD Gothic Neo", 11))
        style.configure("Section.TLabel", background="#fffdf8", foreground="#1f2a2e", font=("Apple SD Gothic Neo", 13, "bold"))
        style.configure("Body.TLabel", background="#fffdf8", foreground="#2b3438", font=("Apple SD Gothic Neo", 11))
        style.configure("Muted.TLabel", background="#fffdf8", foreground="#6a747b", font=("Apple SD Gothic Neo", 10))
        style.configure("ResultTitle.TLabel", background="#fffdf8", foreground="#68737a", font=("Apple SD Gothic Neo", 10))
        style.configure("ResultValue.TLabel", background="#fffdf8", foreground="#1f2a2e", font=("Apple SD Gothic Neo", 15, "bold"))
        style.configure("Accent.TButton", font=("Apple SD Gothic Neo", 11, "bold"))

    def _build_layout(self) -> None:
        root_frame = ttk.Frame(self.root, style="Root.TFrame", padding=18)
        root_frame.pack(fill="both", expand=True)

        header = ttk.Frame(root_frame, style="Root.TFrame")
        header.pack(fill="x", pady=(0, 14))
        ttk.Label(header, text="충전 중 금속 노트북 접촉 전류 시뮬레이터", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            header,
            text="실제 전기기기 접촉 실험 없이, 등가 회로 모델로 접촉 전압과 인체 통과 전류를 계산합니다.",
            style="Subtitle.TLabel",
        ).pack(anchor="w", pady=(3, 0))

        content = ttk.Frame(root_frame, style="Root.TFrame")
        content.pack(fill="both", expand=True)
        content.columnconfigure(0, weight=0, minsize=330)
        content.columnconfigure(1, weight=1)
        content.rowconfigure(0, weight=1)

        controls = ttk.Frame(content, style="Panel.TFrame", padding=16)
        controls.grid(row=0, column=0, sticky="nsew", padx=(0, 14))

        output = ttk.Frame(content, style="Panel.TFrame", padding=16)
        output.grid(row=0, column=1, sticky="nsew")
        output.rowconfigure(2, weight=1)
        output.columnconfigure(0, weight=1)

        self._build_controls(controls)
        self._build_output(output)

    def _build_controls(self, parent: ttk.Frame) -> None:
        ttk.Label(parent, text="입력 조건", style="Section.TLabel").pack(anchor="w", pady=(0, 12))

        self._add_scale(
            parent,
            label="유도전압 V0",
            variable=self.v0_var,
            from_=89.0,
            to=151.0,
            unit="V",
            resolution=1.0,
        )
        self._add_scale(
            parent,
            label="내부 누설 경로 저항 Rleak",
            variable=self.r_leak_kohm_var,
            from_=50.0,
            to=5000.0,
            unit="kΩ",
            resolution=10.0,
        )

        ttk.Label(parent, text="손 상태 / 인체 저항", style="Body.TLabel").pack(anchor="w", pady=(12, 4))
        hand_combo = ttk.Combobox(parent, textvariable=self.hand_var, values=list(HAND_PROFILES), state="readonly")
        hand_combo.pack(fill="x")
        ttk.Label(parent, text="사용자 입력 Rbody (kΩ)", style="Muted.TLabel").pack(anchor="w", pady=(8, 2))
        ttk.Entry(parent, textvariable=self.custom_body_kohm_var).pack(fill="x")

        ttk.Label(parent, text="접지 조건", style="Body.TLabel").pack(anchor="w", pady=(12, 4))
        ground_combo = ttk.Combobox(parent, textvariable=self.ground_var, values=list(GROUND_PROFILES), state="readonly")
        ground_combo.pack(fill="x")
        ttk.Label(parent, text="사용자 입력 Rg (Ω)", style="Muted.TLabel").pack(anchor="w", pady=(8, 2))
        ttk.Entry(parent, textvariable=self.custom_ground_ohm_var).pack(fill="x")

        ttk.Separator(parent).pack(fill="x", pady=16)
        ttk.Label(parent, text="정전용량 리액턴스 참고값", style="Section.TLabel").pack(anchor="w", pady=(0, 8))
        self._add_scale(parent, "주파수 f", self.freq_var, 50.0, 60.0, "Hz", 1.0)
        self._add_scale(parent, "등가 정전용량 C", self.cap_nf_var, 0.1, 5.0, "nF", 0.1)

        ttk.Separator(parent).pack(fill="x", pady=16)
        ttk.Label(parent, text="그래프", style="Section.TLabel").pack(anchor="w", pady=(0, 8))
        graph_combo = ttk.Combobox(
            parent,
            textvariable=self.graph_mode_var,
            values=["접지 저항 변화", "손 상태 비교", "유도전압 변화"],
            state="readonly",
        )
        graph_combo.pack(fill="x")

        button_row = ttk.Frame(parent, style="Panel.TFrame")
        button_row.pack(fill="x", pady=(14, 0))
        ttk.Button(button_row, text="기준값 적용", command=self.apply_default_values).pack(side="left", fill="x", expand=True)
        ttk.Button(button_row, text="CSV 저장", command=self.export_csv).pack(side="left", fill="x", expand=True, padx=(8, 0))

        warning = (
            "주의: 이 프로그램은 교육용 시뮬레이션입니다.\n"
            "충전기, 콘센트, 노트북 외함을 직접 분해하거나\n"
            "접촉 전류를 측정하는 실험은 하지 않습니다."
        )
        ttk.Label(parent, text=warning, style="Muted.TLabel", justify="left").pack(anchor="w", pady=(18, 0))

    def _build_output(self, parent: ttk.Frame) -> None:
        ttk.Label(parent, text="계산 결과", style="Section.TLabel").grid(row=0, column=0, sticky="w")

        result_grid = ttk.Frame(parent, style="Panel.TFrame")
        result_grid.grid(row=1, column=0, sticky="ew", pady=(12, 12))
        for col in range(4):
            result_grid.columnconfigure(col, weight=1)

        self._add_result_box(result_grid, 0, "접촉 전압", "v_touch")
        self._add_result_box(result_grid, 1, "인체 통과 전류", "current")
        self._add_result_box(result_grid, 2, "감소율", "reduction")
        self._add_result_box(result_grid, 3, "등가 저항", "r_eq")

        graph_frame = ttk.Frame(parent, style="Panel.TFrame")
        graph_frame.grid(row=2, column=0, sticky="nsew")
        graph_frame.rowconfigure(1, weight=1)
        graph_frame.columnconfigure(0, weight=1)

        risk_row = ttk.Frame(graph_frame, style="Panel.TFrame")
        risk_row.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        risk_row.columnconfigure(1, weight=1)

        self.risk_canvas = tk.Canvas(risk_row, width=24, height=24, highlightthickness=0, bg="#fffdf8")
        self.risk_canvas.grid(row=0, column=0, sticky="w")
        self.result_labels["risk"] = ttk.Label(risk_row, text="", style="ResultValue.TLabel")
        self.result_labels["risk"].grid(row=0, column=1, sticky="w", padx=(8, 0))
        self.result_labels["xc"] = ttk.Label(risk_row, text="", style="Muted.TLabel")
        self.result_labels["xc"].grid(row=0, column=2, sticky="e")

        self.graph_canvas = tk.Canvas(graph_frame, bg="#fffdf8", highlightthickness=1, highlightbackground="#d9d2c7")
        self.graph_canvas.grid(row=1, column=0, sticky="nsew")
        self.graph_canvas.bind("<Configure>", lambda _event: self.draw_graph())

    def _add_scale(
        self,
        parent: ttk.Frame,
        label: str,
        variable: tk.DoubleVar,
        from_: float,
        to: float,
        unit: str,
        resolution: float,
    ) -> None:
        row = ttk.Frame(parent, style="Panel.TFrame")
        row.pack(fill="x", pady=(0, 10))
        text = ttk.Label(row, text=f"{label}: {variable.get():g} {unit}", style="Body.TLabel")
        text.pack(anchor="w")

        def update_label(*_args: object) -> None:
            text.configure(text=f"{label}: {variable.get():g} {unit}")
            if self.is_ready:
                self.update_results()

        variable.trace_add("write", update_label)
        ttk.Scale(row, variable=variable, from_=from_, to=to, command=lambda _value: None).pack(fill="x", pady=(4, 0))

        if resolution >= 1:
            variable.set(round(variable.get() / resolution) * resolution)

    def _add_result_box(self, parent: ttk.Frame, col: int, title: str, key: str) -> None:
        box = ttk.Frame(parent, style="Panel.TFrame", padding=(0, 0, 12, 0))
        box.grid(row=0, column=col, sticky="ew")
        ttk.Label(box, text=title, style="ResultTitle.TLabel").pack(anchor="w")
        label = ttk.Label(box, text="-", style="ResultValue.TLabel")
        label.pack(anchor="w", pady=(3, 0))
        self.result_labels[key] = label

    def _bind_updates(self) -> None:
        for var in (
            self.hand_var,
            self.custom_body_kohm_var,
            self.ground_var,
            self.custom_ground_ohm_var,
            self.graph_mode_var,
        ):
            var.trace_add("write", lambda *_args: self.update_results())

    def _float_from_string(self, value: str, fallback: float) -> float:
        try:
            parsed = float(value)
        except ValueError:
            return fallback
        if parsed <= 0:
            return fallback
        return parsed

    def get_body_resistance(self) -> float:
        selected = self.hand_var.get()
        profile_value = HAND_PROFILES.get(selected)
        if profile_value is not None:
            return profile_value
        return self._float_from_string(self.custom_body_kohm_var.get(), 10.0) * 1000.0

    def get_ground_resistance(self) -> float | None:
        selected = self.ground_var.get()
        profile_value = GROUND_PROFILES.get(selected)
        if profile_value == "custom":
            return self._float_from_string(self.custom_ground_ohm_var.get(), 10.0)
        return profile_value

    def current_result(self) -> SimulationResult:
        return simulate(
            v0=self.v0_var.get(),
            r_leak=self.r_leak_kohm_var.get() * 1000.0,
            r_body=self.get_body_resistance(),
            r_ground=self.get_ground_resistance(),
        )

    def update_results(self) -> None:
        if not self.is_ready:
            return

        result = self.current_result()
        self.result_labels["v_touch"].configure(text=f"{result.v_touch:.3f} V")
        self.result_labels["current"].configure(text=f"{result.body_current_ma:.3f} mA")
        self.result_labels["reduction"].configure(text=f"{result.reduction_percent:.1f}%")
        self.result_labels["r_eq"].configure(text=self.format_resistance(result.r_eq))
        self.result_labels["risk"].configure(text=result.risk_label)

        xc = capacitive_reactance(self.freq_var.get(), self.cap_nf_var.get())
        self.result_labels["xc"].configure(text=f"참고 Xc = {self.format_resistance(xc)}")

        if self.risk_canvas is not None:
            self.risk_canvas.delete("all")
            self.risk_canvas.create_oval(3, 3, 21, 21, fill=result.risk_color, outline="")

        self.draw_graph()

    def draw_graph(self) -> None:
        if self.graph_canvas is None:
            return

        canvas = self.graph_canvas
        canvas.delete("all")
        width = max(canvas.winfo_width(), 640)
        height = max(canvas.winfo_height(), 360)
        pad_left = 62
        pad_right = 24
        pad_top = 30
        pad_bottom = 56
        plot_w = width - pad_left - pad_right
        plot_h = height - pad_top - pad_bottom

        if plot_w <= 20 or plot_h <= 20:
            return

        mode = self.graph_mode_var.get()
        if mode == "손 상태 비교":
            title, x_label, points, is_bar = self.hand_points()
        elif mode == "유도전압 변화":
            title, x_label, points, is_bar = self.voltage_points()
        else:
            title, x_label, points, is_bar = self.ground_points()

        values = [point[1] for point in points]
        y_max = self.choose_y_max(max(values) if values else 1.0)

        self.draw_risk_bands(canvas, pad_left, pad_top, plot_w, plot_h, y_max)
        self.draw_axes(canvas, pad_left, pad_top, plot_w, plot_h, y_max, title, x_label)

        if is_bar:
            self.draw_bar_graph(canvas, points, pad_left, pad_top, plot_w, plot_h, y_max)
        else:
            self.draw_line_graph(canvas, points, pad_left, pad_top, plot_w, plot_h, y_max, mode)

    def ground_points(self) -> tuple[str, str, list[tuple[float, float]], bool]:
        r_values = [10 ** (-1 + i * (5 / 80)) for i in range(81)]
        points = []
        for r_ground in r_values:
            result = simulate(self.v0_var.get(), self.r_leak_kohm_var.get() * 1000.0, self.get_body_resistance(), r_ground)
            points.append((r_ground, result.body_current_ma))
        return "접지 저항이 낮아질수록 인체 전류가 감소", "", points, False

    def hand_points(self) -> tuple[str, str, list[tuple[str, float]], bool]:
        points = []
        for label, resistance in list(HAND_PROFILES.items())[:3]:
            result = simulate(
                self.v0_var.get(),
                self.r_leak_kohm_var.get() * 1000.0,
                resistance if resistance is not None else self.get_body_resistance(),
                self.get_ground_resistance(),
            )
            points.append((label.split(" ")[0], result.body_current_ma))
        return "손 상태에 따른 인체 통과 전류", "", points, True

    def voltage_points(self) -> tuple[str, str, list[tuple[float, float]], bool]:
        points = []
        for v0 in range(89, 152):
            result = simulate(v0, self.r_leak_kohm_var.get() * 1000.0, self.get_body_resistance(), self.get_ground_resistance())
            points.append((float(v0), result.body_current_ma))
        return "유도전압 변화에 따른 위험도", "", points, False

    def choose_y_max(self, max_value: float) -> float:
        if max_value < 0.45:
            return 0.6
        if max_value < 1.8:
            return 2.2
        if max_value < 4.6:
            return 5.5
        return max_value * 1.25

    def draw_risk_bands(
        self,
        canvas: tk.Canvas,
        x: int,
        y: int,
        width: int,
        height: int,
        y_max: float,
    ) -> None:
        for low, high, _label, color in RISK_BANDS:
            if low >= y_max:
                continue
            band_top_value = min(high, y_max)
            y1 = y + height - (band_top_value / y_max) * height
            y2 = y + height - (low / y_max) * height
            canvas.create_rectangle(x, y1, x + width, y2, fill=color, stipple="gray75", outline="")

    def draw_axes(
        self,
        canvas: tk.Canvas,
        x: int,
        y: int,
        width: int,
        height: int,
        y_max: float,
        title: str,
        x_label: str,
    ) -> None:
        axis_color = "#243033"
        canvas.create_text(x, 14, text=title, anchor="w", fill=axis_color, font=("Apple SD Gothic Neo", 13, "bold"))
        canvas.create_line(x, y + height, x + width, y + height, fill=axis_color, width=2)
        canvas.create_line(x, y, x, y + height, fill=axis_color, width=2)
        canvas.create_text(x + width / 2, y + height + 38, text=x_label, fill="#4c565b", font=("Apple SD Gothic Neo", 10))
        canvas.create_text(x, y - 12, text="인체 전류 (mA)", anchor="w", fill="#4c565b", font=("Apple SD Gothic Neo", 10))

        tick_count = 5
        for i in range(tick_count + 1):
            value = y_max * i / tick_count
            ty = y + height - (value / y_max) * height
            canvas.create_line(x - 5, ty, x, ty, fill=axis_color)
            canvas.create_text(x - 9, ty, text=f"{value:.1f}", anchor="e", fill="#4c565b", font=("Apple SD Gothic Neo", 9))
            if i > 0:
                canvas.create_line(x, ty, x + width, ty, fill="#d9d2c7")

    def draw_line_graph(
        self,
        canvas: tk.Canvas,
        points: list[tuple[float, float]],
        x: int,
        y: int,
        width: int,
        height: int,
        y_max: float,
        mode: str,
    ) -> None:
        if not points:
            return
        xs = [point[0] for point in points]
        x_min = min(xs)
        x_max = max(xs)

        def map_x(value: float) -> float:
            if mode == "접지 저항 변화":
                lx_min = math.log10(x_min)
                lx_max = math.log10(x_max)
                return x + (math.log10(value) - lx_min) / (lx_max - lx_min) * width
            return x + (value - x_min) / (x_max - x_min) * width

        def map_y(value: float) -> float:
            return y + height - (value / y_max) * height

        mapped = [(map_x(px), map_y(py), py) for px, py in points]
        for i in range(1, len(mapped)):
            x1, y1, current = mapped[i - 1]
            x2, y2, _ = mapped[i]
            _label, color = classify_risk(current)
            canvas.create_line(x1, y1, x2, y2, fill=color, width=3)

        for index in [0, len(points) // 2, len(points) - 1]:
            px, py = points[index]
            mx, my, _ = mapped[index]
            canvas.create_oval(mx - 3, my - 3, mx + 3, my + 3, fill="#1f2a2e", outline="")
            tick_text = f"{px:.1f}" if mode == "접지 저항 변화" else f"{px:.0f}"
            canvas.create_text(mx, y + height + 16, text=tick_text, fill="#4c565b", font=("Apple SD Gothic Neo", 9))

    def draw_bar_graph(
        self,
        canvas: tk.Canvas,
        points: list[tuple[str, float]],
        x: int,
        y: int,
        width: int,
        height: int,
        y_max: float,
    ) -> None:
        if not points:
            return
        gap = 28
        bar_w = (width - gap * (len(points) + 1)) / len(points)
        for index, (label, value) in enumerate(points):
            bar_x1 = x + gap + index * (bar_w + gap)
            bar_x2 = bar_x1 + bar_w
            bar_y = y + height - (value / y_max) * height
            _risk, color = classify_risk(value)
            canvas.create_rectangle(bar_x1, bar_y, bar_x2, y + height, fill=color, outline="")
            canvas.create_text((bar_x1 + bar_x2) / 2, bar_y - 12, text=f"{value:.3f} mA", fill="#1f2a2e", font=("Apple SD Gothic Neo", 9, "bold"))
            canvas.create_text((bar_x1 + bar_x2) / 2, y + height + 16, text=label, fill="#4c565b", font=("Apple SD Gothic Neo", 10))

    def apply_default_values(self) -> None:
        self.v0_var.set(120.0)
        self.r_leak_kohm_var.set(500.0)
        self.hand_var.set("보통 손 (10 kΩ)")
        self.custom_body_kohm_var.set("10")
        self.ground_var.set("접지 없음")
        self.custom_ground_ohm_var.set("10")
        self.freq_var.set(60.0)
        self.cap_nf_var.set(1.0)
        self.graph_mode_var.set("접지 저항 변화")
        self.update_results()

    def export_csv(self) -> None:
        path = filedialog.asksaveasfilename(
            title="시뮬레이션 결과 CSV 저장",
            defaultextension=".csv",
            filetypes=[("CSV 파일", "*.csv"), ("모든 파일", "*.*")],
        )
        if not path:
            return

        rows = []
        for ground_label, r_ground in GROUND_PROFILES.items():
            if r_ground == "custom":
                continue
            for hand_label, r_body in list(HAND_PROFILES.items())[:3]:
                result = simulate(
                    self.v0_var.get(),
                    self.r_leak_kohm_var.get() * 1000.0,
                    r_body if r_body is not None else self.get_body_resistance(),
                    r_ground,
                )
                rows.append(
                    {
                        "유도전압_V": self.v0_var.get(),
                        "누설저항_ohm": self.r_leak_kohm_var.get() * 1000.0,
                        "손상태": hand_label,
                        "접지조건": ground_label,
                        "접촉전압_V": f"{result.v_touch:.6f}",
                        "인체전류_mA": f"{result.body_current_ma:.6f}",
                        "감소율_percent": f"{result.reduction_percent:.3f}",
                        "위험도": result.risk_label,
                    }
                )

        try:
            with open(path, "w", newline="", encoding="utf-8-sig") as csv_file:
                writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
        except OSError as exc:
            messagebox.showerror("저장 실패", f"CSV 파일을 저장하지 못했습니다.\n{exc}")
            return
        messagebox.showinfo("저장 완료", "조건별 시뮬레이션 결과를 CSV로 저장했습니다.")

    def format_resistance(self, ohm: float) -> str:
        if math.isinf(ohm):
            return "무한대"
        if ohm >= 1_000_000:
            return f"{ohm / 1_000_000:.2f} MΩ"
        if ohm >= 1_000:
            return f"{ohm / 1_000:.2f} kΩ"
        return f"{ohm:.2f} Ω"


def print_sample_table() -> None:
    v0 = 120.0
    r_leak = 500_000.0
    print("샘플 조건: V0=120 V, Rleak=500 kΩ")
    print("손 상태, 접지 조건, 접촉전압(V), 인체전류(mA), 감소율(%), 위험도")
    for hand_label, r_body in list(HAND_PROFILES.items())[:3]:
        for ground_label, r_ground in list(GROUND_PROFILES.items())[:4]:
            result = simulate(v0, r_leak, r_body if r_body is not None else 10_000.0, r_ground)
            print(
                f"{hand_label}, {ground_label}, "
                f"{result.v_touch:.6f}, {result.body_current_ma:.6f}, "
                f"{result.reduction_percent:.3f}, {result.risk_label}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Laptop touch current simulator")
    parser.add_argument("--sample", action="store_true", help="print sample calculations without launching the GUI")
    args = parser.parse_args()

    if args.sample:
        print_sample_table()
        return

    root = tk.Tk()
    TouchCurrentApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
