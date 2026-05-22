const COLORS = {
  ink: "#151617",
  paper: "#f8f3df",
  grid: "#d8ccb8",
  green: "#62b875",
  greenDark: "#377e49",
  yellow: "#e1bc45",
  orange: "#d56b31",
  red: "#c74438",
  blue: "#4d7ea8",
  lavender: "#c8c8f0",
  shadow: "#2f3337",
};

const RISK_BANDS = [
  { min: 0, max: 0.5, label: "거의 느끼기 어려움", color: COLORS.green },
  { min: 0.5, max: 2, label: "약한 감각 가능", color: COLORS.yellow },
  { min: 2, max: 5, label: "찌릿함 가능", color: COLORS.orange },
  { min: 5, max: Infinity, label: "위험 가능성 증가", color: COLORS.red },
];

const elements = {
  v0: document.querySelector("#v0"),
  rLeak: document.querySelector("#rLeak"),
  rBody: document.querySelector("#rBody"),
  rGround: document.querySelector("#rGround"),
  v0Value: document.querySelector("#v0Value"),
  rLeakValue: document.querySelector("#rLeakValue"),
  rBodyValue: document.querySelector("#rBodyValue"),
  rGroundValue: document.querySelector("#rGroundValue"),
  mainCurrent: document.querySelector("#mainCurrent"),
  riskBadge: document.querySelector("#riskBadge"),
  touchVoltage: document.querySelector("#touchVoltage"),
  reduction: document.querySelector("#reduction"),
  equivalentResistance: document.querySelector("#equivalentResistance"),
  riskText: document.querySelector("#riskText"),
  graphLabels: {
    v0: document.querySelector("#v0GraphValue"),
    rLeak: document.querySelector("#rLeakGraphValue"),
    rBody: document.querySelector("#rBodyGraphValue"),
    rGround: document.querySelector("#rGroundGraphValue"),
  },
  graphs: {
    v0: document.querySelector("#graphV0"),
    rLeak: document.querySelector("#graphRLeak"),
    rBody: document.querySelector("#graphRBody"),
    rGround: document.querySelector("#graphRGround"),
  },
  pixelBattery: document.querySelector("#pixelBattery"),
};

function logValue(slider) {
  return 10 ** Number(slider.value);
}

function readState() {
  return {
    v0: Number(elements.v0.value),
    rLeak: logValue(elements.rLeak),
    rBody: logValue(elements.rBody),
    rGround: logValue(elements.rGround),
  };
}

function parallelResistance(rBody, rGround) {
  if (rBody <= 0 || rGround <= 0) {
    return 0;
  }
  return 1 / (1 / rBody + 1 / rGround);
}

function calculate(state) {
  const rEq = parallelResistance(state.rBody, state.rGround);
  const vTouch = state.v0 * (rEq / (state.rLeak + rEq));
  const currentA = vTouch / state.rBody;
  const currentMa = currentA * 1000;

  const baselineVTouch = state.v0 * (state.rBody / (state.rLeak + state.rBody));
  const baselineCurrentA = baselineVTouch / state.rBody;
  const reduction =
    baselineCurrentA > 0 ? ((baselineCurrentA - currentA) / baselineCurrentA) * 100 : 0;

  return {
    rEq,
    vTouch,
    currentA,
    currentMa,
    reduction: Math.max(0, reduction),
    risk: classifyRisk(currentMa),
  };
}

function classifyRisk(currentMa) {
  return (
    RISK_BANDS.find((band) => currentMa >= band.min && currentMa < band.max) ||
    RISK_BANDS[RISK_BANDS.length - 1]
  );
}

function formatOhm(value) {
  if (value >= 1_000_000) {
    return `${trimNumber(value / 1_000_000)} MΩ`;
  }
  if (value >= 1_000) {
    return `${trimNumber(value / 1_000)} kΩ`;
  }
  return `${trimNumber(value)} Ω`;
}

function formatCurrent(value) {
  if (value < 0.001) {
    return `${(value * 1000).toFixed(2)} µA`;
  }
  if (value < 10) {
    return `${value.toFixed(3)} mA`;
  }
  return `${value.toFixed(2)} mA`;
}

