const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
  // Create base table
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

  // Add new columns if they don't exist (safe for existing deployments)
  const newCols = [
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS sale_weight_kg     NUMERIC`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS advance_amount     NUMERIC  DEFAULT 0`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS advance_mode       TEXT     DEFAULT ''`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS advance_date       DATE`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS final_payment_mode TEXT     DEFAULT ''`,
    // Delivery / holding tracking
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS delivery_status    TEXT`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS holding_start_date DATE`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS holding_rate       NUMERIC  DEFAULT 150`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS holding_charges    NUMERIC  DEFAULT 0`,
    `ALTER TABLE goats ADD COLUMN IF NOT EXISTS delivery_date      DATE`,
  ];
  for (const sql of newCols) await pool.query(sql);

  console.log('✅ Database schema ready');
}

module.exports = { pool, initDB };
