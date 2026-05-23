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
  ctx.imageSmoothingEnabled = true;

  const width = rect.width;
  const height = rect.height;
  const riskColor = result.risk.color;
  const bodyIntensity = clamp(result.currentMa / 5, 0, 1);
  const groundIntensity = clamp(result.groundShare / 100, 0, 1);
  const leakIntensity = clamp(result.leakCurrentMa / 5, 0, 1);

  ctx.clearRect(0, 0, width, height);
  drawSimulationBackground(ctx, width, height);

  const topY = clamp(height * 0.23, 78, 128);
  const junctionY = clamp(height * 0.46, 185, 250);
  const groundY = height - clamp(height * 0.16, 72, 98);
  const sourceX = clamp(width * 0.08, 34, 76);
  const leakStartX = sourceX + clamp(width * 0.13, 46, 106);
  const leakEndX = Math.max(leakStartX + 40, width * 0.39);
  const caseX = Math.min(width - 92, Math.max(leakEndX + 82, width * 0.58));
  const groundBranchX = Math.max(58, Math.min(caseX - 70, width * 0.35));
  const bodyX = Math.min(width - 44, Math.max(caseX + 82, width * 0.78));
  const busLeft = Math.min(groundBranchX, bodyX) - 58;
  const busRight = Math.max(groundBranchX, bodyX) + 58;

  const source = { x: sourceX, y: topY };
  const leakEntry = { x: leakStartX, y: topY };
  const leakExit = { x: leakEndX, y: topY };
  const caseLeft = { x: caseX - 70, y: topY };
  const caseBottom = { x: caseX, y: topY + 38 };
  const junction = { x: caseX, y: junctionY };
  const groundTop = { x: groundBranchX, y: junctionY };
  const bodyTop = { x: bodyX, y: junctionY };
  const groundBottom = { x: groundBranchX, y: groundY - 38 };
  const bodyBottom = { x: bodyX, y: groundY - 38 };

  const leakPath = [source, leakEntry, leakExit, caseLeft, { x: caseX, y: topY }, caseBottom, junction];
  const groundPath = [junction, groundTop, groundBottom, { x: groundBranchX, y: groundY }];
  const bodyPath = [junction, bodyTop, bodyBottom, { x: bodyX, y: groundY }];

  drawCircuitWire(ctx, [{ x: sourceX - 18, y: topY }, source], "#26323a", 3);
  drawCircuitWire(ctx, [source, leakEntry], "#26323a", 3);
  drawCircuitWire(ctx, [leakExit, caseLeft], "#26323a", 3);
  drawCircuitWire(ctx, [caseBottom, junction], "#26323a", 3);
  drawCircuitWire(ctx, [junction, groundTop], "#26323a", 3);
  drawCircuitWire(ctx, [junction, bodyTop], "#26323a", 3);
  drawCircuitWire(ctx, [groundBottom, { x: groundBranchX, y: groundY }, { x: busLeft, y: groundY }], "#26323a", 3);
  drawCircuitWire(ctx, [bodyBottom, { x: bodyX, y: groundY }, { x: busRight, y: groundY }], "#26323a", 3);
  drawCircuitWire(ctx, [{ x: busLeft, y: groundY }, { x: busRight, y: groundY }], "#26323a", 3);

  drawCircuitWire(ctx, leakPath, COLORS.lavender, 6 + leakIntensity * 4, 0.56);
  drawCircuitWire(ctx, bodyPath, riskColor, 6 + bodyIntensity * 7, 0.62);
  drawCircuitWire(ctx, groundPath, COLORS.green, 5 + groundIntensity * 6, 0.54);

  drawVoltageSource(ctx, sourceX - 18, topY, state.v0);
  drawResistorHorizontal(ctx, leakEntry.x, topY, leakExit.x - leakEntry.x, COLORS.blue);
  drawCaseNode(ctx, caseX, topY, result.vTouch, riskColor);
  drawResistorVertical(ctx, groundBranchX, junctionY + 16, groundY - junctionY - 70, COLORS.green);
  drawResistorVertical(ctx, bodyX, junctionY + 16, groundY - junctionY - 70, riskColor);
  drawGroundSymbol(ctx, groundBranchX, groundY + 8, COLORS.green);
  drawGroundSymbol(ctx, bodyX, groundY + 8, "#6b7780");
  drawCircuitNode(ctx, junction.x, junction.y);
  drawCircuitNode(ctx, groundBranchX, groundY);
  drawCircuitNode(ctx, bodyX, groundY);

  drawFlowDots(ctx, leakPath, COLORS.lavender, 4 + Math.round(leakIntensity * 5), time, 0.00013, 5);
  drawFlowDots(ctx, bodyPath, riskColor, 3 + Math.round(bodyIntensity * 8), time, 0.00014 + bodyIntensity * 0.0001, 6);
  if (groundIntensity > 0.01) {
    drawFlowDots(ctx, groundPath, COLORS.green, 2 + Math.round(groundIntensity * 7), time, 0.00011 + groundIntensity * 0.00008, 5);
  }

  drawCircuitLabel(ctx, "누설 경로 Rleak", (leakEntry.x + leakExit.x) / 2, topY - 46, {
    align: "center",
    color: COLORS.blue,
    value: formatOhm(state.rLeak),
  });
  drawCircuitLabel(ctx, "접지 저항 Rg", groundBranchX, junctionY + 18, {
    align: "center",
    color: COLORS.green,
    value: formatOhm(state.rGround),
  });
  drawCircuitLabel(ctx, "인체 저항 Rbody", bodyX, junctionY + 18, {
    align: "center",
    color: riskColor,
    value: formatOhm(state.rBody),
  });
  drawCurrentBadge(ctx, `Ibody ${formatCurrent(result.currentMa)}`, bodyX, groundY - 124, riskColor);
  drawCurrentBadge(ctx, `Ig ${formatCurrent(result.groundCurrentMa)}`, groundBranchX, groundY - 124, COLORS.green);
  drawCircuitLegend(ctx, width, height, riskColor);
}

