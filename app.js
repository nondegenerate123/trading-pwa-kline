const state = {
  fills: [],
  candles: [],
  availableDates: [],
  selectedDate: '',
  mode: 'entry_based',
  multiplier: 5,
  feePerContractPerSide: 0.74,
  ordersTimezone: '-04:00',
  candlesTimezone: '-04:00',
  displayTimezone: '-04:00',
  currentTrades: [],
  dragState: null,
};

const els = {
  ordersFile: document.getElementById('ordersFile'),
  candlesFile: document.getElementById('candlesFile'),
  feeFile: document.getElementById('feeFile'),
  ordersTimezone: document.getElementById('ordersTimezone'),
  candlesTimezone: document.getElementById('candlesTimezone'),
  displayTimezone: document.getElementById('displayTimezone'),
  modeSelect: document.getElementById('modeSelect'),
  multiplierInput: document.getElementById('multiplierInput'),
  feeRateInput: document.getElementById('feeRateInput'),
  dateSelect: document.getElementById('dateSelect'),
  downloadFeeTemplateBtn: document.getElementById('downloadFeeTemplateBtn'),
  clearFeesBtn: document.getElementById('clearFeesBtn'),
  resetLabelsBtn: document.getElementById('resetLabelsBtn'),
  exportTradesBtn: document.getElementById('exportTradesBtn'),
  dataStatus: document.getElementById('dataStatus'),
  pageTitle: document.getElementById('pageTitle'),
  summaryNote: document.getElementById('summaryNote'),
  summaryCards: document.getElementById('summaryCards'),
  klineMeta: document.getElementById('klineMeta'),
  klineChartWrap: document.getElementById('klineChartWrap'),
  chartPie: document.getElementById('chartPie'),
  chartPnl: document.getElementById('chartPnl'),
  chartCumGross: document.getElementById('chartCumGross'),
  chartCumNet: document.getElementById('chartCumNet'),
  tradeTableWrap: document.getElementById('tradeTableWrap'),
};

const COLORS = {
  green: '#2bd469',
  red: '#ff4d67',
  yellow: '#ffca4f',
  blue: '#69a5ff',
  orange: '#ffb24d',
  muted: '#9ca7b8',
  line: '#303848',
  bg: '#11151b',
  white: '#f6f8fb',
  darkGreen: '#126b2f',
  darkRed: '#8b2333',
};

boot();

function boot() {
  populateTimezoneSelects();
  bindEvents();
  restoreUiPrefs();
  resetVisuals();
}

function bindEvents() {
  els.ordersFile.addEventListener('change', onOrdersSelected);
  els.candlesFile.addEventListener('change', onCandlesSelected);
  els.feeFile.addEventListener('change', onFeesSelected);

  els.ordersTimezone.addEventListener('change', () => {
    state.ordersTimezone = els.ordersTimezone.value;
    persistUiPrefs();
  });
  els.candlesTimezone.addEventListener('change', () => {
    state.candlesTimezone = els.candlesTimezone.value;
    state.displayTimezone = state.candlesTimezone;
    els.displayTimezone.value = state.displayTimezone;
    persistUiPrefs();
    if (state.candles.length) reparseCandlesWithCurrentTimezone();
  });
  els.displayTimezone.addEventListener('change', () => {
    state.displayTimezone = els.displayTimezone.value;
    persistUiPrefs();
    renderCurrentDay();
  });
  els.modeSelect.addEventListener('change', () => {
    state.mode = els.modeSelect.value;
    persistUiPrefs();
    renderCurrentDay();
  });
  els.multiplierInput.addEventListener('change', () => {
    const val = Number(els.multiplierInput.value);
    state.multiplier = Number.isFinite(val) && val > 0 ? val : 5;
    els.multiplierInput.value = String(state.multiplier);
    persistUiPrefs();
    renderCurrentDay();
  });
  els.feeRateInput.addEventListener('change', () => {
    const val = Number(els.feeRateInput.value);
    state.feePerContractPerSide = Number.isFinite(val) && val >= 0 ? val : 0.74;
    els.feeRateInput.value = String(state.feePerContractPerSide);
    persistUiPrefs();
    renderCurrentDay();
  });
  els.dateSelect.addEventListener('change', () => {
    state.selectedDate = els.dateSelect.value;
    renderCurrentDay();
  });
  els.downloadFeeTemplateBtn.addEventListener('click', downloadFeeTemplate);
  els.clearFeesBtn.addEventListener('click', clearCurrentDayFees);
  els.resetLabelsBtn.addEventListener('click', resetCurrentDayLabels);
  els.exportTradesBtn.addEventListener('click', exportTradesCsv);
}

function populateTimezoneSelects() {
  const values = [];
  for (let min = -12 * 60; min <= 14 * 60; min += 30) values.push(min);
  const html = values.map(min => {
    const sign = min >= 0 ? '+' : '-';
    const abs = Math.abs(min);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    const value = `${sign}${hh}:${mm}`;
    return `<option value="${value}">UTC${value}</option>`;
  }).join('');
  els.ordersTimezone.innerHTML = html;
  els.candlesTimezone.innerHTML = html;
  els.displayTimezone.innerHTML = html;
}

