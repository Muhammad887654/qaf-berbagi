# QAF Berbagi

Webapp crowdfunding (infaq/sedekah) untuk Quranic Action Forum UM Bandung. Donasi lewat transfer manual + unggah bukti, diverifikasi bendahara.

## Struktur
```
qaf-berbagi/
├── server.js          API Express + SQLite + upload bukti
├── db/schema.sql      Tabel campaigns & donations + data contoh
├── frontend/
│   └── .env.example   Template environment untuk frontend Vite
├── public/
│   ├── index.html     Daftar kampanye
│   ├── campaign.html  Detail, progres, formulir donasi
│   ├── admin.html     Panel bendahara (verifikasi, kampanye baru)
│   ├── app.js         Helper (format Rupiah, escape HTML)
│   ├── style.css      Tema hijau-emas senada blog QAF
│   └── logo.png       Logo (diambil dari BLOG_QAF.html)
├── package.json
├── .env.example       Salin ke .env lalu isi
└── .gitignore
```
(`data.db` dan `uploads/` dibuat otomatis saat server dijalankan.)

## Menjalankan
1. Pasang Node.js 20.6+.
2. Salin `.env.example` menjadi `.env`, lalu isi `ADMIN_KEY`, `BANK_INFO`, `SUPABASE_URL`, dan `SUPABASE_SERVICE_ROLE_KEY`.
3. `npm install` lalu `npm start`.
4. Buka `http://localhost:3000`, panel bendahara di `/admin.html`.

Frontend Vite terpisah memakai `frontend/.env` berdasarkan `frontend/.env.example`. Gunakan hanya Supabase anon/publishable key di frontend; jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di sana.

## Alur
Donatur isi formulir + bukti transfer → status `pending` → bendahara verifikasi di admin → baru dihitung ke progres dan daftar donatur.

## Sebelum dipakai publik
- Ganti target contoh di `db/schema.sql` dan isi `BANK_INFO` rekening resmi QAF.
- Pakai HTTPS dan `ADMIN_KEY` panjang; batasi akses `/admin.html`.
- Koordinasikan dengan Bendahara/LPPAIK soal izin dan laporan penyaluran dana.
- Pengembangan lanjut: payment gateway (Midtrans/QRIS dinamis), notifikasi WhatsApp, halaman laporan penyaluran.
