// mqttservice.js

const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();

// Koneksi MQTT ke broker 
const client = mqtt.connect('mqtt://broker.emqx.io'); // Ganti dengan IP broker yang sesuai

// Koneksi ke SQLite3
const db = new sqlite3.Database('./tasmarthome.db', (err) => {
  if (err) {
    console.error('Error membuka database:', err.message);
  } else {
    console.log('Database tasmarthome.db terhubung');
  }
});

// Fungsi untuk menyimpan data ke SQLite
function saveDataToDB(data) {
  const { 
    voltage, 
    current, 
    power, 
    energy, 
    mac_address, 
    relay_status, 
    mqtt_topic 
  } = data;
  
  const currentDate = new Date();
  const tanggal = currentDate.toISOString().split('T')[0]; // Tanggal (YYYY-MM-DD)
  const waktu = currentDate.toISOString().split('T')[1].split('.')[0]; // Waktu (HH:MM:SS)

  const query = `
    INSERT INTO konsumsi_energi (tanggal, waktu, tegangan, arus, daya, kwh, mac_address, relay_status, mqtt_topic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Menyimpan data ke database
  db.run(query, [tanggal, waktu, voltage, current, power, energy, mac_address, relay_status, mqtt_topic], function (err) {
    if (err) {
      console.error('Error menyimpan data ke database:', err.message);
    } else {
      console.log(`Data berhasil disimpan dengan ID: ${this.lastID} - MAC: ${mac_address}`);
      if (relay_status) {
        console.log(`  Status relay: ${relay_status}`);
      }
      if (voltage && current && power) {
        console.log(`  Data energi: ${voltage}V, ${current}A, ${power}W`);
      }
    }
  });
}

// Terhubung ke broker MQTT dan subscribe ke topik
client.on('connect', () => {
  console.log('Terhubung ke broker MQTT');
  
  // Subscribe hanya ke satu topik sensor
  client.subscribe('tes/topic/sensor', (err) => {
    if (err) {
      console.error('Gagal subscribe ke topik sensor', err);
    } else {
      console.log('Berhasil subscribe ke topik tes/topic/sensor');
    }
  });
});

// Menerima pesan dari broker MQTT
client.on('message', (topic, message) => {
  if (topic === 'tes/topic/sensor') {
    try {
      const data = JSON.parse(message.toString());
      console.log('Data diterima:', data);
      saveDataToDB(data); // Simpan data ke database
    } catch (error) {
      console.error('Error memproses pesan MQTT:', error);
      console.log('Pesan mentah:', message.toString());
    }
  }
});

client.on('error', (err) => {
  console.log('MQTT Error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Menutup koneksi MQTT dan database...');
  client.end();
  db.close();
  process.exit();
});