function restoreUiPrefs() {
  const prefs = readJson('tda_pro_ui_prefs', {});
  if (prefs.mode) state.mode = prefs.mode;
  if (prefs.multiplier) state.multiplier = prefs.multiplier;
  if (prefs.feePerContractPerSide !== undefined) state.feePerContractPerSide = prefs.feePerContractPerSide;
  if (prefs.ordersTimezone) state.ordersTimezone = prefs.ordersTimezone;
  if (prefs.candlesTimezone) state.candlesTimezone = prefs.candlesTimezone;
  if (prefs.displayTimezone) state.displayTimezone = prefs.displayTimezone;

  els.modeSelect.value = state.mode;
  els.multiplierInput.value = String(state.multiplier);
  els.feeRateInput.value = String(state.feePerContractPerSide);
  els.ordersTimezone.value = state.ordersTimezone;
  els.candlesTimezone.value = state.candlesTimezone;
  els.displayTimezone.value = state.displayTimezone;
}

function persistUiPrefs() {
  writeJson('tda_pro_ui_prefs', {
    mode: state.mode,
    multiplier: state.multiplier,
    feePerContractPerSide: state.feePerContractPerSide,
    ordersTimezone: state.ordersTimezone,
    candlesTimezone: state.candlesTimezone,
    displayTimezone: state.displayTimezone,
  });
}

async function onOrdersSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const fills = normalizeFills(rows, state.ordersTimezone);
    if (!fills.length) throw new Error('没有识别到可用成交记录。');
    state.fills = fills.sort((a, b) => a.epoch - b.epoch);
    refreshDates();
    setStatus(`已导入 ${file.name}，识别到 ${state.fills.length} 条成交记录。`, 'good');
  } catch (err) {
    console.error(err);
    setStatus(`交易 CSV 导入失败：${err.message}`, 'warn');
    resetVisuals();
  } finally {
    els.ordersFile.value = '';
  }
}

async function onCandlesSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const candles = normalizeCandles(rows, state.candlesTimezone);
    if (!candles.length) throw new Error('没有识别到可用 K 线记录。');
    state.candles = candles.sort((a, b) => a.epoch - b.epoch);
    refreshDates();
    setStatus(`已导入 ${file.name}，识别到 ${state.candles.length} 根 K 线。`, 'good');
  } catch (err) {
    console.error(err);
    setStatus(`K 线 CSV 导入失败：${err.message}`, 'warn');
  } finally {
    els.candlesFile.value = '';
  }
}

function reparseCandlesWithCurrentTimezone() {
  if (!state.candles.length) return renderCurrentDay();
  renderCurrentDay();
}

async function onFeesSelected(e) {
  const file = e.target.files?.[0];
  if (!file || !state.currentTrades.length) return;
  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const imported = importFees(rows);
    renderCurrentDay();
    setStatus(`已导入 ${file.name}，匹配到 ${imported.length} 条 fee。`, 'good');
  } catch (err) {
    console.error(err);
    setStatus(`fee CSV 导入失败：${err.message}`, 'warn');
  } finally {
    els.feeFile.value = '';
  }
}

function refreshDates() {
  if (!state.fills.length) return resetVisuals();
  state.availableDates = [...new Set(state.fills.map(fill => fill.date))].sort();
  if (!state.availableDates.includes(state.selectedDate)) {
    state.selectedDate = state.availableDates[state.availableDates.length - 1];
  }
  els.dateSelect.disabled = false;
  els.dateSelect.innerHTML = state.availableDates.map(date =>
    `<option value="${date}" ${date === state.selectedDate ? 'selected' : ''}>${date}</option>`
  ).join('');
  els.downloadFeeTemplateBtn.disabled = false;
  els.clearFeesBtn.disabled = false;
  els.resetLabelsBtn.disabled = false;
  els.exportTradesBtn.disabled = false;
  renderCurrentDay();
}

function renderCurrentDay() {
  if (!state.selectedDate || !state.fills.length) return resetVisuals();

  const dayFills = state.fills.filter(fill => fill.date === state.selectedDate);
  const baseTrades = state.mode === 'entry_based'
    ? buildEntryBasedTrades(dayFills, state.multiplier)
    : buildRoundTripTrades(dayFills, state.multiplier);

  state.currentTrades = applyFeesAndCums(baseTrades, state.selectedDate, state.mode);

  els.pageTitle.textContent = `${state.selectedDate} 单日分析`;
  const manualCount = state.currentTrades.filter(t => t.feeSource === 'manual').length;
  els.summaryNote.textContent = `订单时区 ${state.ordersTimezone} · K线时区 ${state.candlesTimezone} · 手动 fee ${manualCount}/${state.currentTrades.length}`;
  els.summaryNote.className = manualCount ? 'pill ok' : 'pill muted';

  renderSummaryCards(state.currentTrades);
  renderCharts(state.currentTrades);
  renderTradeTable(state.currentTrades);
  renderKlineOverlay();
}

