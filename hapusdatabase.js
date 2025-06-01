const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('tasmarthome.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to database');
});

// Hapus data dulu
db.run('DELETE FROM konsumsi_energi', function(err) {
  if (err) return console.error(err.message);
  console.log(`Deleted ${this.changes} rows`);

  // Reset AUTOINCREMENT
  db.run("DELETE FROM sqlite_sequence WHERE name = 'konsumsi_energi'", function(err) {
    if (err) return console.error(err.message);
    console.log('Reset AUTOINCREMENT berhasil');

    // Tutup koneksi database
    db.close((err) => {
      if (err) return console.error(err.message);
      console.log('Closed database');
    });
  });
});