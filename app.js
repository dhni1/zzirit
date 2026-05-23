const COLORS = {
  ink: "#151617",
  paper: "#f8f3df",
  grid: "#d8ccb8",
  green: "#62b875",
  greenDark: "#377e49",
  mint: "#aee2b1",
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
  titleImage: document.querySelector(".title-image"),
  tabs: Array.from(document.querySelectorAll("[data-tab]")),
  panels: Array.from(document.querySelectorAll("[data-panel]")),
  graphs: {
    v0: document.querySelector("#graphV0"),
    rLeak: document.querySelector("#graphRLeak"),
    rBody: document.querySelector("#graphRBody"),
    rGround: document.querySelector("#graphRGround"),
  },
  simulation: {
    canvas: document.querySelector("#simulationCanvas"),
    riskBadge: document.querySelector("#simRiskBadge"),
    touchVoltage: document.querySelector("#simTouchVoltage"),
    bodyCurrent: document.querySelector("#simBodyCurrent"),
    groundCurrent: document.querySelector("#simGroundCurrent"),
    leakCurrent: document.querySelector("#simLeakCurrent"),
    bodyShare: document.querySelector("#simBodyShare"),
    voltageBar: document.querySelector("#simVoltageBar"),
    bodyBar: document.querySelector("#simBodyBar"),
    groundBar: document.querySelector("#simGroundBar"),
    leakBar: document.querySelector("#simLeakBar"),
    shareBar: document.querySelector("#simShareBar"),
  },
};

