const QAF = (() => {
  const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const progress = (collected, target) => Math.min(100, Math.round((Number(collected || 0) / Number(target || 1)) * 100 || 0));

  const renderHomePage = async () => {
    const list = document.getElementById('list');
    if (!list) return;

    try {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Gagal memuat kampanye');
      const campaigns = await response.json();

      list.innerHTML = campaigns.map((campaign) => {
        const percent = progress(campaign.collected, campaign.target);
        return `
          <a class="card" href="campaign.html?s=${encodeURIComponent(campaign.slug)}">
            <span class="mu">${esc(campaign.category)}</span>
            <h3>${esc(campaign.title)}</h3>
            <p>${esc(campaign.summary)}</p>
            <div class="bar"><i style="width:${percent}%"></i></div>
            <span class="mu">${rp(campaign.collected)} dari ${rp(campaign.target)} · ${campaign.donors} donatur</span>
          </a>
        `;
      }).join('');
    } catch (error) {
      list.innerHTML = '<p class="mu">Tidak dapat memuat kampanye saat ini.</p>';
      console.error(error);
    }
  };

  const renderCampaignPage = async () => {
    const main = document.getElementById('m');
    const form = document.getElementById('f');
    const slug = new URLSearchParams(window.location.search).get('s');

    if (!main) return;

    if (!slug) {
      main.textContent = 'Kampanye tidak ditemukan.';
      return;
    }

    try {
      const [campaignResponse, configResponse] = await Promise.all([
        fetch(`/api/campaigns/${encodeURIComponent(slug)}`),
        fetch('/api/config')
      ]);

      if (!campaignResponse.ok) {
        main.textContent = 'Kampanye tidak ditemukan.';
        return;
      }

      const campaign = await campaignResponse.json();
      const config = await configResponse.json();
      const percent = progress(campaign.collected, campaign.target);

      document.title = `${campaign.title} – QAF Berbagi`;
      main.innerHTML = `
        <h1>${esc(campaign.title)}</h1>
        <p>${esc(campaign.description)}</p>
        <div class="bar"><i style="width:${percent}%"></i></div>
        <p class="mu">${rp(campaign.collected)} terkumpul dari ${rp(campaign.target)} · ${campaign.donors} donatur</p>
        <div class="card">
          <h2>Berdonasi</h2>
          <p class="mu">Transfer ke: ${esc(config.bank)}. Lalu isi formulir dan unggah bukti transfer.</p>
          <form id="f">
            <label>Nama<input name="name" required maxlength="80"></label>
            <label><input type="checkbox" name="anonymous"> Sembunyikan nama (Hamba Allah)</label>
            <label>Nominal (Rp)<input name="amount" type="number" min="10000" required></label>
            <label>Doa/pesan (opsional)<textarea name="message" maxlength="300"></textarea></label>
            <label>Bukti transfer<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></label>
            <button class="btn">Kirim donasi</button>
          </form>
          <p id="msg" role="status"></p>
        </div>
        <h2>Donatur terbaru</h2>
        ${campaign.recent.map((donor) => `
          <p><b>${esc(donor.name)}</b> · ${rp(donor.amount)}<br><span class="mu">${esc(donor.message)}</span></p>
        `).join('') || '<p class="mu">Belum ada.</p>'}
      `;

      const donationForm = document.getElementById('f');
      const statusMessage = document.getElementById('msg');
      donationForm.onsubmit = async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/campaigns/${encodeURIComponent(slug)}/donations`, {
          method: 'POST',
          body: new FormData(donationForm)
        });
        const result = await response.json();
        statusMessage.textContent = response.ok
          ? 'Jazakumullahu khairan. Donasi Anda menunggu verifikasi bendahara.'
          : result.error;
        if (response.ok) donationForm.reset();
      };
    } catch (error) {
      main.textContent = 'Gagal memuat kampanye.';
      console.error(error);
    }
  };

  const renderAdminPage = async () => {
    const keyInput = document.getElementById('k');
    const donationsContainer = document.getElementById('ds');
    const form = document.getElementById('f');
    if (!keyInput || !donationsContainer || !form) return;

    const headers = () => ({
      'x-admin-key': keyInput.value,
      'Content-Type': 'application/json'
    });

    async function loadDonations() {
      const response = await fetch('/api/admin/donations', { headers: headers() });
      if (!response.ok) {
        donationsContainer.textContent = 'Key salah';
        return;
      }

      const data = await response.json();
      donationsContainer.innerHTML = data.map((donation) => `
        <div class="card" style="margin-bottom:10px">
          <b>${esc(donation.name)}</b> · ${rp(donation.amount)} · ${esc(donation.title)} · <i>${donation.status}</i><br>
          <a target="_blank" href="/api/admin/proof/${esc(donation.proof)}?key=${encodeURIComponent(keyInput.value)}">Lihat bukti</a>
          ${donation.status === 'pending'
            ? ` <button type="button" onclick="QAF.setDonationStatus(${donation.id}, 'verified')">Verifikasi</button> <button type="button" onclick="QAF.setDonationStatus(${donation.id}, 'rejected')">Tolak</button>`
            : ''}
        </div>
      `).join('');
    }

    window.QAF = window.QAF || {};
    window.QAF.setDonationStatus = async (id, status) => {
      await fetch(`/api/admin/donations/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ status })
      });
      loadDonations();
    };

    window.load = loadDonations;

    form.onsubmit = async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      body.slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const response = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body)
      });

      alert(response.ok ? 'Tersimpan' : 'Gagal');
      if (response.ok) form.reset();
    };
  };

  const initPage = () => {
    const page = document.body.dataset.page;

    if (page === 'home') renderHomePage();
    if (page === 'campaign') renderCampaignPage();
    if (page === 'admin') renderAdminPage();
  };

  document.addEventListener('DOMContentLoaded', initPage);

  return {
    rp,
    esc,
    progress,
    setDonationStatus: null,
    initPage
  };
})();
