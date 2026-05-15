const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goats (
      id            SERIAL PRIMARY KEY,
      goat_id       TEXT UNIQUE NOT NULL,
      breed         TEXT        DEFAULT '',
      weight_kg     NUMERIC     NOT NULL,
      photo         TEXT,
      photo_id      TEXT,
      cost_price    NUMERIC     NOT NULL,
      extra_costs   NUMERIC     DEFAULT 0,
      selling_price NUMERIC,
      buyer_name    TEXT        DEFAULT '',
      buyer_phone   TEXT        DEFAULT '',
      status        TEXT        DEFAULT 'available',
      purchase_date DATE        NOT NULL DEFAULT CURRENT_DATE,
      sale_date     DATE,
      notes         TEXT        DEFAULT '',
      added_by      TEXT        DEFAULT '',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Database schema ready');
}

module.exports = { pool, initDB };
