require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { pool, initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Photo storage: Cloudinary in prod, local disk in dev ───
let upload;
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET;

if (useCloudinary) {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder:           'goat-ledger',
      allowed_formats:  ['jpg','jpeg','png','webp'],
      transformation:   [{ width: 900, height: 700, crop: 'limit', quality: 'auto:good' }],
    },
  });
  upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });
  app.locals.cloudinary = cloudinary;
  console.log('📸 Using Cloudinary for photo storage');
} else {
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => cb(null, `goat_${Date.now()}${path.extname(file.originalname)}`),
  });
  upload = multer({
    storage: diskStorage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype)),
  });
  console.log('📁 Using local disk for photo storage');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB schema on startup
initDB().catch(err => console.error('DB init failed:', err));

// ── Helper: get photo URL from multer file ─────────────────
function photoUrl(file) {
  if (!file) return null;
  // Cloudinary gives file.path as the secure URL
  // Local disk gives filename → build URL path
  return useCloudinary ? file.path : `/uploads/${file.filename}`;
}
// Helper: get Cloudinary public_id from stored URL
function cloudPublicId(url) {
  if (!url || !useCloudinary) return null;
  // e.g. https://res.cloudinary.com/name/image/upload/v123/goat-ledger/abc.jpg
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
  return match ? match[1] : null;
}
async function deleteCloudPhoto(url) {
  if (!url || !useCloudinary) return;
  const pid = cloudPublicId(url);
  if (pid) await app.locals.cloudinary.uploader.destroy(pid).catch(() => {});
}