function resetVisuals() {
  els.dateSelect.disabled = true;
  els.dateSelect.innerHTML = '<option value="">请先导入交易 CSV</option>';
  els.downloadFeeTemplateBtn.disabled = true;
  els.clearFeesBtn.disabled = true;
  els.resetLabelsBtn.disabled = true;
  els.exportTradesBtn.disabled = true;
  els.pageTitle.textContent = '单日分析';
  els.summaryNote.textContent = '等待数据';
  els.summaryNote.className = 'pill muted';
  els.klineMeta.textContent = '等待导入 K 线 CSV';
  els.summaryCards.className = 'summary-cards empty-state';
  els.summaryCards.innerHTML = '<p>导入交易 CSV 后，这里会显示 Trades、Win rate、Gross P&amp;L、Fees、Net P&amp;L。</p>';
  [els.chartPie, els.chartPnl, els.chartCumGross, els.chartCumNet].forEach(el => {
    el.className = 'chart-box empty-state';
    el.textContent = '暂无图表';
  });
  els.klineChartWrap.className = 'kline-wrap empty-state';
  els.klineChartWrap.textContent = '暂无 K 线图';
  els.tradeTableWrap.className = 'table-wrap empty-state';
  els.tradeTableWrap.textContent = '暂无交易明细';
  state.currentTrades = [];
}

function setStatus(message, type = 'muted') {
  els.dataStatus.className = `status-card ${type}`;
  els.dataStatus.textContent = message;
}

function normalizeFills(rows, timezoneString) {
  return rows.map(raw => normalizeFill(raw, timezoneString)).filter(Boolean);
}

function normalizeFill(raw, timezoneString) {
  const row = normalizeKeys(raw);
  const status = String(pick(row, ['状态', 'status']) || '').trim().toLowerCase();
  const isFilled = status === '全部成交' || status === 'filled';
  if (!isFilled) return null;

  const sideRaw = String(pick(row, ['方向', 'side']) || '').trim().toLowerCase();
  let side = null;
  if (sideRaw === '买入' || sideRaw === 'buy') side = 'Buy';
  if (sideRaw === '卖出' || sideRaw === 'sell') side = 'Sell';
  if (!side) return null;

  const qty = parseNumber(pick(row, ['已成交', 'filled qty', 'filled_qty', 'qty', '总数量']));
  const price = parseNumber(pick(row, ['成交均价', 'avg fill price', 'avg_fill_price', '价格', 'price']));
  const epoch = parseTimestampWithOffset(pick(row, ['成交时间', 'update time', 'filled time', 'time']), timezoneString);
  if (!qty || !price || !Number.isFinite(epoch)) return null;

  return {
    epoch,
    time: new Date(epoch),
    date: formatDateInOffset(epoch, parseOffsetMinutes(timezoneString)),
    side,
    qty,
    price,
    symbol: String(pick(row, ['代码', 'symbol']) || ''),
  };
}

function normalizeCandles(rows, timezoneString) {
  return rows.map(raw => {
    const row = normalizeKeys(raw);
    const epoch = parseTimestampWithOffset(pick(row, ['time', 'timestamp', 'date', 'datetime']), timezoneString);
    const open = parseNumber(pick(row, ['open', 'o']));
    const high = parseNumber(pick(row, ['high', 'h']));
    const low = parseNumber(pick(row, ['low', 'l']));
    const close = parseNumber(pick(row, ['close', 'c']));
    if (![epoch, open, high, low, close].every(Number.isFinite)) return null;
    return {
      epoch,
      date: formatDateInOffset(epoch, parseOffsetMinutes(timezoneString)),
      open, high, low, close,
    };
  }).filter(Boolean);
}

function buildRoundTripTrades(dayFills, multiplier) {
  const fills = [...dayFills].sort((a, b) => a.epoch - b.epoch);
  const trades = [];
  let segment = [];
  let pos = 0;

  for (const fill of fills) {
    if (pos === 0) segment = [];
    segment.push(fill);
    pos += fill.side === 'Buy' ? fill.qty : -fill.qty;

    if (pos === 0 && segment.length) {
      const buys = segment.filter(x => x.side === 'Buy');
      const sells = segment.filter(x => x.side === 'Sell');
      const gross = sum(sells.map(x => x.qty * x.price)) * multiplier - sum(buys.map(x => x.qty * x.price)) * multiplier;
      const first = segment[0];
      const entryQty = sum(segment.filter(x => x.side === first.side).map(x => x.qty));
      const entryPrice = weightedPrice(segment.filter(x => x.side === first.side));
      const exitPrice = weightedPrice(segment.filter(x => x.side !== first.side));
      trades.push({
        entryTime: segment[0].time,
        exitTime: segment[segment.length - 1].time,
        direction: first.side === 'Buy' ? 'Long' : 'Short',
        qty: entryQty,
        entryPrice,
        exitPrice,
        grossPnl: round2(gross),
      });
      segment = [];
    }
  }

  return finalizeTrades(trades, multiplier);
}

