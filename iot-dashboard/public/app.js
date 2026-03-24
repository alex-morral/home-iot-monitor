const SENSORS = ['temperature', 'humidity', 'light', 'motion'];

const MAX_POINTS = 60;
const history = { labels: [] };
SENSORS.forEach((s) => { history[s] = []; });

const stats = {};
SENSORS.forEach((s) => { stats[s] = { min: Infinity, max: -Infinity }; });

const ALERT_THRESHOLDS = {
  temperature: { warning: 35, danger: 38, unit: '°C', label: 'Temperature', above: true },
  humidity:    { warning: 80, danger: 85, unit: '%',   label: 'Humidity',    above: true },
};

// --- Chart Defaults ---
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: {
    legend: { labels: { color: '#8899aa', font: { size: 11 } } },
  },
  scales: {
    x: {
      ticks: { color: '#8899aa', maxTicksLimit: 8, font: { size: 10 } },
      grid: { color: 'rgba(42,63,85,0.5)' },
    },
    y: {
      ticks: { color: '#8899aa', font: { size: 10 } },
      grid: { color: 'rgba(42,63,85,0.5)' },
    },
  },
};

// --- Chart 1: Temperature & Humidity ---
const chartTempHumidity = new Chart(document.getElementById('chart-temp-humidity'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Temperature (°C)',
        data: [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.1)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
      },
      {
        label: 'Humidity (%)',
        data: [],
        borderColor: '#00b4d8',
        backgroundColor: 'rgba(0,180,216,0.1)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
        yAxisID: 'y1',
      },
    ],
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y:  { ...chartDefaults.scales.y, position: 'left',  title: { display: true, text: '°C', color: '#8899aa' } },
      y1: { ...chartDefaults.scales.y, position: 'right', title: { display: true, text: '%',  color: '#8899aa' }, grid: { drawOnChartArea: false } },
    },
  },
});

// --- Chart 2: Light ---
const chartLight = new Chart(document.getElementById('chart-light'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Light (0-4095)',
        data: [],
        borderColor: '#2dd4a0',
        backgroundColor: 'rgba(45,212,160,0.1)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
      },
    ],
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: { ...chartDefaults.scales.y, min: 0, max: 100, title: { display: true, text: '%', color: '#8899aa' } },
    },
  },
});

// --- Chart 3: All Sensors Normalized ---
const normRanges = {
  temperature: [15, 40],
  humidity:    [20, 90],
  light:       [0, 100],
  motion:      [0, 1],
};
const normColors = ['#f59e0b', '#00b4d8', '#2dd4a0', '#06b6d4'];

function normalize(sensor, value) {
  const [min, max] = normRanges[sensor];
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

const chartAll = new Chart(document.getElementById('chart-all'), {
  type: 'line',
  data: {
    labels: [],
    datasets: SENSORS.map((key, i) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      data: [],
      borderColor: normColors[i],
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    })),
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: { ...chartDefaults.scales.y, min: 0, max: 100, title: { display: true, text: 'Normalized (0-100%)', color: '#8899aa' } },
    },
  },
});

// --- Update UI ---
function updateDashboard(data) {
  const { sensors, deviceId } = data;
  const time = new Date(data.timestamp).toLocaleTimeString();

  document.getElementById('device-id').textContent = deviceId;

  const source = data.source || 'simulator';
  const badge = document.getElementById('data-source');
  badge.textContent = source.toUpperCase();
  badge.className = 'source-badge' + (source !== 'simulator' ? ` ${source}` : '');

  Object.entries(sensors).forEach(([key, value]) => {
    const valEl = document.getElementById(`val-${key}`);
    if (valEl) {
      valEl.textContent = value;
      valEl.classList.add('pulse');
      setTimeout(() => valEl.classList.remove('pulse'), 300);
    }

    if (stats[key]) {
      if (value < stats[key].min) stats[key].min = value;
      if (value > stats[key].max) stats[key].max = value;
      const minEl = document.getElementById(`min-${key}`);
      const maxEl = document.getElementById(`max-${key}`);
      if (minEl) minEl.textContent = `Min: ${stats[key].min}`;
      if (maxEl) maxEl.textContent = `Max: ${stats[key].max}`;
    }
  });

  // Motion status
  if (sensors.motion !== undefined) {
    const motionStatus = document.getElementById('motion-status');
    if (sensors.motion === 1) {
      motionStatus.textContent = '🚶 Motion Detected!';
      motionStatus.className = 'motion-status danger';
    } else {
      motionStatus.textContent = '✅ Clear';
      motionStatus.className = 'motion-status safe';
    }
  }

  // History
  history.labels.push(time);
  SENSORS.forEach((key) => {
    history[key].push(sensors[key] !== undefined ? sensors[key] : 0);
  });
  if (history.labels.length > MAX_POINTS) {
    history.labels.shift();
    SENSORS.forEach((key) => history[key].shift());
  }

  // Update charts
  chartTempHumidity.data.labels = history.labels;
  chartTempHumidity.data.datasets[0].data = history.temperature;
  chartTempHumidity.data.datasets[1].data = history.humidity;
  chartTempHumidity.update('none');

  chartLight.data.labels = history.labels;
  chartLight.data.datasets[0].data = history.light;
  chartLight.update('none');

  chartAll.data.labels = history.labels;
  SENSORS.forEach((key, i) => {
    chartAll.data.datasets[i].data = history[key].map((v) => normalize(key, v));
  });
  chartAll.update('none');

  checkAlerts(sensors);
}

// --- Alerts ---
function checkAlerts(sensors) {
  Object.entries(ALERT_THRESHOLDS).forEach(([key, config]) => {
    const value = sensors[key];
    if (value === undefined) return;
    if (config.above) {
      if (value >= config.danger) addAlert(`${config.label}: ${value}${config.unit} — CRITICAL`, 'danger');
      else if (value >= config.warning) addAlert(`${config.label}: ${value}${config.unit} — Warning`, 'warning');
    }
  });

  if (sensors.motion === 1) addAlert('Motion detected!', 'warning');
}

function addAlert(message, type) {
  const list = document.getElementById('alerts-list');
  const noAlerts = list.querySelector('.no-alerts');
  if (noAlerts) noAlerts.remove();

  const item = document.createElement('div');
  item.className = `alert-item ${type}`;
  item.innerHTML = `
    <span class="alert-time">${new Date().toLocaleTimeString()}</span>
    <span>${message}</span>
  `;
  list.prepend(item);
  while (list.children.length > 20) list.lastChild.remove();
}

// --- WebSocket ---
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}`);

  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  ws.onopen = () => {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Live';
  };

  ws.onmessage = (event) => {
    updateDashboard(JSON.parse(event.data));
  };

  ws.onclose = () => {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disconnected — reconnecting...';
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

connect();