let activeTab = "graphs";
let simulationFrame = null;
let latestSnapshot = null;

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
  const groundCurrentA = vTouch / state.rGround;
  const leakCurrentA = (state.v0 - vTouch) / state.rLeak;
  const currentMa = currentA * 1000;
  const groundCurrentMa = groundCurrentA * 1000;
  const leakCurrentMa = leakCurrentA * 1000;
  const bodyShare = leakCurrentA > 0 ? (currentA / leakCurrentA) * 100 : 0;
  const groundShare = leakCurrentA > 0 ? (groundCurrentA / leakCurrentA) * 100 : 0;

  const baselineVTouch = state.v0 * (state.rBody / (state.rLeak + state.rBody));
  const baselineCurrentA = baselineVTouch / state.rBody;
  const reduction =
    baselineCurrentA > 0 ? ((baselineCurrentA - currentA) / baselineCurrentA) * 100 : 0;

  return {
    rEq,
    vTouch,
    currentA,
    groundCurrentA,
    leakCurrentA,
    currentMa,
    groundCurrentMa,
    leakCurrentMa,
    bodyShare: clamp(bodyShare, 0, 100),
    groundShare: clamp(groundShare, 0, 100),
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

function formatOhmAxis(value) {
  if (value >= 1_000_000) {
    return `${trimNumber(value / 1_000_000)}MΩ`;
  }
  if (value >= 1_000) {
    return `${trimNumber(value / 1_000)}kΩ`;
  }
  return `${trimNumber(value)}Ω`;
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function updateSimulationLabels(state, result) {
  const sim = elements.simulation;
  if (!sim.canvas) {
    return;
  }

  sim.touchVoltage.textContent = `${result.vTouch.toFixed(4)} V`;
  sim.bodyCurrent.textContent = formatCurrent(result.currentMa);
  sim.groundCurrent.textContent = formatCurrent(result.groundCurrentMa);
  sim.leakCurrent.textContent = formatCurrent(result.leakCurrentMa);
  sim.bodyShare.textContent = `${result.bodyShare.toFixed(1)}%`;
  sim.riskBadge.textContent = result.risk.label;
  sim.riskBadge.style.backgroundColor = result.risk.color;

  const voltagePercent = clamp((result.vTouch / Math.max(1, state.v0)) * 100, 0, 100);
  const bodyPercent = clamp((result.currentMa / 5) * 100, 0, 100);
  const groundPercent = clamp((result.groundCurrentMa / Math.max(0.001, result.leakCurrentMa)) * 100, 0, 100);
  const leakPercent = clamp((result.leakCurrentMa / 5) * 100, 0, 100);

  sim.voltageBar.style.width = `${voltagePercent}%`;
  sim.bodyBar.style.width = `${bodyPercent}%`;
  sim.groundBar.style.width = `${groundPercent}%`;
  sim.leakBar.style.width = `${leakPercent}%`;
  sim.shareBar.style.width = `${result.bodyShare}%`;
  sim.bodyBar.style.backgroundColor = result.risk.color;
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
      axisX: (value) => `${value.toFixed(0)}V`,
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
      axisX: formatOhmAxis,
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
      axisX: formatOhmAxis,
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
      axisX: formatOhmAxis,
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
  const pad = { left: 58, right: 58, top: 28, bottom: 48 };
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
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("Ibody(mA)", pad.left, 13);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(config.axisX(config.min), pad.left, pad.top + plotH + 14);
  ctx.textAlign = "right";
  ctx.fillText(config.axisX(config.max), pad.left + plotW, pad.top + plotH + 14);

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(config.xName, pad.left + plotW, 13);
}

function drawSimulation(state, result, time = 0) {
  const canvas = elements.simulation.canvas;
  if (!canvas || activeTab !== "simulation") {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const width = rect.width;
  const height = rect.height;
  const floorY = height - 62;
  const riskColor = result.risk.color;
  const bodyIntensity = clamp(result.currentMa / 5, 0, 1);
  const groundIntensity = clamp(result.groundShare / 100, 0, 1);
  const leakIntensity = clamp(result.leakCurrentMa / 5, 0, 1);

  ctx.clearRect(0, 0, width, height);
  drawSimulationBackground(ctx, width, height, floorY);

  const laptopW = clamp(width * 0.28, 126, 238);
  const laptopH = clamp(laptopW * 0.34, 46, 76);
  const laptop = {
    x: width * 0.36 - laptopW / 2,
    y: floorY - laptopH - clamp(height * 0.18, 58, 114),
    w: laptopW,
    h: laptopH,
  };
  const outlet = {
    x: clamp(width * 0.09, 18, 78),
    y: clamp(height * 0.3, 78, 164),
    w: 42,
    h: 58,
  };
  const adapter = {
    x: outlet.x + 58,
    y: outlet.y + 10,
    w: 58,
    h: 38,
  };
  const personX = clamp(width * 0.78, laptop.x + laptop.w + 68, width - 42);
  const personTop = floorY - clamp(height * 0.36, 122, 190);
  const groundX = clamp(width * 0.54, laptop.x + 48, width - 82);
  const hand = {
    x: laptop.x + laptop.w + 12,
    y: laptop.y - 12,
  };

  const leakPath = [
    { x: outlet.x + outlet.w, y: outlet.y + outlet.h / 2 },
    { x: adapter.x, y: adapter.y + adapter.h / 2 },
    { x: adapter.x + adapter.w, y: adapter.y + adapter.h / 2 },
    { x: laptop.x + 8, y: laptop.y - 6 },
  ];
  const bodyPath = [
    { x: laptop.x + laptop.w + 4, y: laptop.y - 10 },
    { x: hand.x, y: hand.y },
    { x: personX - 18, y: personTop + 60 },
    { x: personX - 6, y: floorY - 12 },
  ];
  const groundPath = [
    { x: laptop.x + laptop.w * 0.48, y: laptop.y + laptop.h + 8 },
    { x: groundX, y: floorY - 36 },
    { x: groundX, y: floorY - 6 },
  ];

  drawSimulationPath(ctx, leakPath, COLORS.lavender, 5, 0.65);
  drawSimulationPath(ctx, bodyPath, riskColor, 7, 0.48 + bodyIntensity * 0.42);
  drawSimulationPath(ctx, groundPath, COLORS.green, 6, 0.3 + groundIntensity * 0.6);

  drawOutlet(ctx, outlet);
  drawAdapter(ctx, adapter);
  drawLaptop(ctx, laptop, riskColor);
  drawPerson(ctx, personX, personTop, floorY, hand, riskColor);
  drawGround(ctx, groundX, floorY);

  drawParticles(ctx, leakPath, COLORS.lavender, 5 + Math.round(leakIntensity * 8), time, 0.00018, 7);
  drawParticles(ctx, bodyPath, riskColor, 3 + Math.round(bodyIntensity * 10), time, 0.00015 + bodyIntensity * 0.00012, 8);
  if (groundIntensity > 0.015) {
    drawParticles(ctx, groundPath, COLORS.green, 2 + Math.round(groundIntensity * 10), time, 0.00012 + groundIntensity * 0.0001, 7);
  }

  drawCanvasTag(ctx, `V0 ${state.v0.toFixed(0)}V`, outlet.x + 22, outlet.y - 18, COLORS.lavender);
  drawCanvasTag(ctx, `외함 ${result.vTouch.toFixed(3)}V`, laptop.x + laptop.w / 2, laptop.y - 52, riskColor);
  drawCanvasTag(ctx, `Ibody ${formatCurrent(result.currentMa)}`, personX - 4, personTop - 20, riskColor);
  drawCanvasTag(ctx, `접지 ${result.groundShare.toFixed(1)}%`, groundX, floorY - 78, COLORS.green);
}

function drawSimulationBackground(ctx, width, height, floorY) {
  ctx.fillStyle = "#101414";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#2a3033";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#293034";
  ctx.fillRect(0, floorY, width, height - floorY);
  ctx.strokeStyle = COLORS.mint || "#aee2b1";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(width, floorY);
  ctx.stroke();
}

function drawSimulationPath(ctx, points, color, width, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width + 6;
  ctx.strokeStyle = COLORS.ink;
  drawPolyline(ctx, points);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  drawPolyline(ctx, points);
  ctx.restore();
}

function drawPolyline(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
}

function drawOutlet(ctx, box) {
  drawPixelRect(ctx, box.x, box.y, box.w, box.h, "#fffdf1");
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(box.x + 13, box.y + 16, 5, 16);
  ctx.fillRect(box.x + 25, box.y + 16, 5, 16);
  ctx.fillRect(box.x + 17, box.y + 42, 10, 4);
}

function drawAdapter(ctx, box) {
  drawPixelRect(ctx, box.x, box.y, box.w, box.h, COLORS.lavender);
  ctx.fillStyle = COLORS.ink;
  ctx.font = "13px Courier New, Apple SD Gothic Neo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AC", box.x + box.w / 2, box.y + box.h / 2);
}

function drawLaptop(ctx, laptop, accent) {
  const screen = {
    x: laptop.x + laptop.w * 0.15,
    y: laptop.y - laptop.h * 1.45,
    w: laptop.w * 0.7,
    h: laptop.h * 1.35,
  };

  drawPixelRect(ctx, screen.x, screen.y, screen.w, screen.h, "#d6e8ea");
  ctx.fillStyle = "#121616";
  ctx.fillRect(screen.x + 9, screen.y + 9, screen.w - 18, screen.h - 18);
  ctx.fillStyle = accent;
  ctx.fillRect(screen.x + 18, screen.y + 18, screen.w - 36, 9);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(screen.x + 18, screen.y + 34, screen.w * 0.38, 8);

  drawPixelRect(ctx, laptop.x, laptop.y, laptop.w, laptop.h, "#cfd4d0");
  ctx.fillStyle = "#889094";
  ctx.fillRect(laptop.x + laptop.w * 0.16, laptop.y + 12, laptop.w * 0.68, 8);
  ctx.fillStyle = accent;
  ctx.fillRect(laptop.x + laptop.w - 24, laptop.y + 10, 12, 12);
}

function drawPerson(ctx, x, top, floorY, hand, accent) {
  drawPixelRect(ctx, x - 14, top, 28, 28, "#f1d0b7");
  drawPixelRect(ctx, x - 17, top + 34, 34, 64, "#dce7f3");

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x - 16, top + 50);
  ctx.lineTo(hand.x, hand.y);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 16, top + 50);
  ctx.lineTo(hand.x, hand.y);
  ctx.stroke();

  drawPixelRect(ctx, hand.x - 8, hand.y - 8, 16, 16, "#f1d0b7");
  drawPixelRect(ctx, x - 17, floorY - 48, 14, 48, "#3f5260");
  drawPixelRect(ctx, x + 3, floorY - 48, 14, 48, "#3f5260");
  drawPixelRect(ctx, x - 22, floorY - 8, 24, 8, "#fffdf1");
  drawPixelRect(ctx, x + 0, floorY - 8, 24, 8, "#fffdf1");
}

