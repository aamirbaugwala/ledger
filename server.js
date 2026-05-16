// Load .env only in local dev (Vercel injects env vars directly)
if (!process.env.VERCEL) require('dotenv').config();
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
  const uploadsDir = path.join('/tmp', 'uploads');
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
  if (status === 'available') {
    // 'available' query returns both available AND booked goats for the stock page
    conds.push(`status IN ('available','booked')`);
  } else if (status) {
    conds.push(`status = $${p++}`); params.push(status);
  }
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

// Mark as sold / booked (if advance < full price → booked)
app.post('/api/goats/:id/sell', async (req, res) => {
  const { selling_price, buyer_name, buyer_phone, sale_date,
          sale_weight_kg, advance_amount, advance_mode, final_payment_mode } = req.body;
  if (!selling_price || !sale_date)
    return res.status(400).json({ error: 'Selling price and sale date are required' });
  try {
    const { rows } = await pool.query('SELECT status FROM goats WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Goat not found' });
    if (rows[0].status === 'sold') return res.status(400).json({ error: 'Already sold' });

    const sp      = parseFloat(selling_price);
    const advance = parseFloat(advance_amount) || 0;
    // If advance paid but less than full price → 'booked', otherwise 'sold'
    const newStatus = (advance > 0 && advance < sp) ? 'booked' : 'sold';

    await pool.query(
      `UPDATE goats SET
         status=$1, selling_price=$2, buyer_name=$3, buyer_phone=$4,
         sale_date=$5, sale_weight_kg=$6,
         advance_amount=$7, advance_mode=$8, advance_date=$9,
         final_payment_mode=$10, updated_at=NOW()
       WHERE id=$11`,
      [newStatus, sp, buyer_name||'', buyer_phone||'', sale_date,
       parseFloat(sale_weight_kg)||null,
       advance, advance_mode||'', advance > 0 ? sale_date : null,
       final_payment_mode||'', req.params.id]
    );
    res.json({ success: true, status: newStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Finalize a booked goat (collect remaining payment)
app.post('/api/goats/:id/finalize', async (req, res) => {
  const { final_payment_mode } = req.body;
  try {
    const { rows } = await pool.query('SELECT status FROM goats WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Goat not found' });
    if (rows[0].status !== 'booked') return res.status(400).json({ error: 'Goat is not in booked state' });
    await pool.query(
      `UPDATE goats SET status='sold', final_payment_mode=$1, updated_at=NOW() WHERE id=$2`,
      [final_payment_mode||'', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Revert to available
app.post('/api/goats/:id/unsell', async (req, res) => {
  try {
    await pool.query(
      `UPDATE goats SET status='available', selling_price=NULL, buyer_name=NULL,
         buyer_phone=NULL, sale_date=NULL, sale_weight_kg=NULL,
         advance_amount=0, advance_mode='', advance_date=NULL,
         final_payment_mode='', updated_at=NOW() WHERE id=$1`,
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
    const [avail, booked, sold, totals, pendingQ, monthly, byBreed, recentActivity, weightDist, payModes, payBreakdown] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int cnt, COALESCE(SUM(cost_price+extra_costs),0) inv FROM goats WHERE status='available'`),
      pool.query(`
        SELECT COUNT(*)::int cnt,
               COALESCE(SUM(advance_amount),0)                              advance_collected,
               COALESCE(SUM(selling_price - advance_amount),0)             pending_amount
        FROM goats WHERE status='booked'`),
      pool.query(`SELECT COUNT(*)::int cnt FROM goats WHERE status='sold'`),
      pool.query(`
        SELECT COALESCE(SUM(selling_price),0)                          revenue,
               COALESCE(SUM(cost_price+extra_costs),0)                 cost,
               COALESCE(SUM(selling_price-(cost_price+extra_costs)),0) profit
        FROM goats WHERE status='sold'`),
      pool.query(`
        SELECT goat_id, buyer_name, buyer_phone,
               selling_price::float, advance_amount::float,
               (selling_price - advance_amount)::float remaining,
               sale_date
        FROM goats WHERE status='booked'
        ORDER BY sale_date DESC`),
      pool.query(`
        SELECT TO_CHAR(sale_date,'YYYY-MM') mon,
               COUNT(*)::int cnt,
               SUM(selling_price)           revenue,
               SUM(cost_price+extra_costs)  cost,
               SUM(selling_price-(cost_price+extra_costs)) profit
        FROM goats WHERE status='sold'
        GROUP BY mon ORDER BY mon ASC LIMIT 12`),
      pool.query(`
        SELECT breed,
               COUNT(*)::int total,
               SUM(CASE WHEN status='sold'   THEN 1 ELSE 0 END)::int sold_count,
               SUM(CASE WHEN status='booked' THEN 1 ELSE 0 END)::int booked_count,
               COALESCE(SUM(CASE WHEN status='sold'
                 THEN selling_price-(cost_price+extra_costs) ELSE 0 END),0) profit
        FROM goats WHERE breed IS NOT NULL AND breed != ''
        GROUP BY breed ORDER BY total DESC`),
      pool.query(`
        SELECT goat_id, breed, weight_kg::float, cost_price::float, extra_costs::float,
               selling_price::float, buyer_name, sale_date, added_by, status,
               advance_amount::float, final_payment_mode,
               (selling_price-(cost_price+extra_costs))::float profit
        FROM goats WHERE status IN ('sold','booked')
        ORDER BY updated_at DESC NULLS LAST LIMIT 20`),
      pool.query(`
        SELECT CASE
          WHEN weight_kg < 10 THEN '< 10 kg'
          WHEN weight_kg < 20 THEN '10–20 kg'
          WHEN weight_kg < 30 THEN '20–30 kg'
          WHEN weight_kg < 40 THEN '30–40 kg'
          ELSE '40+ kg' END AS range,
          COUNT(*)::int cnt
        FROM goats GROUP BY range ORDER BY range`),
      pool.query(`
        SELECT final_payment_mode mode, COUNT(*)::int cnt
        FROM goats WHERE status='sold' AND final_payment_mode IS NOT NULL AND final_payment_mode != ''
        GROUP BY final_payment_mode`),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN advance_mode='cash'   AND advance_amount > 0 THEN advance_amount ELSE 0 END),0)::float  adv_cash,
          COALESCE(SUM(CASE WHEN advance_mode='online' AND advance_amount > 0 THEN advance_amount ELSE 0 END),0)::float  adv_online,
          COALESCE(SUM(CASE WHEN status='sold' AND final_payment_mode='cash'
                            THEN selling_price - COALESCE(advance_amount,0) ELSE 0 END),0)::float                        fin_cash,
          COALESCE(SUM(CASE WHEN status='sold' AND final_payment_mode='online'
                            THEN selling_price - COALESCE(advance_amount,0) ELSE 0 END),0)::float                        fin_online,
          COALESCE(SUM(CASE WHEN status='sold' AND final_payment_mode='cash+online'
                            THEN selling_price - COALESCE(advance_amount,0) ELSE 0 END),0)::float                        fin_split,
          COALESCE(SUM(CASE WHEN status='booked' THEN selling_price - COALESCE(advance_amount,0) ELSE 0 END),0)::float   uncollected
        FROM goats`),
    ]);

    res.json({
      availableCount:    avail.rows[0].cnt,
      stockValue:        parseFloat(avail.rows[0].inv),
      bookedCount:       booked.rows[0].cnt,
      advanceCollected:  parseFloat(booked.rows[0].advance_collected),
      pendingAmount:     parseFloat(booked.rows[0].pending_amount),
      pendingGoats:      pendingQ.rows,
      soldCount:         sold.rows[0].cnt,
      totalRevenue:      parseFloat(totals.rows[0].revenue),
      totalCost:         parseFloat(totals.rows[0].cost),
      totalProfit:       parseFloat(totals.rows[0].profit),
      monthly:           monthly.rows,
      byBreed:           byBreed.rows,
      recentActivity:    recentActivity.rows,
      weightDist:        weightDist.rows,
      payModes:          payModes.rows,
      payBreakdown:      payBreakdown.rows[0],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Global error handler (catches multer errors too) ──────
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Only listen when running locally — Vercel handles this automatically
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => console.log(`\n🐐 Goat Ledger → http://localhost:${PORT}  |  📱 http://192.168.0.178:${PORT}\n`));
}
module.exports = app;   // needed for Vercel