function buildEntryBasedTrades(dayFills, multiplier) {
  const fills = [...dayFills].sort((a, b) => a.epoch - b.epoch);
  const openLots = [];
  const parts = [];
  let nextLotId = 1;

  for (const fill of fills) {
    let remaining = fill.qty;

    while (remaining > 0 && openLots.length && openLots[0].side !== fill.side) {
      const lot = openLots[0];
      const matchQty = Math.min(remaining, lot.remainingQty);
      let grossPnl = 0;
      let direction = 'Long';
      if (lot.side === 'Buy') {
        grossPnl = (fill.price - lot.entryPrice) * matchQty * multiplier;
        direction = 'Long';
      } else {
        grossPnl = (lot.entryPrice - fill.price) * matchQty * multiplier;
        direction = 'Short';
      }
      parts.push({
        lotId: lot.lotId,
        entryTime: lot.entryTime,
        entryPrice: lot.entryPrice,
        exitTime: fill.time,
        exitPrice: fill.price,
        qty: matchQty,
        grossPnl,
        direction,
      });
      lot.remainingQty -= matchQty;
      remaining -= matchQty;
      if (lot.remainingQty === 0) openLots.shift();
    }

    if (remaining > 0) {
      openLots.push({
        lotId: nextLotId++,
        side: fill.side,
        entryTime: fill.time,
        entryPrice: fill.price,
        remainingQty: remaining,
      });
    }
  }

  const grouped = groupBy(parts, x => x.lotId);
  const trades = Object.values(grouped).map(group => {
    const qty = sum(group.map(x => x.qty));
    const grossPnl = sum(group.map(x => x.grossPnl));
    return {
      entryTime: group[0].entryTime,
      exitTime: group[group.length - 1].exitTime,
      direction: group[0].direction,
      qty,
      entryPrice: group[0].entryPrice,
      exitPrice: weightedPrice(group.map(x => ({ qty: x.qty, price: x.exitPrice }))),
      grossPnl: round2(grossPnl),
    };
  }).sort((a, b) => a.entryTime - b.entryTime || a.exitTime - b.exitTime);

  return finalizeTrades(trades, multiplier);
}

function finalizeTrades(trades, multiplier) {
  return trades.map((trade, idx) => ({
    tradeNo: idx + 1,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    direction: trade.direction,
    qty: trade.qty,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    grossPnl: round2(trade.grossPnl),
    points: round2(trade.grossPnl / (trade.qty * multiplier)),
  }));
}

function applyFeesAndCums(trades, date, mode) {
  const feeMap = readJson('tda_pro_fees', {});
  let cumGross = 0;
  let cumNet = 0;
  return trades.map(trade => {
    const tradeKey = makeTradeKey(trade, date, mode);
    const autoFee = round2(trade.qty * 2 * state.feePerContractPerSide);
    const manualFee = feeMap[tradeKey];
    const fee = Number.isFinite(manualFee) ? round2(manualFee) : autoFee;
    const netPnl = round2(trade.grossPnl - fee);
    cumGross = round2(cumGross + trade.grossPnl);
    cumNet = round2(cumNet + netPnl);
    return {
      ...trade,
      date,
      mode,
      tradeKey,
      autoFee,
      fee,
      feeSource: Number.isFinite(manualFee) ? 'manual' : 'auto',
      netPnl,
      cumGross,
      cumNet,
    };
  });
}

function renderSummaryCards(trades) {
  if (!trades.length) {
    els.summaryCards.className = 'summary-cards empty-state';
    els.summaryCards.innerHTML = '<p>当前日期没有可闭合交易。</p>';
    return;
  }
  const wins = trades.filter(t => t.netPnl > 0).length;
  const winRate = wins / trades.length * 100;
  const gross = sum(trades.map(t => t.grossPnl));
  const fees = sum(trades.map(t => t.fee));
  const net = sum(trades.map(t => t.netPnl));

  const cards = [
    ['Trades', String(trades.length), ''],
    ['Win rate', `${winRate.toFixed(2)}%`, 'yellow'],
    ['Gross P&L', fmtMoney(gross), gross >= 0 ? 'green' : 'red'],
    ['Fees', fmtMoney(fees), 'yellow'],
    ['Net P&L', fmtMoney(net), net >= 0 ? 'green' : 'red'],
  ];

  els.summaryCards.className = 'summary-cards';
  els.summaryCards.innerHTML = cards.map(([label, value, tone]) => `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value ${tone}">${escapeHtml(value)}</div>
    </div>
  `).join('');
}

function renderCharts(trades) {
  if (!trades.length) {
    [els.chartPie, els.chartPnl, els.chartCumGross, els.chartCumNet].forEach(el => {
      el.className = 'chart-box empty-state';
      el.textContent = '暂无图表';
    });
    return;
  }
  renderPieChart(trades);
  renderBarChart(els.chartPnl, trades.map(t => ({ label: String(t.tradeNo), value: t.netPnl })), 'net');
  renderBarChart(els.chartCumGross, trades.map(t => ({ label: String(t.tradeNo), value: t.cumGross })), 'cum_gross');
  renderBarChart(els.chartCumNet, trades.map(t => ({ label: String(t.tradeNo), value: t.cumNet })), 'cum_net');
}