function drawSimulationBackground(ctx, width, height) {
  ctx.fillStyle = "#f7fbfc";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e5eef2";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawCircuitWire(ctx, points, color, width, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawPolyline(ctx, points);
  ctx.restore();
}

function drawVoltageSource(ctx, x, y, voltage) {
  ctx.save();
  ctx.strokeStyle = "#26323a";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#26323a";
  ctx.font = "700 16px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("V0", x, y - 3);
  ctx.font = "700 12px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(`${voltage.toFixed(0)} V`, x, y + 17);
  ctx.restore();
}

function drawResistorHorizontal(ctx, x, y, width, color) {
  const segment = width / 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let index = 1; index <= 7; index += 1) {
    const nextX = x + segment * index;
    const nextY = index % 2 ? y - 16 : y + 16;
    ctx.lineTo(nextX, nextY);
  }
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.restore();
}

function drawResistorVertical(ctx, x, y, height, color) {
  const segment = height / 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let index = 1; index <= 7; index += 1) {
    const nextX = index % 2 ? x - 16 : x + 16;
    const nextY = y + segment * index;
    ctx.lineTo(nextX, nextY);
  }
  ctx.lineTo(x, y + height);
  ctx.stroke();
  ctx.restore();
}

function drawCaseNode(ctx, x, y, touchVoltage, accent) {
  const box = { x: x - 74, y: y - 36, w: 148, h: 72 };
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#26323a";
  ctx.lineWidth = 2;
  drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#edf3f6";
  drawRoundRect(ctx, box.x + 16, box.y + 12, box.w - 32, 28, 5);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(box.x + 25, box.y + 52);
  ctx.lineTo(box.x + box.w - 25, box.y + 52);
  ctx.stroke();

  ctx.fillStyle = "#26323a";
  ctx.font = "800 15px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("노트북 외함", x, y - 8);
  ctx.font = "800 13px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(`${touchVoltage.toFixed(3)} V`, x, y + 14);
  ctx.restore();
}

function drawCircuitNode(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = "#26323a";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGroundSymbol(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x + 24, y);
  ctx.moveTo(x - 16, y + 11);
  ctx.lineTo(x + 16, y + 11);
  ctx.moveTo(x - 8, y + 22);
  ctx.lineTo(x + 8, y + 22);
  ctx.stroke();
  ctx.restore();
}

function drawCircuitLabel(ctx, label, x, y, options = {}) {
  const align = options.align || "left";
  const value = options.value || "";
  const color = options.color || "#26323a";
  ctx.save();
  ctx.font = "800 13px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  const labelWidth = ctx.measureText(label).width;
  ctx.font = "700 12px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  const valueWidth = value ? ctx.measureText(value).width : 0;
  const boxWidth = Math.max(labelWidth, valueWidth) + 18;
  const boxHeight = value ? 42 : 26;
  let boxX = x;
  if (align === "center") {
    boxX = x - boxWidth / 2;
  } else if (align === "right") {
    boxX = x - boxWidth;
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.strokeStyle = "rgba(38, 50, 58, 0.12)";
  ctx.lineWidth = 1;
  drawRoundRect(ctx, boxX, y - 14, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = "800 13px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.fillStyle = "#26323a";
  ctx.fillText(label, x, y);
  if (value) {
    ctx.font = "700 12px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y + 18);
  }
  ctx.restore();
}

function drawCurrentBadge(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "800 13px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + 24;
  const left = x - width / 2;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  drawRoundRect(ctx, left, y, width, 30, 15);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 15);
  ctx.restore();
}

function drawCircuitLegend(ctx, width, height, bodyColor) {
  const x = 18;
  const y = height - 42;
  const items = [
    { color: COLORS.lavender, text: "누설 경로" },
    { color: bodyColor, text: "인체 경로" },
    { color: COLORS.green, text: "접지 경로" },
  ];

  ctx.save();
  ctx.font = "700 12px Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  let cursor = x;
  items.forEach((item) => {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(cursor + 6, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#52646b";
    ctx.textAlign = "left";
    ctx.fillText(item.text, cursor + 18, y);
    cursor += ctx.measureText(item.text).width + 54;
  });
  ctx.restore();
}

function drawFlowDots(ctx, points, color, count, time, speed, radius) {
  for (let index = 0; index < count; index += 1) {
    const progress = (time * speed + index / count) % 1;
    const point = pointOnPath(points, progress);
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