function drawGround(ctx, x, floorY) {
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, floorY - 34);
  ctx.lineTo(x, floorY + 28);
  ctx.stroke();

  ctx.fillStyle = COLORS.green;
  ctx.fillRect(x - 20, floorY + 4, 40, 6);
  ctx.fillRect(x - 14, floorY + 16, 28, 6);
  ctx.fillRect(x - 8, floorY + 28, 16, 6);
}

function drawPixelRect(ctx, x, y, width, height, fill) {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x - 3, y - 3, width + 6, height + 6);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
}

function drawCanvasTag(ctx, text, x, y, fill) {
  ctx.font = "12px Courier New, Apple SD Gothic Neo, monospace";
  const paddingX = 7;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = 24;
  const left = clamp(x - width / 2, 8, ctx.canvas.width / (window.devicePixelRatio || 1) - width - 8);

  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(left - 3, y - 3, width + 6, height + 6);
  ctx.fillStyle = fill;
  ctx.fillRect(left, y, width, height);
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + width / 2, y + height / 2);
}

function drawParticles(ctx, points, color, count, time, speed, size) {
  for (let index = 0; index < count; index += 1) {
    const progress = (time * speed + index / count) % 1;
    const point = pointOnPath(points, progress);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(point.x - size / 2 - 2, point.y - size / 2 - 2, size + 4, size + 4);
    ctx.fillStyle = color;
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
}

function pointOnPath(points, progress) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.hypot(current.x - previous.x, current.y - previous.y);
    lengths.push(length);
    total += length;
  }

  let target = total * progress;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1];
    if (target <= length) {
      const previous = points[index - 1];
      const current = points[index];
      const local = length === 0 ? 0 : target / length;
      return {
        x: previous.x + (current.x - previous.x) * local,
        y: previous.y + (current.y - previous.y) * local,
      };
    }
    target -= length;
  }

  return points[points.length - 1];
}