function renderPieChart(trades) {
  const wins = trades.filter(t => t.netPnl > 0).length;
  const losses = trades.filter(t => t.netPnl < 0).length;
  const breakeven = trades.length - wins - losses;
  const total = trades.length || 1;
  const slices = [
    { label: 'Winning', value: wins, color: COLORS.green },
    { label: 'Breakeven', value: breakeven, color: COLORS.yellow },
    { label: 'Losing', value: losses, color: COLORS.red },
  ];
  let start = -Math.PI / 2;
  const cx = 170, cy = 160, r = 96, innerR = 56;
  const paths = slices.map(slice => {
    const angle = Math.PI * 2 * (slice.value / total);
    const end = start + angle;
    const path = angle === 0 ? '' : donutPath(cx, cy, r, innerR, start, end);
    const out = `<path d="${path}" fill="${slice.color}"></path>`;
    start = end;
    return out;
  }).join('');

  els.chartPie.className = 'chart-box';
  els.chartPie.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 520 320">
      <rect width="100%" height="100%" fill="transparent"></rect>
      ${paths}
      <text x="170" y="150" text-anchor="middle" fill="#f6f8fb" font-size="28" font-weight="700">${trades.length}</text>
      <text x="170" y="176" text-anchor="middle" fill="#9ca7b8" font-size="13">Trades</text>
      ${slices.map((slice, idx) => `
        <circle cx="330" cy="120" r="7" fill="${slice.color}" transform="translate(0 ${idx * 30})"></circle>
        <text x="346" y="125" fill="#f6f8fb" font-size="14" transform="translate(0 ${idx * 30})">${slice.label}: ${(slice.value / total * 100).toFixed(2)}%</text>
      `).join('')}
    </svg>
  `;
}

function renderBarChart(container, points, kind) {
  const width = 620, height = 300;
  const margin = { top: 18, right: 18, bottom: 36, left: 58 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const values = points.map(p => p.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = (maxVal - minVal) || 1;
  const yScale = v => margin.top + (maxVal - v) / range * plotH;
  const zeroY = yScale(0);
  const barW = plotW / points.length * 0.72;
  const gap = plotW / points.length;
  const bars = points.map((p, idx) => {
    const x = margin.left + idx * gap + (gap - barW) / 2;
    const y = Math.min(zeroY, yScale(p.value));
    const h = Math.max(Math.abs(yScale(p.value) - zeroY), 1.5);
    const color = p.value > 0 ? COLORS.green : p.value < 0 ? COLORS.red : COLORS.yellow;
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${color}" rx="4"></rect>`;
  }).join('');
  const labels = points.map((p, idx) => {
    const x = margin.left + idx * gap + gap / 2;
    return `<text x="${x.toFixed(2)}" y="${height - 12}" text-anchor="middle" class="axis-text">${escapeHtml(p.label)}</text>`;
  }).join('');
  const grid = [-1, -0.5, 0, 0.5, 1].map(tick => {
    const value = minVal + (maxVal - minVal) * ((tick + 1) / 2);
    const y = yScale(value);
    return `
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="candle-grid"></line>
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="axis-text">${shortMoney(value)}</text>
    `;
  }).join('');
  const finalVal = points[points.length - 1]?.value ?? 0;
  container.className = 'chart-box';
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
      ${grid}
      <line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" stroke="#9ca7b8" stroke-width="1"></line>
      ${bars}
      ${labels}
      <text x="${width - margin.right}" y="${margin.top + 4}" text-anchor="end" fill="#f6f8fb" font-size="13">Final: ${fmtMoney(finalVal)}</text>
    </svg>
  `;
}

function renderTradeTable(trades) {
  if (!trades.length) {
    els.tradeTableWrap.className = 'table-wrap empty-state';
    els.tradeTableWrap.textContent = '当前日期没有可闭合交易';
    return;
  }
  els.tradeTableWrap.className = 'table-wrap';
  els.tradeTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Entry</th><th>Exit</th><th>Dir</th><th>Qty</th><th>Entry Px</th><th>Exit Px</th>
          <th>Gross</th><th>Auto Fee</th><th>Fee</th><th>Net</th><th>Cum Net</th>
        </tr>
      </thead>
      <tbody>
        ${trades.map(t => `
          <tr>
            <td>${t.tradeNo}</td>
            <td>${fmtDateTimeWithOffset(t.entryTime.getTime(), parseOffsetMinutes(state.displayTimezone))}</td>
            <td>${fmtDateTimeWithOffset(t.exitTime.getTime(), parseOffsetMinutes(state.displayTimezone))}</td>
            <td>${t.direction}</td>
            <td>${t.qty}</td>
            <td>${t.entryPrice.toFixed(2)}</td>
            <td>${t.exitPrice.toFixed(2)}</td>
            <td class="${t.grossPnl >= 0 ? 'value-green' : 'value-red'}">${fmtMoney(t.grossPnl)}</td>
            <td>${fmtMoney(t.autoFee)}</td>
            <td><input type="number" step="0.01" data-fee-key="${escapeHtml(t.tradeKey)}" value="${t.fee.toFixed(2)}"></td>
            <td class="${t.netPnl >= 0 ? 'value-green' : 'value-red'}">${fmtMoney(t.netPnl)}</td>
            <td class="${t.cumNet >= 0 ? 'value-green' : 'value-red'}">${fmtMoney(t.cumNet)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  els.tradeTableWrap.querySelectorAll('input[data-fee-key]').forEach(input => {
    input.addEventListener('change', () => {
      const feeMap = readJson('tda_pro_fees', {});
      const key = input.dataset.feeKey;
      const val = Number(input.value);
      if (Number.isFinite(val) && val >= 0) feeMap[key] = round2(val);
      else delete feeMap[key];
      writeJson('tda_pro_fees', feeMap);
      renderCurrentDay();
    });
  });
}

