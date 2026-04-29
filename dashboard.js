const SVG_NS = "http://www.w3.org/2000/svg";

let DATA = null;

const state = {
  screen: "screen1",
  variable: null,
  year: null,
  screen1Categories: new Set(),
  screen2Category: "paris_aligned",
  screen2Variables: new Set(),
  screen3Categories: new Set(),
  barMode: "model_family",
};

function $(selector) {
  return document.querySelector(selector);
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function node(tag, attrs = {}, text = null) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "className") element.setAttribute("class", value);
    else if (value !== null && value !== undefined) element.setAttribute(key, value);
  }
  if (text !== null) element.textContent = text;
  return element;
}

function svgNode(tag, attrs = {}, text = null) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) element.setAttribute(key, value);
  }
  if (text !== null) element.textContent = text;
  return element;
}

function setViewBox(svg, width, height) {
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("height", height);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function compactNumber(value) {
  if (!finite(value)) return "n/a";
  const number = Number(value);
  const abs = Math.abs(number);
  if (abs >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(number / 1e3).toFixed(1)}k`;
  if (abs >= 100) return number.toFixed(0);
  if (abs >= 10) return number.toFixed(1);
  if (abs >= 1) return number.toFixed(2);
  return number.toPrecision(2);
}

function weightNumber(value) {
  if (!finite(value)) return "n/a";
  return Number(value).toFixed(6);
}

function shortText(text, max = 34) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function scaleLinear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (!finite(d0) || !finite(d1) || d0 === d1) {
    const middle = (r0 + r1) / 2;
    return () => middle;
  }
  return (value) => r0 + ((Number(value) - d0) / (d1 - d0)) * (r1 - r0);
}

function paddedDomain(values, padFraction = 0.08) {
  const clean = values.filter(finite).map(Number);
  if (!clean.length) return [0, 1];
  let min = Math.min(...clean);
  let max = Math.max(...clean);
  if (min === max) {
    const delta = Math.abs(min) * 0.1 || 1;
    min -= delta;
    max += delta;
  }
  const pad = (max - min) * padFraction;
  return [min - pad, max + pad];
}

function ticks(domain, count = 5) {
  const [min, max] = domain;
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function polylinePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ");
}

function curvePath(x0, y0, x1, y1) {
  const dx = x1 - x0;
  return `M${x0},${y0} C${x0 + dx * 0.38},${y0} ${x1 - dx * 0.38},${y1} ${x1},${y1}`;
}

function hashIndex(value, modulo) {
  let hash = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return modulo ? hash % modulo : hash;
}

function colorFor(mode, value) {
  const label = String(value || "Unknown");
  const meta = DATA.metadata;
  if (mode === "model_family") return meta.model_family_colors[label] || meta.model_family_colors.Other || "#909090";
  if (mode === "model_type") return meta.model_type_colors[label] || meta.model_type_colors.Unknown || "#909090";
  if (mode === "project") return meta.project_colors[label] || ["#648FFF", "#DC267F", "#FE6100", "#009E73"][hashIndex(label, 4)];
  return "#909090";
}

function activeRows() {
  return DATA.screen3.rows.filter((row) => state.screen3Categories.has(row.category));
}

function categoryScenarioCount(category) {
  if (!category) return 0;
  const members = category.members || [category.id];
  return DATA.screen3.rows.filter((row) => members.includes(row.category)).length;
}

function isCategoryDisabled(category) {
  return category.id.startsWith("GW") && categoryScenarioCount(category) === 0;
}

function enabledGwCategoryIds() {
  return DATA.metadata.categories
    .filter((category) => category.id.startsWith("GW") && !isCategoryDisabled(category))
    .map((category) => category.id);
}

function timeseriesWeightColor(categoryId) {
  if (categoryId === "GW1") return "#74b66d";
  if (categoryId === "GW2") return "#238b45";
  return DATA.metadata.category_colors[categoryId] || "#117733";
}

function isDefaultTimeseriesVariable(variable) {
  return (
    !variable.id.includes("Climate Assessment|Harmonized|") &&
    !variable.id.includes("Climate Assessment|Infilled|") &&
    variable.id !== "Price|Carbon"
  );
}

function selectedScreen1Categories() {
  return DATA.metadata.screen1_categories.filter((category) => state.screen1Categories.has(category.id));
}

function selectedScreen2Variables() {
  return DATA.variables.filter((variable) => state.screen2Variables.has(variable.id));
}

function selectionLabel(items, selectedSet, singular, plural) {
  const selected = items.filter((item) => selectedSet.has(item.id));
  if (!selected.length) return `No ${plural}`;
  if (selected.length <= 2) return selected.map((item) => item.label).join(", ");
  return `${selected.length} ${plural}`;
}

function buildCheckedDropdown({ container, items, selectedSet, singular, plural, onChange }) {
  clear(container);
  container.addEventListener("click", (event) => event.stopPropagation());
  const button = node("button", { type: "button", className: "check-button", "aria-expanded": "false" });
  const menu = node("div", { className: "check-menu" });

  items.forEach((item) => {
    if (item.disabled) selectedSet.delete(item.id);
  });

  function updateButtonLabel() {
    button.textContent = selectionLabel(items, selectedSet, singular, plural);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = container.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });

  items.forEach((item) => {
    const checkbox = node("input", { type: "checkbox", value: item.id, disabled: item.disabled ? "disabled" : null });
    checkbox.checked = selectedSet.has(item.id);
    checkbox.addEventListener("change", () => {
      if (item.disabled) return;
      if (checkbox.checked) selectedSet.add(item.id);
      else selectedSet.delete(item.id);
      updateButtonLabel();
      onChange();
    });

    const label = node("label", { title: item.title || item.label, className: item.disabled ? "is-disabled" : null });
    label.appendChild(checkbox);
    label.appendChild(node("span", {}, item.label));
    menu.appendChild(label);
  });

  updateButtonLabel();
  container.appendChild(button);
  container.appendChild(menu);
}

document.addEventListener("click", () => {
  document.querySelectorAll(".check-dropdown.is-open").forEach((dropdown) => {
    dropdown.classList.remove("is-open");
    const button = dropdown.querySelector(".check-button");
    if (button) button.setAttribute("aria-expanded", "false");
  });
});

function init() {
  const defaultVariable =
    DATA.variables.find((variable) => variable.id.includes("Harmonized|Emissions|Kyoto Gases")) ||
    DATA.variables.find((variable) => variable.id.includes("Kyoto Gases")) ||
    DATA.variables[0];

  state.variable = defaultVariable.id;
  state.year = DATA.metadata.screen1_years.includes("2050") ? "2050" : DATA.metadata.screen1_years[0];
  state.screen1Categories = new Set(DATA.metadata.screen1_default_categories || ["GW2", "GW3", "GW4", "paris_aligned"]);
  state.screen2Variables = new Set(DATA.variables.filter(isDefaultTimeseriesVariable).map((variable) => variable.id));
  state.screen1Categories.delete("GW0");
  state.screen3Categories = new Set(enabledGwCategoryIds());
  const requestedScreen = new URLSearchParams(window.location.search).get("screen");
  if (["screen1", "screen2", "screen3", "about"].includes(requestedScreen)) state.screen = requestedScreen;

  $("#dataStamp").textContent = "343 scenarios reweighted for diversity";

  initNavigation();
  initScreen1Controls();
  initScreen2Controls();
  initScreen3Controls();
  setActiveScreen(state.screen);
  renderCurrentScreen();
}

function initNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveScreen(button.dataset.screen);
      renderCurrentScreen();
    });
  });
}

function setActiveScreen(screenId) {
  state.screen = screenId;
  document.querySelectorAll("[data-screen]").forEach((item) => item.classList.toggle("is-active", item.dataset.screen === state.screen));
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("is-active", screen.id === state.screen));
}

function initScreen1Controls() {
  const variableSelect = $("#screen1Variable");
  const groups = ["Emissions", "Energy", "Economy", "Mitigation", "Other"];
  groups.forEach((group) => {
    const variables = DATA.variables.filter((variable) => variable.group === group);
    if (!variables.length) return;
    const optgroup = node("optgroup", { label: group });
    variables.forEach((variable) => {
      const option = node("option", { value: variable.id, title: variable.id }, variable.label);
      if (variable.id === state.variable) option.selected = true;
      optgroup.appendChild(option);
    });
    variableSelect.appendChild(optgroup);
  });
  variableSelect.addEventListener("change", () => {
    state.variable = variableSelect.value;
    renderScreen1();
  });

  const yearSelect = $("#screen1Year");
  DATA.metadata.screen1_years.forEach((year) => {
    const option = node("option", { value: year }, year);
    if (year === state.year) option.selected = true;
    yearSelect.appendChild(option);
  });
  yearSelect.addEventListener("change", () => {
    state.year = yearSelect.value;
    renderScreen1();
  });

  buildCheckedDropdown({
    container: $("#screen1CategoryDropdown"),
    items: DATA.metadata.screen1_categories.map((category) => ({
      id: category.id,
      label: category.label,
      disabled: isCategoryDisabled(category),
    })),
    selectedSet: state.screen1Categories,
    singular: "category",
    plural: "categories",
    onChange: renderScreen1,
  });
}

function initScreen2Controls() {
  const select = $("#screen2Category");
  DATA.metadata.categories.forEach((category) => {
    const option = node("option", { value: category.id, disabled: isCategoryDisabled(category) ? "disabled" : null }, category.label);
    if (category.id === state.screen2Category) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    state.screen2Category = select.value;
    renderScreen2();
  });

  buildCheckedDropdown({
    container: $("#screen2VariableDropdown"),
    items: DATA.variables.map((variable) => ({
      id: variable.id,
      label: variable.label,
      title: variable.id,
    })),
    selectedSet: state.screen2Variables,
    singular: "variable",
    plural: "variables",
    onChange: renderScreen2,
  });
}

function initScreen3Controls() {
  const toggles = $("#screen3CategoryToggles");
  DATA.metadata.categories
    .filter((category) => category.id.startsWith("GW"))
    .forEach((category) => {
      const disabled = isCategoryDisabled(category);
      const input = node("input", { type: "checkbox", value: category.id, disabled: disabled ? "disabled" : null });
      input.checked = state.screen3Categories.has(category.id);
      input.addEventListener("change", () => {
        if (disabled) return;
        if (input.checked) state.screen3Categories.add(category.id);
        else state.screen3Categories.delete(category.id);
        renderScreen3();
      });
      const label = node("label", { className: disabled ? "is-disabled" : null, title: disabled ? "No scenarios available" : null });
      label.appendChild(input);
      label.appendChild(node("span", {}, category.label));
      toggles.appendChild(label);
    });

  $("#screen3All").addEventListener("click", () => {
    state.screen3Categories = new Set(enabledGwCategoryIds());
    syncScreen3Checks();
    renderScreen3();
  });

  $("#screen3Paris").addEventListener("click", () => {
    state.screen3Categories = new Set(["GW1", "GW2", "GW3"].filter((id) => enabledGwCategoryIds().includes(id)));
    syncScreen3Checks();
    renderScreen3();
  });

  $("#screen3BarMode").addEventListener("change", (event) => {
    state.barMode = event.target.value;
    renderScreen3();
  });
}

function syncScreen3Checks() {
  document.querySelectorAll("#screen3CategoryToggles input").forEach((input) => {
    input.checked = state.screen3Categories.has(input.value);
  });
}

function renderCurrentScreen() {
  if (state.screen === "screen1") renderScreen1();
  if (state.screen === "screen2") renderScreen2();
  if (state.screen === "screen3") renderScreen3();
}

function renderScreen1() {
  const svg = $("#boxplotSvg");
  const statsPanel = $("#boxplotStats");
  clear(svg);
  clear(statsPanel);

  const variable = DATA.variables.find((item) => item.id === state.variable);
  const yearStats = DATA.screen1[state.variable].years[state.year];
  const categories = selectedScreen1Categories();
  const width = Math.max(920, categories.length * 132 + 120);
  const height = 520;
  const margin = { top: 54, right: 30, bottom: 86, left: 78 };
  setViewBox(svg, width, height);

  if (!categories.length) {
    svg.appendChild(svgNode("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "tick-label" }, "Select at least one category"));
    return;
  }

  const values = [];
  categories.forEach((category) => {
    const summary = yearStats[category.id];
    ["unweighted", "weighted"].forEach((kind) => {
      if (!summary || summary.n === 0) return;
      Object.values(summary[kind]).forEach((value) => {
        if (finite(value)) values.push(Number(value));
      });
    });
  });

  const domain = paddedDomain(values);
  const y = scaleLinear(domain, [height - margin.bottom, margin.top]);
  const usableWidth = width - margin.left - margin.right;
  const xStep = usableWidth / categories.length;

  svg.appendChild(svgNode("text", { x: margin.left, y: 24, class: "plot-title" }, `${variable.label} (${state.year})`));
  svg.appendChild(svgNode("text", { x: margin.left, y: 43, class: "axis-label" }, DATA.screen1[state.variable].unit || variable.unit || ""));

  ticks(domain).forEach((tick) => {
    const yTick = y(tick);
    svg.appendChild(svgNode("line", { x1: margin.left, x2: width - margin.right, y1: yTick, y2: yTick, stroke: "#dfe5e1", "stroke-width": 1 }));
    svg.appendChild(svgNode("text", { x: margin.left - 10, y: yTick + 4, "text-anchor": "end", class: "tick-label" }, compactNumber(tick)));
  });
  svg.appendChild(svgNode("line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: height - margin.bottom, stroke: "#89958f", "stroke-width": 1 }));

  categories.forEach((category, index) => {
    const xCenter = margin.left + xStep * index + xStep / 2;
    const summary = yearStats[category.id];
    drawBoxPair(svg, summary, xCenter, y, category.color);
    svg.appendChild(svgNode("text", { x: xCenter, y: height - 50, "text-anchor": "middle", class: "plot-label" }, category.label));
    svg.appendChild(svgNode("text", { x: xCenter, y: height - 31, "text-anchor": "middle", class: "tick-label" }, `n=${summary.n}`));
    if (summary.n > 0 && summary.n < 10) {
      drawWarning(svg, xCenter + 42, height - 56);
    }
    statsPanel.appendChild(statBlock(category, summary));
  });

  drawBoxLegend(svg, width - 260, 28);
}

function drawBoxPair(svg, summary, xCenter, y, color) {
  if (!summary || summary.n === 0) {
    svg.appendChild(svgNode("text", { x: xCenter, y: 240, "text-anchor": "middle", class: "tick-label" }, "No data"));
    return;
  }
  drawDistributionBox(svg, xCenter - 18, summary.unweighted, y, color, 0.14, 0.32);
  drawDistributionBox(svg, xCenter + 18, summary.weighted, y, color, 0.34, 0.56);
}

function drawDistributionBox(svg, x, stats, y, color, whiskerOpacity, boxOpacity) {
  const q05 = y(stats.q05);
  const q25 = y(stats.q25);
  const q50 = y(stats.q50);
  const q75 = y(stats.q75);
  const q95 = y(stats.q95);
  const whiskerTop = Math.min(q05, q95);
  const whiskerHeight = Math.max(1, Math.abs(q05 - q95));
  const boxTop = Math.min(q25, q75);
  const boxHeight = Math.max(1, Math.abs(q25 - q75));

  svg.appendChild(svgNode("rect", { x: x - 12, y: whiskerTop, width: 24, height: whiskerHeight, fill: color, opacity: whiskerOpacity }));
  svg.appendChild(svgNode("rect", { x: x - 15, y: boxTop, width: 30, height: boxHeight, fill: color, opacity: boxOpacity }));
  svg.appendChild(svgNode("line", { x1: x - 18, x2: x + 18, y1: q50, y2: q50, stroke: "#111820", "stroke-width": 1.4 }));
}

function drawWarning(svg, x, y) {
  const triangle = svgNode("polygon", { points: `${x},${y - 10} ${x - 10},${y + 8} ${x + 10},${y + 8}`, fill: "#f0b429", stroke: "#7a5400", "stroke-width": 0.8 });
  triangle.appendChild(svgNode("title", {}, "Subset contains fewer than 10 scenarios"));
  svg.appendChild(triangle);
  svg.appendChild(svgNode("text", { x, y: y + 5, "text-anchor": "middle", "font-size": 12, "font-weight": 900, fill: "#241a00" }, "!"));
}

function drawBoxLegend(svg, x, y) {
  svg.appendChild(svgNode("rect", { x, y: y + 7, width: 24, height: 12, fill: "#6e7681", opacity: 0.24 }));
  svg.appendChild(svgNode("line", { x1: x - 2, x2: x + 26, y1: y + 13, y2: y + 13, stroke: "#111820", "stroke-width": 1.2 }));
  svg.appendChild(svgNode("text", { x: x + 36, y: y + 17, class: "tick-label" }, "Unweighted"));
  svg.appendChild(svgNode("rect", { x: x + 124, y: y + 7, width: 24, height: 12, fill: "#117733", opacity: 0.48 }));
  svg.appendChild(svgNode("line", { x1: x + 122, x2: x + 150, y1: y + 13, y2: y + 13, stroke: "#111820", "stroke-width": 1.2 }));
  svg.appendChild(svgNode("text", { x: x + 160, y: y + 17, class: "tick-label" }, "Weighted"));
}

function statBlock(category, summary) {
  const block = node("div", { className: "stat-block" });
  const title = node("div", { className: "stat-title" });
  title.appendChild(node("span", {}, category.label));
  if (summary.n > 0 && summary.n < 10) title.appendChild(node("span", { className: "warning-dot", title: "Subset contains fewer than 10 scenarios" }, "!"));
  block.appendChild(title);
  block.appendChild(statLine("Scenarios", summary.n));
  block.appendChild(statLine("Unweighted median", compactNumber(summary.unweighted.q50)));
  block.appendChild(statLine("Weighted median", compactNumber(summary.weighted.q50)));
  const shift = finite(summary.unweighted.q50) && finite(summary.weighted.q50) ? summary.weighted.q50 - summary.unweighted.q50 : null;
  block.appendChild(statLine("Median shift", compactNumber(shift)));
  return block;
}

function statLine(label, value) {
  const row = node("div", { className: "stat-line" });
  row.appendChild(node("span", { className: "muted" }, label));
  row.appendChild(node("strong", {}, String(value)));
  return row;
}

function renderScreen2() {
  const grid = $("#timeseriesGrid");
  clear(grid);
  const category = DATA.metadata.categories.find((item) => item.id === state.screen2Category);
  const color = timeseriesWeightColor(category.id);
  const dataForCategory = DATA.screen2[state.screen2Category];
  const totalN = categoryScenarioCount(category);
  const variables = selectedScreen2Variables();
  $("#screen2Count").textContent = `${category.label} | ${totalN} scenarios | ${variables.length} variables`;
  const warning = $("#screen2Warning");
  warning.hidden = totalN >= 10;
  grid.classList.toggle("has-single-card", variables.length === 1);

  if (!variables.length) {
    grid.appendChild(node("div", { className: "empty-state" }, "Select at least one variable"));
    return;
  }

  variables.forEach((variable) => {
    const summary = dataForCategory[variable.id];
    const card = node("article", { className: "mini-card" });
    const head = node("div", { className: "mini-head" });
    head.appendChild(node("div", { className: "mini-title", title: variable.id }, variable.label));
    head.appendChild(node("div", { className: "mini-meta" }, `n=${summary.n}`));
    card.appendChild(head);
    const svg = svgNode("svg", { role: "img", "aria-label": `${variable.label} timeseries` });
    card.appendChild(svg);
    grid.appendChild(card);
    drawMiniChart(svg, summary, variable, color, variables.length === 1);
  });
}

function drawMiniChart(svg, summary, variable, color, isLarge = false) {
  clear(svg);
  const width = isLarge ? 920 : 360;
  const height = isLarge ? 420 : 190;
  const margin = isLarge
    ? { top: 22, right: 30, bottom: 48, left: 78 }
    : { top: 10, right: 12, bottom: 30, left: 52 };
  setViewBox(svg, width, height);

  const years = DATA.metadata.years.map(Number);
  const values = [];
  ["unweighted", "weighted"].forEach((kind) => {
    ["q05", "q25", "q50", "q75", "q95"].forEach((key) => {
      summary[kind][key].forEach((value) => {
        if (finite(value)) values.push(Number(value));
      });
    });
  });

  if (!values.length) {
    svg.appendChild(svgNode("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "tick-label" }, "No data"));
    return;
  }

  const x = scaleLinear([Math.min(...years), Math.max(...years)], [margin.left, width - margin.right]);
  const domain = paddedDomain(values, 0.1);
  const y = scaleLinear(domain, [height - margin.bottom, margin.top]);

  svg.appendChild(svgNode("line", { x1: margin.left, x2: width - margin.right, y1: height - margin.bottom, y2: height - margin.bottom, stroke: "#89958f", "stroke-width": 0.8 }));
  svg.appendChild(svgNode("line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: height - margin.bottom, stroke: "#89958f", "stroke-width": 0.8 }));
  const yearTicks = isLarge ? years.filter((year) => year % 20 === 0 || year === years[0] || year === years[years.length - 1]) : [years[0], years[years.length - 1]];
  yearTicks.forEach((year) => {
    const xTick = x(year);
    if (isLarge) {
      svg.appendChild(svgNode("line", { x1: xTick, x2: xTick, y1: margin.top, y2: height - margin.bottom, stroke: "#dfe5e1", "stroke-width": 0.8 }));
    }
    svg.appendChild(svgNode("text", { x: xTick, y: height - 12, "text-anchor": "middle", class: "tick-label" }, year));
  });
  ticks(domain, isLarge ? 5 : 2).forEach((tick) => {
    const yTick = y(tick);
    if (isLarge) {
      svg.appendChild(svgNode("line", { x1: margin.left, x2: width - margin.right, y1: yTick, y2: yTick, stroke: "#dfe5e1", "stroke-width": 0.8 }));
    }
    svg.appendChild(svgNode("text", { x: margin.left - 7, y: yTick + 4, "text-anchor": "end", class: "tick-label" }, compactNumber(tick)));
  });

  drawArea(svg, years, summary.unweighted.q05, summary.unweighted.q95, x, y, "#5d6776", 0.12);
  drawArea(svg, years, summary.unweighted.q25, summary.unweighted.q75, x, y, "#5d6776", 0.22);
  drawArea(svg, years, summary.weighted.q25, summary.weighted.q75, x, y, color, 0.28);
  drawLineSegments(svg, years, summary.unweighted.q50, x, y, { stroke: "#111820", "stroke-width": 1.1, "stroke-dasharray": "4 3", fill: "none" });
  drawLineSegments(svg, years, summary.weighted.q50, x, y, { stroke: color, "stroke-width": 1.5, fill: "none" });

  if (summary.unit || variable.unit) {
    svg.appendChild(svgNode("text", { x: width - margin.right, y: margin.top + 11, "text-anchor": "end", class: "tick-label" }, shortText(summary.unit || variable.unit, 32)));
  }
}

function drawArea(svg, years, lower, upper, x, y, fill, opacity) {
  const segments = [];
  let current = [];
  years.forEach((year, index) => {
    if (finite(lower[index]) && finite(upper[index])) current.push(index);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  segments.forEach((indices) => {
    const upperPoints = indices.map((index) => [x(years[index]), y(upper[index])]);
    const lowerPoints = indices.slice().reverse().map((index) => [x(years[index]), y(lower[index])]);
    const d = `${polylinePath(upperPoints)} ${lowerPoints.map((point) => `L${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ")} Z`;
    svg.appendChild(svgNode("path", { d, fill, opacity }));
  });
}

function drawLineSegments(svg, years, values, x, y, attrs) {
  let current = [];
  const flush = () => {
    if (current.length > 1) {
      svg.appendChild(svgNode("path", { d: polylinePath(current), ...attrs }));
    }
    current = [];
  };
  years.forEach((year, index) => {
    if (finite(values[index])) current.push([x(year), y(values[index])]);
    else flush();
  });
  flush();
}

function renderScreen3() {
  const rows = activeRows();
  $("#screen3Count").textContent = `${rows.length} scenarios`;
  drawRankPlot(rows);
  drawBars(rows);
  renderRankLegends(rows);
  renderRankTables(rows);
}

function rankByGroup(rows, key) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row[key], (counts.get(row[key]) || 0) + 1));
  return rows
    .slice()
    .sort((a, b) => {
      const countDiff = (counts.get(a[key]) || 0) - (counts.get(b[key]) || 0);
      if (countDiff !== 0) return countDiff;
      const groupDiff = String(a[key]).localeCompare(String(b[key]));
      if (groupDiff !== 0) return groupDiff;
      return Number(b.weight) - Number(a.weight);
    })
    .reduce((map, row, index) => map.set(row.id, index + 1), new Map());
}

