/**
 * MQTT Test Client
 * Simulates an ESP32 publishing sensor data via MQTT.
 * Run: node test-mqtt.js
 */
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'ESP32-TEST-001',
  protocolVersion: 4,
});

// Sensor state (simulates real sensor readings)
const state = {
  temperature: 24.5,
  humidity: 60,
  pressure: 1015,
  light: 350,
  co2: 450,
};

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  console.log('Publishing sensor data every 3 seconds...');
  console.log('Press Ctrl+C to stop\n');

  setInterval(() => {
    // Simulate small variations
    state.temperature += (Math.random() - 0.5) * 0.8;
    state.humidity += (Math.random() - 0.5) * 2;
    state.pressure += (Math.random() - 0.5) * 0.5;
    state.light += (Math.random() - 0.5) * 40;
    state.co2 += (Math.random() - 0.45) * 15;

    const payload = {
      deviceId: 'ESP32-TEST-001',
      sensors: {
        temperature: Math.round(state.temperature * 10) / 10,
        humidity: Math.round(state.humidity * 10) / 10,
        pressure: Math.round(state.pressure * 10) / 10,
        light: Math.round(Math.max(0, state.light)),
        co2: Math.round(Math.max(300, state.co2)),
      },
    };

    client.publish('iot/sensors', JSON.stringify(payload));
    console.log(`[MQTT] Published:`, payload.sensors);
  }, 3000);
});

client.on('error', (err) => {
  console.error('MQTT connection error:', err.message);
  console.error('Make sure the server is running: npm start');
  process.exit(1);
});