function renderKlineOverlay() {
  const dayBars = state.candles.filter(bar => bar.date === state.selectedDate).sort((a, b) => a.epoch - b.epoch);
  if (!dayBars.length) {
    els.klineChartWrap.className = 'kline-wrap empty-state';
    els.klineChartWrap.textContent = '当前日期没有 K 线数据';
    els.klineMeta.textContent = `K 线时区 ${state.candlesTimezone} · 当前日期无数据`;
    return;
  }
  els.klineChartWrap.className = 'kline-wrap';
  els.klineMeta.textContent = `${dayBars.length} 根K线 · 数据时区 ${state.candlesTimezone} · 显示时区 ${state.displayTimezone}`;

  const width = 1600;
  const height = 740;
  const margin = { top: 24, right: 380, bottom: 48, left: 72 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const minEpoch = dayBars[0].epoch;
  const maxEpoch = dayBars[dayBars.length - 1].epoch;
  const epochRange = Math.max(maxEpoch - minEpoch, 1);
  const pad = (Math.max(...dayBars.map(b => b.high)) - Math.min(...dayBars.map(b => b.low))) * 0.06 || 1;
  const minPrice = Math.min(...dayBars.map(b => b.low)) - pad;
  const maxPrice = Math.max(...dayBars.map(b => b.high)) + pad;
  const priceRange = Math.max(maxPrice - minPrice, 1);

  const xScale = epoch => margin.left + ((epoch - minEpoch) / epochRange) * plotW;
  const yScale = price => margin.top + ((maxPrice - price) / priceRange) * plotH;
  const candleWidth = Math.max(plotW / dayBars.length * 0.72, 2);

  const hGrid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const price = maxPrice - priceRange * ratio;
    const y = yScale(price);
    return `
      <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" class="candle-grid"></line>
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="axis-text">${price.toFixed(2)}</text>
    `;
  }).join('');

  const candlesSvg = dayBars.map(bar => {
    const x = xScale(bar.epoch);
    const openY = yScale(bar.open);
    const closeY = yScale(bar.close);
    const highY = yScale(bar.high);
    const lowY = yScale(bar.low);
    const color = bar.close >= bar.open ? COLORS.green : COLORS.red;
    const rectY = Math.min(openY, closeY);
    const rectH = Math.max(Math.abs(closeY - openY), 1.5);
    return `
      <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1"></line>
      <rect x="${x - candleWidth / 2}" y="${rectY}" width="${candleWidth}" height="${rectH}" fill="${color}" opacity="0.85"></rect>
    `;
  }).join('');

  const hourMarks = [];
  const displayOffset = parseOffsetMinutes(state.displayTimezone);
  for (let i = 0; i < dayBars.length; i++) {
    const bar = dayBars[i];
    const label = fmtTimeWithOffset(bar.epoch, displayOffset);
    if (i === 0 || label.endsWith(':00')) {
      const x = xScale(bar.epoch);
      hourMarks.push(`
        <line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" class="candle-grid"></line>
        <text x="${x}" y="${height - 14}" text-anchor="middle" class="axis-text">${label}</text>
      `);
    }
  }

  const labelStore = readJson('tda_pro_label_positions', {});
  const lineAndMarkers = [];
  const labelGroups = [];
  const sortedByAnchor = [...state.currentTrades].sort((a, b) => midPrice(b) - midPrice(a));
  const gutterTop = margin.top + 18;
  const gutterBottom = margin.top + plotH - 18;
  const step = sortedByAnchor.length > 1 ? (gutterBottom - gutterTop) / (sortedByAnchor.length - 1) : 0;

  sortedByAnchor.forEach((trade, idx) => {
    const entryX = xScale(trade.entryTime.getTime());
    const exitX = xScale(trade.exitTime.getTime());
    const entryY = yScale(trade.entryPrice);
    const exitY = yScale(trade.exitPrice);
    const anchorX = entryX + (exitX - entryX) * 0.5;
    const anchorY = entryY + (exitY - entryY) * 0.5;
    const lineColor = trade.netPnl >= 0 ? COLORS.darkGreen : COLORS.darkRed;

    lineAndMarkers.push(`<line class="price-line" x1="${entryX}" y1="${entryY}" x2="${exitX}" y2="${exitY}" stroke="${lineColor}"></line>`);
    lineAndMarkers.push(svgTriangle(entryX, entryY, 7, trade.direction === 'Long' ? 'up' : 'down', trade.direction === 'Long' ? 'marker-long' : 'marker-short'));
    lineAndMarkers.push(svgCircle(exitX, exitY, 5.2, 'marker-exit'));

    const labelKey = trade.tradeKey;
    const lines = [
      `#${trade.tradeNo}  ${trade.qty}x  ${signed(trade.points, 'pt')}`,
      `Gross ${signedMoney(trade.grossPnl)} · Fee ${fmtMoney(trade.fee)}`,
      `Net ${signedMoney(trade.netPnl)}`,
    ];
    const dims = estimateLabelBox(lines);
    const stored = labelStore[labelKey];
    const defaultX = margin.left + plotW + 20;
    const defaultY = gutterTop + idx * step - dims.height / 2;
    const labelX = stored?.x ?? defaultX;
    const labelY = stored?.y ?? defaultY;
    const lineEnd = leaderTarget(anchorX, anchorY, labelX, labelY, dims.width, dims.height);

    lineAndMarkers.push(`<line id="leader-${escapeAttr(labelKey)}" class="leader-line" x1="${anchorX}" y1="${anchorY}" x2="${lineEnd.x}" y2="${lineEnd.y}" stroke="${lineColor}"></line>`);
    labelGroups.push(`
      <g class="label-group" data-key="${escapeAttr(labelKey)}" data-anchor-x="${anchorX}" data-anchor-y="${anchorY}" data-box-w="${dims.width}" data-box-h="${dims.height}" data-line-color="${lineColor}" transform="translate(${labelX} ${labelY})">
        <rect class="label-box" width="${dims.width}" height="${dims.height}" rx="8" stroke="${lineColor}"></rect>
        <text class="label-text" x="8" y="16" fill="${lineColor}">
          ${lines.map((line, i) => `<tspan x="8" dy="${i === 0 ? 0 : 14}">${escapeHtml(line)}</tspan>`).join('')}
        </text>
      </g>
    `);
  });

  els.klineChartWrap.innerHTML = `
    <svg id="klineSvg" class="kline-svg" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#11151b"></rect>
      <rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="#0f1319" stroke="#303848"></rect>
      ${hGrid}
      ${hourMarks.join('')}
      ${candlesSvg}
      ${lineAndMarkers.join('')}
      ${labelGroups.join('')}
    </svg>
  `;
  attachLabelDragHandlers();
}