function drawRankPlot(rows) {
  const svg = $("#rankSvg");
  clear(svg);
  const width = 860;
  const height = 620;
  const margin = { top: 82, right: 58, bottom: 70, left: 58 };
  setViewBox(svg, width, height);

  svg.appendChild(svgNode("text", { x: margin.left, y: 26, class: "plot-title" }, "Rank shift by diversity weight"));
  svg.appendChild(svgNode("text", { x: margin.left, y: 45, class: "axis-label" }, "Middle axis uses the weight distribution"));

  if (!rows.length) {
    svg.appendChild(svgNode("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "tick-label" }, "No categories selected"));
    return;
  }

  const xLeft = margin.left + 32;
  const xMid = width / 2;
  const xRight = width - margin.right - 32;
  const top = margin.top;
  const bottom = height - margin.bottom;
  const yRank = scaleLinear([1, rows.length], [top, bottom]);
  const weights = rows.map((row) => Number(row.weight)).filter(finite);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const yWeight = scaleLinear([minWeight, maxWeight], [bottom, top]);
  const leftRank = rankByGroup(rows, "model_family");
  const rightRank = rankByGroup(rows, "project");
  const sorted = rows.slice().sort((a, b) => Number(b.weight) - Number(a.weight));
  const topIds = new Set(sorted.slice(0, 20).map((row) => row.id));
  const bottomIds = new Set(sorted.slice(-20).map((row) => row.id));

  [
    [xLeft, "Model family"],
    [xMid, "Diversity weight"],
    [xRight, "Project"],
  ].forEach(([xPos, label]) => {
    svg.appendChild(svgNode("line", { x1: xPos, x2: xPos, y1: top, y2: bottom, stroke: "#1c2430", "stroke-width": 0.8, opacity: 0.55 }));
    svg.appendChild(svgNode("text", { x: xPos, y: top - 14, "text-anchor": "middle", class: "plot-label" }, label));
  });

  ticks([1, rows.length], 5).forEach((tick) => {
    const yTick = yRank(tick);
    svg.appendChild(svgNode("line", { x1: xLeft - 6, x2: xRight + 6, y1: yTick, y2: yTick, stroke: "#dfe5e1", "stroke-width": 0.8 }));
    svg.appendChild(svgNode("text", { x: xLeft - 12, y: yTick + 4, "text-anchor": "end", class: "tick-label" }, Math.round(tick)));
  });

  const medianWeight = sorted[Math.floor(sorted.length / 2)]?.weight || minWeight;
  [
    [maxWeight, "max"],
    [medianWeight, "median"],
    [minWeight, "min"],
  ].forEach(([weight, label]) => {
    const yTick = yWeight(weight);
    svg.appendChild(svgNode("line", { x1: xMid - 5, x2: xMid + 5, y1: yTick, y2: yTick, stroke: "#1c2430", "stroke-width": 0.9 }));
    svg.appendChild(svgNode("text", { x: xMid + 10, y: yTick + 4, class: "tick-label" }, `${label} ${weightNumber(weight)}`));
  });

  const drawRows = (highlightOnly) => {
    rows.forEach((row) => {
      const isHighlight = topIds.has(row.id) || bottomIds.has(row.id);
      if (highlightOnly !== isHighlight) return;
      const yl = yRank(leftRank.get(row.id));
      const ym = yWeight(row.weight);
      const yr = yRank(rightRank.get(row.id));
      const leftColor = colorFor("model_family", row.model_family);
      const rightColor = colorFor("project", row.project);
      const opacity = isHighlight ? 0.82 : 0.18;
      const widthLine = isHighlight ? 1.25 : 0.55;
      svg.appendChild(svgNode("path", { d: curvePath(xLeft, yl, xMid, ym), fill: "none", stroke: leftColor, "stroke-width": widthLine, opacity }));
      svg.appendChild(svgNode("path", { d: curvePath(xMid, ym, xRight, yr), fill: "none", stroke: rightColor, "stroke-width": widthLine, opacity }));
      if (isHighlight) {
        svg.appendChild(svgNode("circle", { cx: xMid, cy: ym, r: 2.2, fill: bottomIds.has(row.id) ? "#a50f15" : "#117733", opacity: 0.9 }));
      }
    });
  };
  drawRows(false);
  drawRows(true);

  svg.appendChild(svgNode("text", { x: xLeft, y: height - 36, "text-anchor": "middle", class: "tick-label" }, "Rank 1 at top"));
  svg.appendChild(svgNode("text", { x: xMid, y: height - 36, "text-anchor": "middle", class: "tick-label" }, "Scaled by weight value"));
  svg.appendChild(svgNode("text", { x: xRight, y: height - 36, "text-anchor": "middle", class: "tick-label" }, "Rank 1 at top"));
}

function drawBars(rows) {
  const svg = $("#barsSvg");
  clear(svg);
  const width = 480;
  const height = 620;
  const margin = { top: 62, right: 38, bottom: 52, left: 160 };
  setViewBox(svg, width, height);

  const labels = {
    model_family: "Model family shares",
    model_type: "Model type shares",
    project: "Project shares",
  };
  svg.appendChild(svgNode("text", { x: 16, y: 26, class: "plot-title" }, labels[state.barMode]));

  if (!rows.length) {
    svg.appendChild(svgNode("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "tick-label" }, "No categories selected"));
    return;
  }

  const groups = new Map();
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  rows.forEach((row) => {
    const key = row[state.barMode] || "Unknown";
    if (!groups.has(key)) groups.set(key, { label: key, count: 0, weight: 0 });
    const group = groups.get(key);
    group.count += 1;
    group.weight += Number(row.weight || 0);
  });

  let summary = Array.from(groups.values()).map((group) => ({
    ...group,
    unweighted: (group.count / rows.length) * 100,
    weighted: totalWeight > 0 ? (group.weight / totalWeight) * 100 : 0,
  }));
  summary.sort((a, b) => Math.max(b.weighted, b.unweighted) - Math.max(a.weighted, a.unweighted));

  const maxBars = 15;
  if (summary.length > maxBars) {
    const visible = summary.slice(0, maxBars - 1);
    const rest = summary.slice(maxBars - 1);
    visible.push({
      label: "Other selected",
      count: rest.reduce((sum, group) => sum + group.count, 0),
      weight: rest.reduce((sum, group) => sum + group.weight, 0),
      unweighted: rest.reduce((sum, group) => sum + group.unweighted, 0),
      weighted: rest.reduce((sum, group) => sum + group.weighted, 0),
    });
    summary = visible;
  }

  const maxShare = Math.max(5, ...summary.flatMap((group) => [group.unweighted, group.weighted]));
  const x = scaleLinear([0, maxShare * 1.1], [margin.left, width - margin.right]);
  const rowHeight = (height - margin.top - margin.bottom) / summary.length;

  ticks([0, maxShare * 1.1], 4).forEach((tick) => {
    const xTick = x(tick);
    svg.appendChild(svgNode("line", { x1: xTick, x2: xTick, y1: margin.top - 14, y2: height - margin.bottom + 8, stroke: "#dfe5e1", "stroke-width": 0.8 }));
    svg.appendChild(svgNode("text", { x: xTick, y: height - 18, "text-anchor": "middle", class: "tick-label" }, `${Math.round(tick)}%`));
  });

  summary.forEach((group, index) => {
    const yMid = margin.top + index * rowHeight + rowHeight / 2;
    const color = group.label === "Other selected" ? "#909090" : colorFor(state.barMode, group.label);
    svg.appendChild(svgNode("text", { x: margin.left - 10, y: yMid + 4, "text-anchor": "end", class: "tick-label" }, shortText(group.label, 22)));
    svg.appendChild(svgNode("rect", { x: margin.left, y: yMid - 8, width: Math.max(1, x(group.unweighted) - margin.left), height: 7, fill: "#6e7681", opacity: 0.42 }));
    svg.appendChild(svgNode("rect", { x: margin.left, y: yMid + 2, width: Math.max(1, x(group.weighted) - margin.left), height: 7, fill: color, opacity: 0.86 }));
  });

  svg.appendChild(svgNode("rect", { x: 18, y: 40, width: 14, height: 8, fill: "#6e7681", opacity: 0.42 }));
  svg.appendChild(svgNode("text", { x: 38, y: 48, class: "tick-label" }, "Unweighted"));
  svg.appendChild(svgNode("rect", { x: 122, y: 40, width: 14, height: 8, fill: "#117733", opacity: 0.86 }));
  svg.appendChild(svgNode("text", { x: 142, y: 48, class: "tick-label" }, "Weighted"));
}

function renderRankLegends(rows) {
  const container = $("#rankLegends");
  clear(container);
  if (!rows.length) return;

  container.appendChild(legendPanel("Model family colors", uniqueLegendItems(rows, "model_family")));
  container.appendChild(legendPanel("Project colors", uniqueLegendItems(rows, "project")));
}

function uniqueLegendItems(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key] || "Unknown")))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((value) => ({
      label: value,
      color: colorFor(key, value),
    }));
}