function trimNumber(value) {
  if (value >= 100) {
    return value.toFixed(0);
  }
  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function updateLabels(state, result) {
  elements.v0Value.textContent = `${state.v0.toFixed(0)} V`;
  elements.rLeakValue.textContent = formatOhm(state.rLeak);
  elements.rBodyValue.textContent = formatOhm(state.rBody);
  elements.rGroundValue.textContent = state.rGround >= 9_000_000 ? "10 MΩ" : formatOhm(state.rGround);

  elements.mainCurrent.textContent = formatCurrent(result.currentMa);
  elements.touchVoltage.textContent = `${result.vTouch.toFixed(4)} V`;
  elements.reduction.textContent = `${result.reduction.toFixed(1)}%`;
  elements.equivalentResistance.textContent = formatOhm(result.rEq);
  elements.riskText.textContent = result.risk.label;
  elements.riskBadge.textContent = result.risk.label;
  elements.riskBadge.style.backgroundColor = result.risk.color;
}

function makeSamples(config, state) {
  const samples = [];
  const count = 96;
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const x = config.log
      ? 10 ** (Math.log10(config.min) + t * (Math.log10(config.max) - Math.log10(config.min)))
      : config.min + t * (config.max - config.min);
    const nextState = { ...state, [config.key]: x };
    samples.push({ x, y: calculate(nextState).currentMa });
  }
  return samples;
}

function graphConfigs(state) {
  return [
    {
      key: "v0",
      canvas: elements.graphs.v0,
      label: elements.graphLabels.v0,
      min: 89,
      max: 151,
      log: false,
      xName: "V0",
      unit: "V",
      currentX: state.v0,
      formatX: (value) => `${value.toFixed(0)} V`,
    },
    {
      key: "rLeak",
      canvas: elements.graphs.rLeak,
      label: elements.graphLabels.rLeak,
      min: 10_000,
      max: 5_000_000,
      log: true,
      xName: "Rleak",
      unit: "Ω",
      currentX: state.rLeak,
      formatX: formatOhm,
    },
    {
      key: "rBody",
      canvas: elements.graphs.rBody,
      label: elements.graphLabels.rBody,
      min: 1_000,
      max: 200_000,
      log: true,
      xName: "Rbody",
      unit: "Ω",
      currentX: state.rBody,
      formatX: formatOhm,
    },
    {
      key: "rGround",
      canvas: elements.graphs.rGround,
      label: elements.graphLabels.rGround,
      min: 0.1,
      max: 10_000_000,
      log: true,
      xName: "Rg",
      unit: "Ω",
      currentX: state.rGround,
      formatX: formatOhm,
    },
  ];
}