function attachLabelDragHandlers() {
  const svg = document.getElementById('klineSvg');
  if (!svg) return;

  const svgPoint = () => svg.createSVGPoint();
  const toSvgCoords = (clientX, clientY) => {
    const pt = svgPoint();
    pt.x = clientX; pt.y = clientY;
    const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const onPointerMove = (event) => {
    if (!state.dragState) return;
    const { x, y } = toSvgCoords(event.clientX, event.clientY);
    const nextX = x - state.dragState.offsetX;
    const nextY = y - state.dragState.offsetY;
    updateLabelPosition(state.dragState.group, nextX, nextY);
  };

  const onPointerUp = () => {
    if (!state.dragState) return;
    state.dragState.group.classList.remove('dragging');
    state.dragState = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  svg.querySelectorAll('.label-group').forEach(group => {
    group.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const { x, y } = toSvgCoords(event.clientX, event.clientY);
      const transform = parseTranslate(group.getAttribute('transform'));
      state.dragState = {
        group,
        offsetX: x - transform.x,
        offsetY: y - transform.y,
      };
      group.classList.add('dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  });
}

function updateLabelPosition(group, x, y) {
  const key = group.dataset.key;
  const boxW = Number(group.dataset.boxW);
  const boxH = Number(group.dataset.boxH);
  const anchorX = Number(group.dataset.anchorX);
  const anchorY = Number(group.dataset.anchorY);
  group.setAttribute('transform', `translate(${round2(x)} ${round2(y)})`);
  const target = leaderTarget(anchorX, anchorY, x, y, boxW, boxH);
  const leader = document.getElementById(`leader-${cssEscape(key)}`);
  if (leader) {
    leader.setAttribute('x2', String(round2(target.x)));
    leader.setAttribute('y2', String(round2(target.y)));
  }
  const map = readJson('tda_pro_label_positions', {});
  map[key] = { x: round2(x), y: round2(y) };
  writeJson('tda_pro_label_positions', map);
}

function leaderTarget(anchorX, anchorY, boxX, boxY, boxW, boxH) {
  const left = boxX;
  const right = boxX + boxW;
  const top = boxY;
  const bottom = boxY + boxH;
  const y = clamp(anchorY, top + 10, bottom - 10);
  const x = anchorX <= left ? left : right;
  return { x, y };
}

function estimateLabelBox(lines) {
  const maxLen = Math.max(...lines.map(line => line.length), 14);
  return {
    width: Math.max(132, maxLen * 6.35 + 16),
    height: 14 * lines.length + 12,
  };
}

function midPrice(trade) {
  return (trade.entryPrice + trade.exitPrice) / 2;
}

function downloadFeeTemplate() {
  if (!state.currentTrades.length) return;
  const rows = state.currentTrades.map(t => ({
    trade_key: t.tradeKey,
    date: t.date,
    mode: t.mode,
    trade_no: t.tradeNo,
    fee: t.fee,
  }));
  downloadText(toCsv(rows), `fee_template_${state.selectedDate}_${state.mode}.csv`);
}

function clearCurrentDayFees() {
  if (!state.currentTrades.length) return;
  const feeMap = readJson('tda_pro_fees', {});
  state.currentTrades.forEach(t => delete feeMap[t.tradeKey]);
  writeJson('tda_pro_fees', feeMap);
  renderCurrentDay();
  setStatus(`已清空 ${state.selectedDate} 的手动 fee 覆盖。`, 'good');
}

function resetCurrentDayLabels() {
  if (!state.currentTrades.length) return;
  const map = readJson('tda_pro_label_positions', {});
  state.currentTrades.forEach(t => delete map[t.tradeKey]);
  writeJson('tda_pro_label_positions', map);
  renderCurrentDay();
  setStatus(`已重置 ${state.selectedDate} 的标签位置。`, 'good');
}

function importFees(rows) {
  const feeMap = readJson('tda_pro_fees', {});
  const currentByTradeKey = new Map(state.currentTrades.map(t => [t.tradeKey, t]));
  const currentByTradeNo = new Map(state.currentTrades.map(t => [String(t.tradeNo), t]));
  const imported = [];
  for (const raw of rows) {
    const row = normalizeKeys(raw);
    const fee = parseNumber(pick(row, ['fee', 'fees', 'commission', 'trading fee', 'trading_fee']));
    if (!Number.isFinite(fee)) continue;
    const tradeKey = String(pick(row, ['trade_key']) || '').trim();
    const tradeNo = String(pick(row, ['trade_no', 'trade no']) || '').trim();
    let trade = null;
    if (tradeKey && currentByTradeKey.has(tradeKey)) trade = currentByTradeKey.get(tradeKey);
    else if (tradeNo && currentByTradeNo.has(tradeNo)) trade = currentByTradeNo.get(tradeNo);
    if (trade) {
      feeMap[trade.tradeKey] = round2(fee);
      imported.push(trade.tradeKey);
    }
  }
  writeJson('tda_pro_fees', feeMap);
  return imported;
}

function exportTradesCsv() {
  if (!state.currentTrades.length) return;
  const rows = state.currentTrades.map(t => ({
    trade_no: t.tradeNo,
    date: t.date,
    mode: t.mode,
    entry_time: fmtDateTimeWithOffset(t.entryTime.getTime(), parseOffsetMinutes(state.displayTimezone)),
    exit_time: fmtDateTimeWithOffset(t.exitTime.getTime(), parseOffsetMinutes(state.displayTimezone)),
    direction: t.direction,
    qty: t.qty,
    entry_price: t.entryPrice,
    exit_price: t.exitPrice,
    gross_pnl: t.grossPnl,
    auto_fee: t.autoFee,
    fee_source: t.feeSource,
    fee: t.fee,
    net_pnl: t.netPnl,
    cum_gross: t.cumGross,
    cum_net: t.cumNet,
    trade_key: t.tradeKey,
  }));
  downloadText(toCsv(rows), `trade_summary_${state.selectedDate}_${state.mode}.csv`);
}

function makeTradeKey(trade, date, mode) {
  return [
    date,
    mode,
    fmtDateTimeWithOffset(trade.entryTime.getTime(), parseOffsetMinutes(state.ordersTimezone)),
    fmtDateTimeWithOffset(trade.exitTime.getTime(), parseOffsetMinutes(state.ordersTimezone)),
    trade.direction,
    trade.qty,
    trade.grossPnl.toFixed(2),
  ].join('|');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(v => String(v).trim() !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = cols[idx] ?? ''; });
    return obj;
  });
}

function parseTimestampWithOffset(value, timezoneString) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const raw = String(value).trim();
  if (!raw) return NaN;
  if (/^\d{10,13}$/.test(raw)) {
    const num = Number(raw);
    return raw.length === 13 ? num : num * 1000;
  }
  const hasExplicitZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  if (hasExplicitZone) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const cleaned = raw.replace(/\s+[A-Z]{2,5}$/i, '').replace('T', ' ');
  const match = cleaned.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return NaN;
  const [, y, mo, d, hh, mm, ss = '00'] = match;
  const offsetMinutes = parseOffsetMinutes(timezoneString);
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)) - offsetMinutes * 60000;
}

