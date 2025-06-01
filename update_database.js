// update_database.js
// Script untuk menambahkan kolom relay_status dan mqtt_topic ke tabel konsumsi_energi

const sqlite3 = require('sqlite3').verbose();

// Koneksi ke database
const db = new sqlite3.Database('./tasmarthome.db', (err) => {
  if (err) {
    console.error('Error membuka database:', err.message);
    process.exit(1);
  } else {
    console.log('Database tasmarthome.db terhubung');
  }
});

// Fungsi untuk menambahkan kolom relay
function addRelayColumns() {
  console.log('Menambahkan kolom relay_status dan mqtt_topic...');
  
  // Tambahkan kolom relay_status
  db.run("ALTER TABLE konsumsi_energi ADD COLUMN relay_status TEXT", (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error menambah kolom relay_status:', err.message);
    } else {
      console.log('✓ Kolom relay_status berhasil ditambahkan');
    }
    
    // Tambahkan kolom mqtt_topic
    db.run("ALTER TABLE konsumsi_energi ADD COLUMN mqtt_topic TEXT", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error menambah kolom mqtt_topic:', err.message);
      } else {
        console.log('✓ Kolom mqtt_topic berhasil ditambahkan');
        
        // Tampilkan struktur tabel yang sudah diupdate
        showTableStructure();
      }
    });
  });
}

// Fungsi untuk menampilkan struktur tabel
function showTableStructure() {
  console.log('\n=== Struktur Tabel konsumsi_energi ===');
  db.all("PRAGMA table_info(konsumsi_energi)", (err, rows) => {
    if (err) {
      console.error('Error mengambil info tabel:', err.message);
    } else {
      rows.forEach(row => {
        console.log(`${row.cid}: ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? 'DEFAULT ' + row.dflt_value : ''}`);
      });
      console.log('=====================================\n');
      
      // Test insert data
      testInsertData();
    }
  });
}

// Test insert data untuk memastikan kolom sudah berfungsi
function testInsertData() {
  console.log('Testing insert data dengan relay_status...');
  
  const currentDate = new Date();
  const tanggal = currentDate.toISOString().split('T')[0];
  const waktu = currentDate.toISOString().split('T')[1].split('.')[0];
  
  const testData = {
    tanggal: tanggal,
    waktu: waktu,
    tegangan: 220,
    arus: 1.5,
    daya: 330,
    kwh: 1.25,
    mac_address: 'TEST:MAC:ADDRESS',
    relay_status: 'ON',
    mqtt_topic: 'test/topic'
  };
  
  const query = `
    INSERT INTO konsumsi_energi (tanggal, waktu, tegangan, arus, daya, kwh, mac_address, relay_status, mqtt_topic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, Object.values(testData), function(err) {
    if (err) {
      console.error('❌ Error test insert:', err.message);
    } else {
      console.log('✓ Test insert berhasil dengan ID:', this.lastID);
      
      // Hapus data test
      db.run("DELETE FROM konsumsi_energi WHERE mac_address = 'TEST:MAC:ADDRESS'", (err) => {
        if (err) {
          console.error('Error menghapus data test:', err.message);
        } else {
          console.log('✓ Data test berhasil dihapus');
        }
        
        console.log('\n🎉 Database berhasil diupdate!');
        console.log('Sekarang Anda bisa menjalankan mqttservice.js');
        
        // Tutup koneksi database
        db.close();
      });
    }
  });
}

// Jalankan update
addRelayColumns();