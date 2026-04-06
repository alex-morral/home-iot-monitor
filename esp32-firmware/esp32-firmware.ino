#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// =============================================
// CONFIGURACIÓN — MODIFICA ESTOS VALORES
// =============================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER   = "YOUR_PC_IP";
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "iot/sensors";
const char* DEVICE_ID     = "ESP32-001";

// =============================================
// PINES
// =============================================
#define DHT_PIN   4
#define DHT_TYPE  DHT11
#define LDR_PIN   32
#define PIR_PIN   5

// =============================================
// OBJETOS
// =============================================
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqtt(espClient);

// =============================================
// SETUP
// =============================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=============================");
  Serial.println("  IoT Dashboard — ESP32");
  Serial.println("=============================\n");

  pinMode(PIR_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);
  dht.begin();

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setKeepAlive(60);
}

// =============================================
// LOOP
// =============================================
void loop() {
  if (!mqtt.connected()) reconnectMQTT();
  mqtt.loop();

  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();
  int   light       = round((4095 - analogRead(LDR_PIN)) / 4095.0 * 100); // 0-100%
  int   motion      = digitalRead(PIR_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[DHT11] Error de lectura");
    temperature = 0.0;
    humidity    = 0.0;
  }

  char payload[200];
  snprintf(payload, sizeof(payload),
    "{\"deviceId\":\"%s\",\"sensors\":{"
    "\"temperature\":%.1f,"
    "\"humidity\":%.1f,"
    "\"light\":%d,"
    "\"motion\":%d"
    "}}",
    DEVICE_ID,
    temperature, humidity,
    light, motion
  );

  mqtt.publish(MQTT_TOPIC, payload);
  Serial.println(payload);

  delay(2000);
}

// =============================================
// ADC — Promedio de 10 lecturas para estabilizar
// =============================================
int readADC(int pin) {
  int sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / 10;
}

// =============================================
// WiFi
// =============================================
void connectWiFi() {
  Serial.print("[WiFi] Conectando a: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Conectado!");
    Serial.print("[WiFi] IP de la ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] No se pudo conectar");
  }
}

// =============================================
// MQTT
// =============================================
void reconnectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Conectando...");
    if (mqtt.connect(DEVICE_ID)) {
      Serial.println(" OK!");
    } else {
      Serial.print(" Error rc=");
      Serial.print(mqtt.state());
      Serial.println(" — reintentando en 5s");
      delay(5000);
    }
  }
}
