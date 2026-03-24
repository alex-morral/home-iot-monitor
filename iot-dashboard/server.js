const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const net = require('net');
const path = require('path');
const Aedes = require('aedes');
const Database = require('better-sqlite3');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// =============================================
// DATABASE
// =============================================
const db = new Database(path.join(__dirname, 'sensors.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    deviceId  TEXT NOT NULL,
    source    TEXT NOT NULL,
    temperature REAL,
    humidity    REAL,
    light       REAL,
    motion      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_timestamp ON readings (timestamp);
`);

const insertReading = db.prepare(`
  INSERT INTO readings (timestamp, deviceId, source, temperature, humidity, light, motion)
  VALUES (@timestamp, @deviceId, @source, @temperature, @humidity, @light, @motion)
`);

function saveReading(data) {
  insertReading.run({
    timestamp:   data.timestamp,
    deviceId:    data.deviceId,
    source:      data.source,
    temperature: data.sensors.temperature ?? null,
    humidity:    data.sensors.humidity    ?? null,
    light:       data.sensors.light       ?? null,
    motion:      data.sensors.motion      ?? null,
  });
}

console.log('[DB] SQLite database ready → sensors.db');

// =============================================
// TELEGRAM
// =============================================
const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let lastMotionAlert = 0; // evitar spam de alertas

function sendTelegramAlert(message) {
  const now = Date.now();
  if (now - lastMotionAlert < 30000) return; // máximo 1 alerta cada 30 segundos
  lastMotionAlert = now;
  bot.sendMessage(TELEGRAM_CHAT_ID, message).catch((err) => {
    console.error('[Telegram] Error:', err.message);
  });
}

console.log('[Telegram] Bot ready');

// =============================================
// 1. EXPRESS + HTTP + WEBSOCKET
// =============================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// =============================================
// 2. MQTT BROKER (Aedes embebido)
// =============================================
const aedes = Aedes();
const mqttServer = net.createServer(aedes.handle);
const MQTT_PORT = 1883;

mqttServer.listen(MQTT_PORT, () => {
  console.log(`MQTT Broker running on port ${MQTT_PORT}`);
});

// Log MQTT events
aedes.on('client', (client) => {
  console.log(`[MQTT] Client connected: ${client.id}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`[MQTT] Client disconnected: ${client.id}`);
});

// Subscribe to sensor data topic from ESP32
aedes.on('publish', (packet, client) => {
  // Ignore system topics (start with $)
  if (!client || packet.topic.startsWith('$')) return;

  if (packet.topic === 'iot/sensors') {
    try {
      const payload = JSON.parse(packet.payload.toString());
      const data = {
        timestamp: Date.now(),
        deviceId: payload.deviceId || client.id || 'ESP32-MQTT',
        source: 'mqtt',
        sensors: payload.sensors,
      };

      console.log(`[MQTT] Data from ${data.deviceId}:`, data.sensors);

      saveReading(data);
      broadcastToClients(data);

      // Alerta Telegram si detecta movimiento
      if (data.sensors.motion === 1) {
        const time = new Date().toLocaleTimeString('es-ES');
        sendTelegramAlert(
          `🚨 *Movimiento detectado*\n` +
          `📍 Dispositivo: ${data.deviceId}\n` +
          `🕐 Hora: ${time}\n` +
          `🌡️ Temperatura: ${data.sensors.temperature}°C\n` +
          `💧 Humedad: ${data.sensors.humidity}%\n` +
          `☀️ Luz: ${data.sensors.light}%`
        );
      }
    } catch (err) {
      console.error('[MQTT] Invalid JSON payload:', err.message);
    }
  }
});

// =============================================
// 3. SENSOR SIMULATOR
// =============================================
const sensorState = {
  temperature: 22,
  humidity: 55,
  light: 50,
  motion: 0,
};

function simulateSensors() {
  sensorState.temperature += (Math.random() - 0.48) * 0.5;
  sensorState.temperature = Math.max(15, Math.min(40, sensorState.temperature));

  sensorState.humidity += (Math.random() - 0.5) * 1.5;
  sensorState.humidity = Math.max(20, Math.min(90, sensorState.humidity));

  sensorState.light += (Math.random() - 0.5) * 5;
  sensorState.light = Math.max(0, Math.min(100, sensorState.light));

  sensorState.motion = Math.random() > 0.85 ? 1 : 0;

  return {
    timestamp: Date.now(),
    deviceId: 'ESP32-SIM-001',
    source: 'simulator',
    sensors: {
      temperature: Math.round(sensorState.temperature * 10) / 10,
      humidity: Math.round(sensorState.humidity * 10) / 10,
      light: Math.round(sensorState.light),
      motion: sensorState.motion,
    },
  };
}

// =============================================
// 4. BROADCAST HELPER
// =============================================
function broadcastToClients(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(json);
    }
  });
}

// =============================================
// 5. REST API (fallback for ESP32 via HTTP)
// =============================================
app.post('/api/sensor-data', (req, res) => {
  const data = {
    timestamp: Date.now(),
    deviceId: req.body.deviceId || 'ESP32-HTTP',
    source: 'http',
    sensors: req.body.sensors,
  };

  broadcastToClients(data);
  res.json({ status: 'ok' });
});

// API historial — últimas N lecturas
app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const rows = db.prepare(`
    SELECT * FROM readings ORDER BY timestamp DESC LIMIT ?
  `).all(limit);
  res.json(rows.reverse());
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    mqtt: { port: MQTT_PORT, status: 'running' },
    websocket: { clients: wss.clients.size },
    uptime: process.uptime(),
  });
});

// =============================================
// 6. WEBSOCKET CONNECTIONS
// =============================================
wss.on('connection', (ws) => {
  console.log(`[WS] Dashboard client connected (total: ${wss.clients.size})`);
  ws.send(JSON.stringify(simulateSensors()));

  ws.on('close', () => {
    console.log(`[WS] Dashboard client disconnected (total: ${wss.clients.size})`);
  });
});

// Simulador desactivado — usando datos reales de la ESP32
// setInterval(() => {
//   broadcastToClients(simulateSensors());
// }, 2000);

// =============================================
// 7. START SERVER
// =============================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  IoT Dashboard running:`);
  console.log(`  - Web:  http://localhost:${PORT}`);
  console.log(`  - MQTT: mqtt://localhost:${MQTT_PORT}`);
  console.log(`  - Topic: iot/sensors`);
  console.log(`========================================\n`);
});