function parseOffsetMinutes(value) {
  const match = String(value).match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function formatDateInOffset(epoch, offsetMinutes) {
  const d = new Date(epoch + offsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function fmtTimeWithOffset(epoch, offsetMinutes) {
  const d = new Date(epoch + offsetMinutes * 60000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function fmtDateTimeWithOffset(epoch, offsetMinutes) {
  const d = new Date(epoch + offsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function fmtMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function shortMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  return `${value < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

function signedMoney(value) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function signed(value, suffix = '') {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/[@,$\s]/g, '').replace(/,/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeKeys(obj) {
  const out = {};
  Object.keys(obj).forEach(key => {
    const trimmed = String(key).trim();
    out[trimmed] = obj[key];
    out[trimmed.toLowerCase()] = obj[key];
  });
  return out;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return null;
}

function weightedPrice(items) {
  const qty = sum(items.map(x => x.qty));
  return qty ? sum(items.map(x => x.qty * x.price)) / qty : 0;
}

function donutPath(cx, cy, rOuter, rInner, start, end) {
  const x1 = cx + Math.cos(start) * rOuter;
  const y1 = cy + Math.sin(start) * rOuter;
  const x2 = cx + Math.cos(end) * rOuter;
  const y2 = cy + Math.sin(end) * rOuter;
  const x3 = cx + Math.cos(end) * rInner;
  const y3 = cy + Math.sin(end) * rInner;
  const x4 = cx + Math.cos(start) * rInner;
  const y4 = cy + Math.sin(start) * rInner;
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function svgTriangle(x, y, size, dir, cls) {
  let pts;
  if (dir === 'up') pts = `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
  else pts = `${x},${y + size} ${x - size},${y - size} ${x + size},${y - size}`;
  return `<polygon class="${cls}" points="${pts}"></polygon>`;
}

function svgCircle(x, y, r, cls) {
  return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"></circle>`;
}

function parseTranslate(value) {
  const match = String(value || '').match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

function sum(arr) { return arr.reduce((a, b) => a + Number(b || 0), 0); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(',')].concat(rows.map(row => headers.map(h => csvEscape(row[h])).join(','))).join('\n');
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return String(str).replace(/[^a-zA-Z0-9_.:-]/g, '_');
}

function cssEscape(str) {
  return escapeAttr(str);
}