function legendPanel(title, items) {
  const panel = node("section", { className: "legend-panel" });
  panel.appendChild(node("h2", {}, title));
  const list = node("div", { className: "legend-items" });
  items.forEach((item) => {
    const row = node("div", { className: "legend-item", title: item.label });
    row.appendChild(node("span", { className: "legend-swatch", style: `background:${item.color}` }));
    row.appendChild(node("span", {}, item.label));
    list.appendChild(row);
  });
  panel.appendChild(list);
  return panel;
}

function renderRankTables(rows) {
  const container = $("#rankTables");
  clear(container);
  if (!rows.length) return;

  const sorted = rows.slice().sort((a, b) => Number(b.weight) - Number(a.weight));
  const rankMap = new Map(sorted.map((row, index) => [row.id, index + 1]));
  container.appendChild(tablePanel("Top 20 scenarios", sorted.slice(0, 20), rankMap));
  container.appendChild(tablePanel("Bottom 20 scenarios", sorted.slice(-20).reverse(), rankMap));
}

function tablePanel(title, rows, rankMap) {
  const panel = node("section", { className: "table-panel" });
  panel.appendChild(node("h2", {}, title));
  const scroll = node("div", { className: "table-scroll" });
  const table = node("table");
  const thead = node("thead");
  const headRow = node("tr");
  ["Rank", "Model", "Scenario", "Category", "Weight"].forEach((label) => headRow.appendChild(node("th", {}, label)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = node("tbody");
  rows.forEach((row) => {
    const tr = node("tr");
    tr.appendChild(node("td", {}, rankMap.get(row.id)));
    tr.appendChild(node("td", {}, row.model));
    tr.appendChild(node("td", {}, row.scenario));
    tr.appendChild(node("td", {}, row.category));
    tr.appendChild(node("td", {}, weightNumber(row.weight)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);
  panel.appendChild(scroll);
  return panel;
}

fetch("dashboard_data.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((payload) => {
    DATA = payload;
    init();
  })
  .catch((error) => {
    const loadError = $("#loadError");
    loadError.hidden = false;
    loadError.textContent = `Could not load dashboard_data.json. Run a local server from sci/Dashboard, then refresh. ${error.message}`;
  });
