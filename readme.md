# Ledger

Mobile-first livestock management app. Track stock, record sales, visualise profit/loss.

---

## Where is the data stored?

| Environment | Database | Photos |
|---|---|---|
| **Local dev** | PostgreSQL (Neon free tier) | `public/uploads/` folder |
| **Vercel (production)** | PostgreSQL (Neon free tier) | Cloudinary (free tier) |

**All data lives in your Neon PostgreSQL database** — not on the server disk.  
This means it persists across deployments, restarts, and multiple users.

---

## Local Development Setup

### 1. Create a free Neon database
1. Go to **https://neon.tech** → Sign up free
2. Create a new project (e.g. "-ledger")
3. Copy the **connection string** — looks like:
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`

### 2. Set environment variables
```bash
cp .env.example .env
# Edit .env and paste your DATABASE_URL
```

### 3. Run locally
```bash
npm install
npm start
# Open http://localhost:3000
```

---

## Deploy to Vercel

### Step 1 — Set up Cloudinary (for photo uploads)
1. Go to **https://cloudinary.com** → Sign up free (25GB free)
2. From your dashboard, copy:
   - Cloud Name
   - API Key
   - API Secret

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAMEledger.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to **https://vercel.com** → New Project → Import your GitHub repo
2. In **Environment Variables**, add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |

3. Click **Deploy** — done! ✅

---

## Add  Form Fields

When adding a  to stock:
- ** ID** — auto-suggested (G-001, G-002…)
- **Photo** — from camera or gallery
- **Breed** — Boer, Jamunapari, etc.
- **Weight (kg)**
- **Cost Price (₹)**
- **Extra Costs (₹)** — feed, transport, medicine
- **Added By** — who entered it
- **Notes** — color, health remarks

When recording a **sale**:
- **Selling Price (₹)**
- **Sale Date**
- **Buyer Name**
- **Buyer Phone**