function drawGraph(config, state) {
  const canvas = config.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const width = rect.width;
  const height = rect.height;
  const pad = { left: 48, right: 16, top: 16, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const samples = makeSamples(config, state);
  const currentResult = calculate(state);
  config.label.textContent = `${config.formatX(config.currentX)} · ${formatCurrent(currentResult.currentMa)}`;

  const yMax = chooseYMax(Math.max(...samples.map((point) => point.y), currentResult.currentMa));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, width, height);
  drawRiskBands(ctx, pad, plotW, plotH, yMax);
  drawGrid(ctx, pad, plotW, plotH, yMax);

  const xToPx = (value) => {
    if (config.log) {
      return pad.left + ((Math.log10(value) - Math.log10(config.min)) / (Math.log10(config.max) - Math.log10(config.min))) * plotW;
    }
    return pad.left + ((value - config.min) / (config.max - config.min)) * plotW;
  };
  const yToPx = (value) => pad.top + plotH - (value / yMax) * plotH;

  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.lineWidth = 5;
  ctx.strokeStyle = COLORS.ink;
  ctx.beginPath();
  samples.forEach((point, index) => {
    const x = xToPx(point.x);
    const y = yToPx(point.y);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.green;
  ctx.beginPath();
  samples.forEach((point, index) => {
    const x = xToPx(point.x);
    const y = yToPx(point.y);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  const markerX = xToPx(config.currentX);
  const markerY = yToPx(currentResult.currentMa);
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(markerX - 6, markerY - 6, 12, 12);
  ctx.fillStyle = currentResult.risk.color;
  ctx.fillRect(markerX - 3, markerY - 3, 6, 6);

  drawAxisLabels(ctx, config, pad, plotW, plotH, yMax);
}

function chooseYMax(maxValue) {
  if (maxValue < 0.45) return 0.6;
  if (maxValue < 1.8) return 2.2;
  if (maxValue < 4.6) return 5.5;
  return Math.ceil(maxValue * 1.25 * 10) / 10;
}

function drawRiskBands(ctx, pad, plotW, plotH, yMax) {
  for (const band of RISK_BANDS) {
    if (band.min >= yMax) continue;
    const upper = Math.min(band.max, yMax);
    const y1 = pad.top + plotH - (upper / yMax) * plotH;
    const y2 = pad.top + plotH - (band.min / yMax) * plotH;
    ctx.fillStyle = `${band.color}28`;
    ctx.fillRect(pad.left, y1, plotW, y2 - y1);
  }
}

function drawGrid(ctx, pad, plotW, plotH, yMax) {
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);

  ctx.font = "12px Courier New, monospace";
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const value = (yMax / 4) * i;
    const y = pad.top + plotH - (value / yMax) * plotH;
    ctx.strokeStyle = i === 0 ? COLORS.ink : COLORS.grid;
    ctx.lineWidth = i === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(1), pad.left - 8, y);
  }
}

function drawAxisLabels(ctx, config, pad, plotW, plotH, yMax) {
  ctx.font = "12px Courier New, monospace";
  ctx.fillStyle = COLORS.ink;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("mA", 8, 8);

  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText(config.formatX(config.min), pad.left, pad.top + plotH + 12);
  ctx.fillText(config.formatX(config.max), pad.left + plotW, pad.top + plotH + 12);

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(config.xName, pad.left + plotW, 8);
}

function drawPixelBattery() {
  const canvas = elements.pixelBattery;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const p = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  p(28, 0, 88, 8, COLORS.ink);
  p(20, 8, 104, 8, COLORS.ink);
  p(12, 16, 120, 8, COLORS.ink);
  p(4, 32, 136, 56, COLORS.ink);
  p(12, 24, 120, 64, COLORS.lavender);
  p(20, 16, 104, 8, "#b5e2b7");
  p(20, 24, 104, 48, COLORS.green);
  p(20, 72, 104, 8, COLORS.greenDark);
  p(20, 80, 104, 8, "#dfe0ff");
  p(28, 88, 88, 8, COLORS.lavender);
  p(36, 96, 72, 8, COLORS.ink);
  p(12, 80, 8, 8, COLORS.ink);
  p(124, 80, 8, 8, COLORS.ink);
  p(20, 88, 8, 8, COLORS.ink);
  p(116, 88, 8, 8, COLORS.ink);
  p(20, 16, 104, 4, "#a6dca8");
  p(20, 68, 104, 4, "#97d99c");
  p(12, 40, 8, 40, "#e8e7ff");
  p(124, 40, 8, 40, "#e8e7ff");
  p(12, 80, 8, 8, "#9297c1");
  p(124, 80, 8, 8, "#9297c1");

  p(64, 28, 8, 32, "#ffffff");
  p(72, 36, 8, 24, "#ffffff");
  p(80, 44, 8, 16, "#ffffff");
  p(88, 52, 8, 8, "#ffffff");
  p(56, 36, 8, 32, "#ffffff");
  p(64, 68, 8, 8, "#4e9257");
  p(72, 60, 8, 8, "#4e9257");
  p(80, 52, 8, 8, "#4e9257");
}

function update() {
  const state = readState();
  const result = calculate(state);
  updateLabels(state, result);
  for (const config of graphConfigs(state)) {
    drawGraph(config, state);
  }
}

function setLogSlider(slider, value) {
  slider.value = Math.log10(value).toString();
  update();
}

for (const input of [elements.v0, elements.rLeak, elements.rBody, elements.rGround]) {
  input.addEventListener("input", update);
}

document.querySelectorAll("[data-body]").forEach((button) => {
  button.addEventListener("click", () => setLogSlider(elements.rBody, Number(button.dataset.body)));
});

document.querySelectorAll("[data-ground]").forEach((button) => {
  button.addEventListener("click", () => setLogSlider(elements.rGround, Number(button.dataset.ground)));
});

window.addEventListener("resize", update);

drawPixelBattery();
update();