// ══════════════════════════════════════════════════════════
//  GOATS
// ══════════════════════════════════════════════════════════
app.get('/api/goats', async (req, res) => {
  const { status, search } = req.query;
  const conds = [], params = [];
  let p = 1;
  if (status) { conds.push(`status = $${p++}`); params.push(status); }
  if (search) {
    conds.push(`(goat_id ILIKE $${p} OR breed ILIKE $${p} OR notes ILIKE $${p} OR buyer_name ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  try {
    const { rows } = await pool.query(
      `SELECT * FROM goats${where} ORDER BY created_at DESC`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/goats/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM goats WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Goat not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goats', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error('⚠️  Photo upload failed (saving goat without photo):', err.message);
      req.file = null; // continue without photo
    }
    next();
  });
}, async (req, res) => {
  const b = req.body;
  console.log('📥 POST /api/goats body:', b);
  console.log('📸 file:', req.file ? req.file.originalname : 'none');
  if (!b.goat_id || !b.weight_kg || !b.cost_price)
    return res.status(400).json({ error: 'Goat ID, weight and cost price are required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO goats (goat_id, breed, weight_kg, photo, cost_price, extra_costs, notes, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.goat_id.trim(), b.breed||'', parseFloat(b.weight_kg),
       photoUrl(req.file), parseFloat(b.cost_price), parseFloat(b.extra_costs)||0,
       b.notes||'', b.added_by||'']
    );
    res.json({ success: true, id: rows[0].id });
  } catch (e) {
    console.error('❌ INSERT error:', e);
    if (e.code === '23505') return res.status(400).json({ error: 'Goat ID already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/goats/:id', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error('⚠️  Photo upload failed (saving goat without photo):', err.message);
      req.file = null;
    }
    next();
  });
}, async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await pool.query('SELECT photo FROM goats WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Goat not found' });

    let photo = rows[0].photo;
    if (req.file) {
      await deleteCloudPhoto(photo);
      photo = photoUrl(req.file);
    }

    await pool.query(
      `UPDATE goats SET goat_id=$1, breed=$2, weight_kg=$3, photo=$4,
         cost_price=$5, extra_costs=$6, notes=$7, added_by=$8, updated_at=NOW()
       WHERE id=$9`,
      [b.goat_id.trim(), b.breed||'', parseFloat(b.weight_kg), photo,
       parseFloat(b.cost_price), parseFloat(b.extra_costs)||0,
       b.notes||'', b.added_by||'', req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Goat ID already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Mark as sold
app.post('/api/goats/:id/sell', async (req, res) => {
  const { selling_price, buyer_name, buyer_phone, sale_date } = req.body;
  if (!selling_price || !sale_date)
    return res.status(400).json({ error: 'Selling price and sale date are required' });
  try {
    const { rows } = await pool.query('SELECT status FROM goats WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Goat not found' });
    if (rows[0].status === 'sold') return res.status(400).json({ error: 'Already sold' });

    await pool.query(
      `UPDATE goats SET status='sold', selling_price=$1, buyer_name=$2,
         buyer_phone=$3, sale_date=$4, updated_at=NOW() WHERE id=$5`,
      [parseFloat(selling_price), buyer_name||'', buyer_phone||'', sale_date, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Revert to available
app.post('/api/goats/:id/unsell', async (req, res) => {
  try {
    await pool.query(
      `UPDATE goats SET status='available', selling_price=NULL, buyer_name=NULL,
         buyer_phone=NULL, sale_date=NULL, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/goats/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT photo FROM goats WHERE id = $1', [req.params.id]);
    if (rows[0]) await deleteCloudPhoto(rows[0].photo);
    // Also delete local file if exists
    if (rows[0]?.photo && !useCloudinary) {
      const filePath = path.join(__dirname, 'public', rows[0].photo);
      fs.unlink(filePath, () => {});
    }
    await pool.query('DELETE FROM goats WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Next ID suggestion ─────────────────────────────────────
app.get('/api/next-id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) cnt FROM goats');
    let i = parseInt(rows[0].cnt) + 1;
    let candidate = `G-${String(i).padStart(3, '0')}`;
    for (let tries = 0; tries < 200; tries++) {
      const { rows: chk } = await pool.query('SELECT id FROM goats WHERE goat_id=$1', [candidate]);
      if (!chk[0]) break;
      i++;
      candidate = `G-${String(i).padStart(3, '0')}`;
    }
    res.json({ nextId: candidate });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    const [avail, sold, totals, monthly, byBreed, recentSales, weightDist] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int cnt, COALESCE(SUM(cost_price+extra_costs),0) inv
        FROM goats WHERE status='available'`),
      pool.query(`SELECT COUNT(*)::int cnt FROM goats WHERE status='sold'`),
      pool.query(`
        SELECT COALESCE(SUM(selling_price),0)                           revenue,
               COALESCE(SUM(cost_price+extra_costs),0)                  cost,
               COALESCE(SUM(selling_price-(cost_price+extra_costs)),0)  profit
        FROM goats WHERE status='sold'`),
      pool.query(`
        SELECT TO_CHAR(sale_date,'YYYY-MM') mon,
               COUNT(*)::int                cnt,
               SUM(selling_price)           revenue,
               SUM(cost_price+extra_costs)  cost,
               SUM(selling_price-(cost_price+extra_costs)) profit
        FROM goats WHERE status='sold'
        GROUP BY mon ORDER BY mon ASC LIMIT 12`),
      pool.query(`
        SELECT breed,
               COUNT(*)::int total,
               SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END)::int sold_count,
               COALESCE(SUM(CASE WHEN status='sold'
                 THEN selling_price-(cost_price+extra_costs) ELSE 0 END),0) profit
        FROM goats WHERE breed IS NOT NULL AND breed != ''
        GROUP BY breed ORDER BY total DESC`),
      pool.query(`
        SELECT goat_id, breed, weight_kg::float, cost_price::float, extra_costs::float,
               selling_price::float, buyer_name, sale_date, added_by,
               (selling_price-(cost_price+extra_costs))::float profit
        FROM goats WHERE status='sold'
        ORDER BY sale_date DESC NULLS LAST LIMIT 15`),
      pool.query(`
        SELECT CASE
          WHEN weight_kg < 10 THEN '< 10 kg'
          WHEN weight_kg < 20 THEN '10–20 kg'
          WHEN weight_kg < 30 THEN '20–30 kg'
          WHEN weight_kg < 40 THEN '30–40 kg'
          ELSE '40+ kg' END AS range,
          COUNT(*)::int cnt
        FROM goats GROUP BY range ORDER BY range`),
    ]);

    res.json({
      availableCount: avail.rows[0].cnt,
      stockValue:     parseFloat(avail.rows[0].inv),
      soldCount:      sold.rows[0].cnt,
      totalRevenue:   parseFloat(totals.rows[0].revenue),
      totalCost:      parseFloat(totals.rows[0].cost),
      totalProfit:    parseFloat(totals.rows[0].profit),
      monthly:        monthly.rows,
      byBreed:        byBreed.rows,
      recentSales:    recentSales.rows,
      weightDist:     weightDist.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Global error handler (catches multer errors too) ──────
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`\n🐐 Goat Ledger → http://localhost:${PORT}  |  📱 http://192.168.0.178:${PORT}\n`));
module.exports = app;   // needed for Vercel