function update() {
  const state = readState();
  const result = calculate(state);
  latestSnapshot = { state, result };
  updateLabels(state, result);
  updateSimulationLabels(state, result);

  if (activeTab === "graphs") {
    for (const config of graphConfigs(state)) {
      drawGraph(config, state);
    }
  } else {
    drawSimulation(state, result, performance.now());
  }
}

function preferPngTitleImage() {
  const pngSrc = elements.titleImage?.dataset.pngSrc;
  if (!pngSrc) {
    return;
  }

  const probe = new Image();
  probe.onload = () => {
    elements.titleImage.src = pngSrc;
  };
  probe.src = pngSrc;
}

function setLogSlider(slider, value) {
  slider.value = Math.log10(value).toString();
  update();
}

function setActiveTab(tabName) {
  activeTab = tabName;

  elements.tabs.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive.toString());
  });

  elements.panels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  update();

  if (tabName === "simulation") {
    startSimulationLoop();
  } else {
    stopSimulationLoop();
  }
}

function startSimulationLoop() {
  if (simulationFrame) {
    return;
  }

  const tick = (time) => {
    if (activeTab !== "simulation") {
      simulationFrame = null;
      return;
    }

    if (latestSnapshot) {
      drawSimulation(latestSnapshot.state, latestSnapshot.result, time);
    }
    simulationFrame = window.requestAnimationFrame(tick);
  };

  simulationFrame = window.requestAnimationFrame(tick);
}

function stopSimulationLoop() {
  if (!simulationFrame) {
    return;
  }

  window.cancelAnimationFrame(simulationFrame);
  simulationFrame = null;
}

for (const input of [elements.v0, elements.rLeak, elements.rBody, elements.rGround]) {
  input.addEventListener("input", update);
}

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll("[data-body]").forEach((button) => {
  button.addEventListener("click", () => setLogSlider(elements.rBody, Number(button.dataset.body)));
});

document.querySelectorAll("[data-ground]").forEach((button) => {
  button.addEventListener("click", () => setLogSlider(elements.rGround, Number(button.dataset.ground)));
});

window.addEventListener("resize", update);

preferPngTitleImage();
update();
