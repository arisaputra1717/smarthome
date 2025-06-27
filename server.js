kode server js yang lama
//server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const mqtt = require('mqtt');
const path = require('path');
const app = express();
const port = 3000;

// Middleware untuk parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Koneksi ke MQTT broker (sesuaikan dengan broker Anda)
const mqttClient = mqtt.connect('mqtt://broker.emqx.io:1883'); // Ganti dengan alamat broker MQTT Anda

mqttClient.on('connect', () => {
  console.log('Terhubung ke MQTT broker');
});

mqttClient.on('error', (err) => {
  console.error('Error MQTT:', err);
});

// Koneksi ke database SQLite3
const db = new sqlite3.Database('./tasmarthome.db', (err) => {
  if (err) {
    console.error('Error membuka database:', err.message);
  } else {
    console.log('Database tasmarthome.db terhubung');
    // Buat tabel jika belum ada
    createTableIfNotExists();
    // Tambahkan kolom relay ke tabel konsumsi_energi
    addRelayColumns();
  }
});

// Fungsi untuk membuat tabel jika belum ada
function createTableIfNotExists() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS konsumsi_energi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      waktu TEXT NOT NULL,
      tegangan REAL,
      arus REAL,
      daya REAL,
      kwh REAL,
      mac_address TEXT NOT NULL
    )
  `;
  
  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('Error membuat tabel:', err.message);
    } else {
      console.log('Tabel konsumsi_energi siap');
    }
  });
}

// Fungsi untuk menambahkan kolom relay ke tabel konsumsi_energi
function addRelayColumns() {
  // Cek apakah kolom sudah ada terlebih dahulu
  db.all("PRAGMA table_info(konsumsi_energi)", (err, rows) => {
    if (err) {
      console.error('Error mengecek struktur tabel:', err.message);
      return;
    }

    const columns = rows.map(row => row.name);
    
    // Tambahkan kolom relay_status jika belum ada
    if (!columns.includes('relay_status')) {
      db.run("ALTER TABLE konsumsi_energi ADD COLUMN relay_status TEXT", (err) => {
        if (err) {
          console.error('Error menambah kolom relay_status:', err.message);
        } else {
          console.log('Kolom relay_status berhasil ditambahkan');
        }
      });
    }
    
    // Tambahkan kolom mqtt_topic jika belum ada
    if (!columns.includes('mqtt_topic')) {
      db.run("ALTER TABLE konsumsi_energi ADD COLUMN mqtt_topic TEXT", (err) => {
        if (err) {
          console.error('Error menambah kolom mqtt_topic:', err.message);
        } else {
          console.log('Kolom mqtt_topic berhasil ditambahkan');
        }
      });
    }
  });
}

// Fungsi helper untuk format tanggal
function formatDateForQuery(dateString) {
  // Validasi format tanggal
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return null;
  }
  return dateString;
}

// Endpoint ambil data berdasarkan mac_address dan filter tanggal
app.get('/api/data', (req, res) => {
  const mac = req.query.mac;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let sql = 'SELECT * FROM konsumsi_energi';
  const params = [];
  const conditions = [];

  if (mac) {
    conditions.push('mac_address = ?');
    params.push(mac);
  }

  if (startDate && endDate) {
    const formattedStartDate = formatDateForQuery(startDate);
    const formattedEndDate = formatDateForQuery(endDate);
    
    if (formattedStartDate && formattedEndDate) {
      conditions.push('tanggal BETWEEN ? AND ?');
      params.push(formattedStartDate, formattedEndDate);
    }
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  // Jika ada filter tanggal, ambil semua data dalam range tersebut
  // Jika tidak ada filter, batasi ke 20 record terakhir
  if (startDate && endDate) {
    sql += ' ORDER BY tanggal DESC, waktu DESC';
  } else {
    sql += ' ORDER BY id DESC LIMIT 20';
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error mengambil data:', err.message);
      res.status(500).json({ error: 'Error mengambil data', details: err.message });
    } else {
      res.json(rows || []);
    }
  });
});

// Endpoint untuk export CSV
// Endpoint untuk export CSV - Perbaikan di server.js
app.get('/api/export-csv', (req, res) => {
  const mac = req.query.mac;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (!mac) {
    return res.status(400).json({ error: 'MAC address harus diisi' });
  }

  let sql = 'SELECT * FROM konsumsi_energi';
  const params = [];
  const conditions = ['mac_address = ?'];
  params.push(mac);

  if (startDate && endDate) {
    const formattedStartDate = formatDateForQuery(startDate);
    const formattedEndDate = formatDateForQuery(endDate);
    
    if (formattedStartDate && formattedEndDate) {
      conditions.push('tanggal BETWEEN ? AND ?');
      params.push(formattedStartDate, formattedEndDate);
    }
  }

  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY tanggal ASC, waktu ASC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error mengambil data untuk export:', err.message);
      return res.status(500).json({ error: 'Error mengambil data untuk export' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tidak ada data untuk diekspor' });
    }

    try {
      // Buat CSV content
      const headers = [
        'ID',
        'Tanggal',
        'Waktu',
        'Tegangan (V)',
        'Arus (A)',
        'Daya (W)',
        'KWh',
        'MAC Address',
        'Status Relay',
        'MQTT Topic'
      ];

      let csvContent = headers.join(',') + '\n';

      rows.forEach(row => {
        const csvRow = [
          row.id || '',
          row.tanggal || '',
          row.waktu || '',
          row.tegangan || '',
          row.arus || '',
          row.daya || '',
          row.kwh || '',
          row.mac_address || '',
          row.relay_status || '',
          row.mqtt_topic || ''
        ];
        
        // Escape commas dan quotes dalam data
        const escapedRow = csvRow.map(field => {
          const stringField = String(field);
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return '"' + stringField.replace(/"/g, '""') + '"';
          }
          return stringField;
        });
        
        csvContent += escapedRow.join(',') + '\n';
      });

      // Set headers untuk download file
      const cleanMac = mac.replace(/:/g, '').replace(/[^a-zA-Z0-9]/g, '');
      const filename = `energy_data_${cleanMac}_${new Date().toISOString().split('T')[0]}.csv`;
      
      // PERBAIKAN: Set headers yang benar untuk download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');
      
      // Tambahkan BOM untuk Excel compatibility
      const csvWithBOM = '\ufeff' + csvContent;
      
      // Kirim response
      res.status(200).send(csvWithBOM);
      
    } catch (error) {
      console.error('Error membuat CSV:', error);
      res.status(500).json({ error: 'Error membuat file CSV' });
    }
  });
});

// Endpoint ambil list mac_address unik
app.get('/api/mac-list', (req, res) => {
  db.all('SELECT DISTINCT mac_address FROM konsumsi_energi WHERE mac_address IS NOT NULL ORDER BY mac_address', (err, rows) => {
    if (err) {
      console.error('Error mengambil daftar mac:', err.message);
      res.status(500).json({ error: 'Error mengambil daftar mac' });
    } else {
      res.json(rows || []);
    }
  });
});

// Endpoint untuk kontrol relay (hanya kirim MQTT, tidak insert database)
app.post('/api/relay-control', (req, res) => {
  const { mac_address, status } = req.body;
  
  if (!mac_address || !status) {
    return res.status(400).json({ error: 'MAC address dan status harus diisi' });
  }

  if (status !== 'ON' && status !== 'OFF') {
    return res.status(400).json({ error: 'Status harus ON atau OFF' });
  }

  try {
    // Format topik berdasarkan MAC address
    const cleanMac = mac_address.replace(/:/g, '').toUpperCase();
    const topic = `tasmota_${cleanMac}/cmnd/POWER`;
    
    // Hanya kirim perintah ke MQTT, tidak insert ke database
    mqttClient.publish(topic, status, (err) => {
      if (err) {
        console.error('Error publish MQTT:', err);
        return res.status(500).json({ error: 'Gagal mengirim perintah MQTT' });
      }

      res.json({ 
        success: true, 
        message: `Perintah relay ${status} berhasil dikirim`,
        topic: topic,
        mac_address: mac_address
      });
    });
  } catch (error) {
    console.error('Error dalam relay control:', error);
    res.status(500).json({ error: 'Error dalam kontrol relay' });
  }
});

// Endpoint untuk mengambil riwayat kontrol relay (dari data yang dikirim perangkat)
app.get('/api/relay-history', (req, res) => {
  const mac = req.query.mac;
  
  let sql = `SELECT id, mac_address, relay_status, tanggal, waktu, mqtt_topic 
             FROM konsumsi_energi 
             WHERE relay_status IS NOT NULL AND relay_status != ''`;
  const params = [];

  if (mac) {
    sql += ' AND mac_address = ?';
    params.push(mac);
  }

  sql += ' ORDER BY id DESC LIMIT 20';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error mengambil riwayat relay:', err.message);
      res.status(500).json({ error: 'Error mengambil riwayat relay' });
    } else {
      // Format timestamp untuk frontend
      const formattedRows = (rows || []).map(row => ({
        ...row,
        timestamp: `${row.tanggal} ${row.waktu}`
      }));
      res.json(formattedRows);
    }
  });
});

// Endpoint untuk mengambil status relay terakhir (dari data yang dikirim perangkat)
app.get('/api/relay-status', (req, res) => {
  const mac = req.query.mac;
  
  if (!mac) {
    return res.status(400).json({ error: 'MAC address harus diisi' });
  }

  // Ambil status relay dari data terakhir (baik dari record energi maupun relay)
  const sql = `SELECT relay_status FROM konsumsi_energi 
               WHERE mac_address = ? AND relay_status IS NOT NULL AND relay_status != ''
               ORDER BY id DESC LIMIT 1`;
  
  db.get(sql, [mac], (err, row) => {
    if (err) {
      console.error('Error mengambil status relay:', err.message);
      res.status(500).json({ error: 'Error mengambil status relay' });
    } else {
      res.json({ 
        mac_address: mac,
        status: row ? row.relay_status : 'UNKNOWN'
      });
    }
  });
});

// Endpoint untuk mendapatkan statistik data berdasarkan filter tanggal
app.get('/api/statistics', (req, res) => {
  const mac = req.query.mac;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  if (!mac) {
    return res.status(400).json({ error: 'MAC address harus diisi' });
  }

  let sql = `SELECT 
               COUNT(*) as total_records,
               AVG(tegangan) as avg_voltage,
               AVG(arus) as avg_current,
               AVG(daya) as avg_power,
               SUM(daya) as total_power,
               MAX(kwh) as max_kwh,
               MIN(kwh) as min_kwh
             FROM konsumsi_energi 
             WHERE mac_address = ?`;
  
  const params = [mac];

  if (startDate && endDate) {
    const formattedStartDate = formatDateForQuery(startDate);
    const formattedEndDate = formatDateForQuery(endDate);
    
    if (formattedStartDate && formattedEndDate) {
      sql += ' AND tanggal BETWEEN ? AND ?';
      params.push(formattedStartDate, formattedEndDate);
    }
  }

  db.get(sql, params, (err, row) => {
    if (err) {
      console.error('Error mengambil statistik:', err.message);
      res.status(500).json({ error: 'Error mengambil statistik' });
    } else {
      res.json({
        mac_address: mac,
        period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
        statistics: {
          total_records: row.total_records || 0,
          average_voltage: parseFloat((row.avg_voltage || 0).toFixed(2)),
          average_current: parseFloat((row.avg_current || 0).toFixed(2)),
          average_power: parseFloat((row.avg_power || 0).toFixed(2)),
          total_power: parseFloat((row.total_power || 0).toFixed(2)),
          energy_range: {
            min_kwh: parseFloat((row.min_kwh || 0).toFixed(4)),
            max_kwh: parseFloat((row.max_kwh || 0).toFixed(4)),
            consumption_kwh: parseFloat(((row.max_kwh || 0) - (row.min_kwh || 0)).toFixed(4))
          }
        }
      });
    }
  });
});

// Endpoint reset data
app.get('/api/reset-data', (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM konsumsi_energi", (err) => {
      if (err) {
        console.error('Error menghapus data:', err.message);
        return res.status(500).json({ error: 'Error saat menghapus data' });
      }
    });
    
    db.run("DELETE FROM sqlite_sequence WHERE name = 'konsumsi_energi'", (err) => {
      if (err) {
        console.error('Error reset autoincrement:', err.message);
        return res.status(500).json({ error: 'Error reset autoincrement' });
      }
      
      res.redirect('/');
    });
  });
});

// Endpoint reset data relay
app.get('/api/reset-relay-data', (req, res) => {
  const sql = `UPDATE konsumsi_energi SET relay_status = NULL, mqtt_topic = NULL`;

  db.run(sql, (err) => {
    if (err) {
      console.error('Error reset data relay:', err.message);
      return res.status(500).json({ error: 'Error saat reset data relay' });
    }
    res.json({ success: true, message: 'Data relay berhasil direset' });
  });
});

// Endpoint untuk mendapatkan data terbaru (untuk real-time monitoring)
app.get('/api/latest-data', (req, res) => {
  const mac = req.query.mac;
  
  if (!mac) {
    return res.status(400).json({ error: 'MAC address harus diisi' });
  }

  const sql = `SELECT * FROM konsumsi_energi 
               WHERE mac_address = ? 
               ORDER BY id DESC LIMIT 1`;

  db.get(sql, [mac], (err, row) => {
    if (err) {
      console.error('Error mengambil data terbaru:', err.message);
      res.status(500).json({ error: 'Error mengambil data terbaru' });
    } else {
      res.json(row || {});
    }
  });
});

// Serve static files di folder public
app.use(express.static(path.join(__dirname, 'public')));

// Default route untuk melayani index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Endpoints yang tersedia:');
  console.log('- GET /api/data - Ambil data konsumsi energi dengan filter');
  console.log('- GET /api/export-csv - Export data ke CSV');
  console.log('- GET /api/mac-list - Daftar MAC address');
  console.log('- GET /api/relay-status - Status relay perangkat');
  console.log('- GET /api/relay-history - Riwayat kontrol relay');
  console.log('- GET /api/statistics - Statistik konsumsi energi');
  console.log('- GET /api/latest-data - Data terbaru perangkat');
  console.log('- POST /api/relay-control - Kontrol relay via MQTT');
  console.log('- GET /api/reset-data - Reset semua data');
  console.log('- GET /api/reset-relay-data - Reset data relay');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Menutup koneksi...');
  mqttClient.end();
  db.close((err) => {
    if (err) {
      console.error('Error menutup database:', err.message);
    } else {
      console.log('Database ditutup.');
    }
  });
  process.exit();
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
