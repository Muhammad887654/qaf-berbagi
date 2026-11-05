const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase env belum lengkap. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.');
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di file .env.'
    });
  }
  return next();
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 2e6 },
  fileFilter: (req, file, callback) => {
    callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  }
});

async function getCampaignStatsMap() {
  const { data: donations, error } = await supabase
    .from('donations')
    .select('campaign_id, amount')
    .eq('status', 'verified');

  if (error) throw error;

  const map = new Map();
  for (const donation of donations || []) {
    const campaignId = Number(donation.campaign_id);
    const current = map.get(campaignId) || { collected: 0, donors: 0 };
    current.collected += Number(donation.amount || 0);
    current.donors += 1;
    map.set(campaignId, current);
  }

  return map;
}

async function getAllCampaigns() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('active', true)
    .order('id', { ascending: false });

  if (error) throw error;

  const stats = await getCampaignStatsMap();

  return (campaigns || []).map((campaign) => {
    const current = stats.get(Number(campaign.id)) || { collected: 0, donors: 0 };
    return {
      ...campaign,
      collected: current.collected,
      donors: current.donors
    };
  });
}

function requireAdminKey(req, res, next) {
  const adminKey = req.get('x-admin-key') || req.query.key;
  if (process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY) {
    return next();
  }
  return res.sendStatus(401);
}

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/api/config', (req, res) => {
  res.json({ bank: process.env.BANK_INFO || '' });
});

app.get('/api/campaigns', requireSupabase, async (req, res) => {
  try {
    const campaigns = await getAllCampaigns();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/campaigns/:slug', requireSupabase, async (req, res) => {
  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (campaignError || !campaign) return res.sendStatus(404);

    const { data: verifiedDonations, error: donationsError } = await supabase
      .from('donations')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'verified')
      .order('created_at', { ascending: false })
      .limit(10);

    if (donationsError) throw donationsError;

    const { data: detailDonations, error: detailError } = await supabase
      .from('donations')
      .select('amount')
      .eq('campaign_id', campaign.id)
      .eq('status', 'verified');

    if (detailError) throw detailError;

    const collected = (detailDonations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const donors = (detailDonations || []).length;

    return res.json({
      ...campaign,
      collected,
      donors,
      recent: verifiedDonations || []
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:slug/donations', requireSupabase, upload.single('proof'), async (req, res) => {
  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (campaignError || !campaign) return res.sendStatus(404);

    const amount = parseInt(req.body.amount, 10);
    const name = (req.body.name || '').trim().slice(0, 80);

    if (!(amount >= 10000) || !name || !req.file) {
      return res.status(400).json({
        error: 'Nama, nominal minimal Rp10.000, dan bukti transfer (JPG/PNG/WebP, maks 2 MB) wajib diisi.'
      });
    }

    const { error: insertError } = await supabase.from('donations').insert([
      {
        campaign_id: campaign.id,
        name,
        anonymous: Boolean(req.body.anonymous),
        amount,
        message: (req.body.message || '').slice(0, 300),
        proof: req.file.filename,
        status: 'pending'
      }
    ]);

    if (insertError) throw insertError;

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/donations', requireAdminKey, requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('donations')
      .select('*, campaigns(title)')
      .order('id', { ascending: false });

    if (error) throw error;

    const normalized = (data || []).map((donation) => ({
      ...donation,
      title: donation.campaigns?.title || donation.title || ''
    }));

    return res.json(normalized);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/donations/:id', requireAdminKey, requireSupabase, async (req, res) => {
  try {
    if (!['verified', 'rejected'].includes(req.body.status)) {
      return res.sendStatus(400);
    }

    const { error } = await supabase
      .from('donations')
      .update({ status: req.body.status })
      .eq('id', req.params.id);

    if (error) throw error;
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/campaigns', requireAdminKey, requireSupabase, async (req, res) => {
  try {
    const payload = {
      slug: req.body.slug,
      title: req.body.title,
      category: req.body.category,
      summary: req.body.summary,
      description: req.body.description,
      target: parseInt(req.body.target, 10),
      deadline: req.body.deadline || null,
      active: true
    };

    const { error } = await supabase.from('campaigns').insert([payload]);
    if (error) throw error;

    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: 'Gagal menyimpan (slug mungkin sudah ada).' });
  }
});

app.get('/api/admin/proof/:file', requireAdminKey, (req, res) => {
  const safeFilename = path.basename(req.params.file);
  return res.sendFile(path.join(UPLOAD_DIR, safeFilename));
});

app.listen(PORT, () => {
  console.log(`QAF Berbagi jalan di http://localhost:${PORT}`);
});
