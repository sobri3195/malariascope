# Penarikan dan pemuatan SKDR/SISMAL

> Catatan historis implementasi sebelumnya. Pipeline aktif, perintah, manifest, dan workflow terbaru dijelaskan dalam [AUTOMATIC-MALARIA-SYNC.md](AUTOMATIC-MALARIA-SYNC.md). Opsi `--skdr-markdown` dan path loader tetap di bawah sudah digantikan oleh penemuan publikasi dan manifest immutable.

Perbaikan ini berangkat dari implementasi Surveilans Indonesia pada commit `4e8d0ae`. Masalah direproduksi pada `/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=11.03`: awalnya tidak ada pilihan tahun 2025, status kabupaten masih generik dan label workspace masih Papua.

## Perilaku dashboard

- Konteks URL membedakan `source=skdr` dan `source=sismal`, tahun, kode wilayah dan id snapshot. Tanpa parameter source, tautan lama tetap berarti SKDR.
- Pada Aceh Timur 2026, kartu utama menampilkan **Data Aceh Timur 2026 belum tersedia**, bukan 391. Kartu konteks terpisah berlabel **Provinsi Aceh · 391 kasus sampai M43 2026**.
- **Lihat data 2025** memilih `source=sismal&year=2025&snapshot=sismal-2025&region=11.03`. Angka yang disampaikan pengguna, 4, tampil dengan peringatan bahwa respons portal belum dapat diperiksa. ID sumber `1105`, kode Kemendagri `11.03`, tahun pelaporan dan status bukti ikut diekspor. Tidak ada klaim validasi resmi atas angka yang belum ditarik.
- Seri SKDR kumulatif dan SISMAL tahunan tidak digabung. Kartu kabupaten memakai observasi exact-code/exact-year; konteks provinsi bukan fallback kasus kabupaten. Pada pilihan provinsi, tabel/ekspor SISMAL hanya memuat kabupaten/kota di induk itu, tanpa menghitung jumlah tersebut sebagai angka provinsi. Pada Indonesia, tabel/ekspor SISMAL memuat baris kabupaten terpetakan dan tidak menambahkan total SKDR.
- Dashboard, panel situasi/rekonsiliasi Surveilans Indonesia, Inspector dan ekspor membaca konteks yang sama. Workspace berlabel **Surveilans Indonesia** saat dataset ini aktif. Geometri yang belum tersedia tetap ditandai; pencarian dan tabel tidak bergantung padanya.

## Status bukti dan akses sumber saat sesi ini

PDF resmi dan kedua endpoint contoh dicoba langsung:

- `https://surveilans.kemkes.go.id/assets/publikasi/laporan-mingguan-situasi-terkini-penyakit-infem-dan-potensial-klb-wabah-m44-2026.pdf`
- `https://malaria.kemkes.go.id/api/sismal/chartMap/2025/?province=ACEH`
- `https://malaria.kemkes.go.id/api/sismal/chartMap/2026/?province=ACEH`

Ketiganya gagal dengan HTTP 403; pemeriksaan HEAD menunjukkan CONNECT ditolak proxy. Kebijakan runtime hanya mengizinkan preset package_managers. Domain `surveilans.kemkes.go.id`, `malaria.kemkes.go.id`, dan `api.github.com` sudah ditambahkan ke draft pengaturan lingkungan. Draft belum mengubah runtime: tinjau/simpan dan publikasikan pengaturan lingkungan agar berlaku, lalu jalankan sinkronisasi lagi. Kegagalan ini bukan respons kosong/angka nol dari portal. GitHub GraphQL juga masih ditolak.

Lampiran yang diterima adalah instruksi 5.100 byte, bukan `Prompt_Codex_MalariaScope_Indonesia.md` dengan CSV 38 provinsi. Karena PDF belum dapat diunduh dan CSV tidak tersedia, snapshot resmi lengkap belum dapat diterbitkan. Nasional 388.495 dan provinsi Aceh 391, DKI Jakarta 367, Gorontalo 8.252, Papua 157.608 berasal dari angka eksplisit dalam permintaan. Provinsi lain tetap null. Jumlah resmi 38 provinsi 394.361 dan selisih 5.866 belum dapat dinyatakan sebagai hitungan dari data lengkap; hanya diuji sebagai target pada fixture sintetis yang terpisah.

Metadata baru dari instruksi disimpan pada snapshot SKDR: URL PDF, terbit 10 November 2026, penarikan yang dinyatakan 7 November 2026 pukul 10.00 WIB (`2026-11-07T10:00:00+07:00`). Waktu penarikan mendahului terbit; `retrievalNote` menyatakan hal ini belum dapat diverifikasi. Penarikan nyata oleh skrip disimpan terpisah sebagai `fetchedAt` saat berhasil, bukan memalsukan bahwa berkas sudah diunduh pada 7 November. Snapshot tetap `user-supplied-incomplete`, sehingga peringatan ketidaklengkapan belum dihapus.

| Seri/tahun                                        | Baris bernilai dalam artefak sekarang | Status bukti                                        |
| ------------------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| SKDR 2026 M44, nasional                           | 1                                     | Angka dari permintaan; belum diperiksa PDF          |
| SKDR 2026 M44, provinsi                           | 4 dari 38; 34 belum tersedia          | Angka dari permintaan; belum diperiksa PDF          |
| SKDR 2026 M44, kabupaten/kota                     | 0                                     | Belum tersedia                                      |
| SISMAL 2025, kabupaten/kota                       | 1 (Aceh Timur, nilai 4)               | Angka dari permintaan; `responseState: not-fetched` |
| SISMAL 2026, kabupaten/kota                       | 0                                     | `responseState: not-fetched`                        |
| SISMAL 2025/2026 hasil fetch portal yang berhasil | 0                                     | Kedua penarikan ditolak jaringan                    |

Klaim respons 488 baris/37 label provinsi pada 2025 berasal dari instruksi pengguna dan belum dapat direproduksi. Penelusuran unduhan Dinkes/Satu Data/profil daerah belum menghasilkan dokumen yang dapat diperiksa; tidak ada baris yang ditambahkan tanpa wilayah, periode dan definisi indikator. Daftar wilayah tanpa sumber tetap tersedia pada master dan tidak dianggap nol.

## Perintah sinkronisasi

```sh
npm run data:sync:malaria -- --year 2026
npm run data:sync:malaria -- --year 2026 --skdr-markdown /path/Prompt_Codex_MalariaScope_Indonesia.md
```

Skrip memakai HTTPS dengan verifikasi TLS tetap aktif dan timeout 40 detik per permintaan. Tahun 2026 menarik satu respons SISMAL 2026 dan satu respons 2025 untuk pembanding; tidak mengulangi request per provinsi. Tahun 2025 hanya menarik satu respons SISMAL 2025. URL berparameter `province=ACEH` tidak dianggap jaminan cakupan respons.

SISMAL dinormalisasi dari array atau `{data: array}`. Kontrak kanonis per baris: `source_id`, `district`, `province`, `positive_cases`, `reporting_year`, opsional `updated_at`, `validation_status`. Alias eksplisit ada di `src/indonesia/sismal.ts`; karena payload portal belum dapat diinspeksi, kompatibilitas alias dengan respons nyata masih harus dikonfirmasi. Skema asing, konflik alias, tahun yang tidak jelas/berbeda, nilai negatif atau bukan integer ditolak. Tahun tidak disimpulkan dari tanggal pembaruan. Status validasi yang dinyatakan sumber dipertahankan verbatim, termasuk **belum tervalidasi**; status yang tidak diberikan tidak dianggap sah/tervalidasi.

Pemetaan tidak mengubah `1105` menjadi `11.05`: override eksplisit tahun 2025–2026 memetakan sumber 1105 + ACEH TIMUR + induk ACEH ke 11.03. Nama/induk yang bertentangan dikarantina. Nama lain dicocokkan secara unik di dalam provinsi; kota dan kabupaten yang ambigu dilaporkan, bukan ditebak. Kode sumber dan Kemendagri disimpan sebagai string terpisah. ID sumber harus berupa kode unit 4 digit pada kontrak adapter ini. Tidak ada kolom pasien yang disimpan ke hasil normalisasi; baris mentah tidak dipublikasikan.

Duplikat identik dideduplikasi. Duplikat dengan nilai/status konflik menggagalkan respons. Angka nol eksplisit tetap 0; null/kosong tetap unavailable. Respons kosong, seluruhnya tak terpetakan, kegagalan HTTP/skema, atau cakupan observasi yang menyusut tidak mengganti artefak sebelumnya. Ini mencegah gangguan portal menghapus data yang sudah ada. Cakupan yang menyusut memerlukan pemeriksaan revisi sumber tersendiri, bukan diterima diam-diam.

Snapshot normalisasi yang sah disimpan atomik ke `public/data/indonesia/sismal/<year>.json`, disertai arsip berdasarkan SHA-256 dan manifest penarikan. Manifest mencatat URL, waktu percobaan, status, checksum respons, jumlah baris/cakupan dan baris belum terpetakan. Respons gagal menghasilkan exit nonzero; data lama dipertahankan. `public/data/indonesia/sync-manifest.json` dalam perubahan ini merekam kegagalan nyata, bukan percobaan sukses.

## Buletin baru dan verifikasi PDF

Konverter Markdown tetap memakai header yang didokumentasikan pada [SKDR-DASHBOARD](SKDR-DASHBOARD.md). ID dibentuk dari tahun/buletin; edisi baru 2026, misalnya M45, disimpan sebagai `2026-m45.json`, terpisah dari M44. Loader memilih berkas dari id di URL yang lolos pola ketat. Tahun/master batas di luar kontrak yang didukung memerlukan perubahan dan audit tersendiri.

Dengan `--skdr-markdown`, skrip menolak CSV tidak lengkap, lalu mengunduh PDF dari URL resmi yang sama dengan metadata CSV, mengekstrak halaman 36/45 melalui `pdftotext`, dan mencocokkan label asli serta angka pada baris teks yang sama. Jika tata letak PDF berupa gambar atau tidak mendukung pencocokan baris, skrip berhenti dan meminta pemeriksaan ekstraksi/OCR; tidak melewati pemeriksaan. Hash PDF/lampiran, halaman pemeriksaan dan `fetchedAt` disimpan pada hasil. Angka nasional tidak diganti oleh penjumlahan provinsi. Sebelum penggantian edisi yang sama, isi sebelumnya diarsipkan. Pola pencocokan harus ditinjau terhadap PDF nyata sebelum hasil disebut audit independen; pemeriksaan struktur/teks bukan pengesahan ilmiah sumber.

Browser membaca artefak lokal yang ikut build, bukan bergantung langsung pada CORS/ketersediaan portal saat halaman dibuka. Penarikan sumber live adalah tanggung jawab perintah sinkronisasi, bukan setiap pergantian provinsi di browser.

## Validasi

Jalankan typecheck, lint, unit test dan build, lalu pada preview yang sudah dibangun:

```sh
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/malaria-source-loading.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/skdr-dashboard.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/browser.mjs
```

Unit test adapter memakai fixture sintetis yang diberi komentar eksplisit, bukan payload portal yang diklaim telah diunduh. Tes mencakup respons lintas provinsi, ID/induk/nama ambigu, data kosong, nol, tahun salah, duplikat, retensi artefak setelah gagal/kosong/cakupan menyusut, dan pemulihan konteks SISMAL. Browser menguji tautan Aceh Timur 2026, konteks provinsi terpisah, pilihan 2025, kode/ID/tahun/status/ekspor, Inspector/panel bersama, kegagalan load/retry dan mobile. Pengujian angka nasional/provinsi lengkap serta respons live Kemenkes tetap tertunda karena akses dan lampiran.

### Hasil aktual

- Typecheck dan lint: lulus.
- `npm test`: 234 tes lulus, 0 gagal, 0 dilewati.
- Production build: lulus.
- Browser `malaria-source-loading.mjs`, `skdr-dashboard.mjs`, dan `browser.mjs`: lulus. Alur mobile SISMAL diperbaiki setelah tes menemukan overflow tabel.
- `npm run data:sync:malaria -- --year 2026`: dijalankan, exit nonzero; SISMAL 2026, SISMAL 2025, dan PDF semuanya HTTP 403. Artefak sebelumnya tetap ada. Manifest mencatat kegagalan tersebut.
- PDF/CSV lengkap, angka 38 provinsi terverifikasi, pencocokan skema respons live portal, pencarian publikasi daerah, dan PR melalui GitHub API: masih memerlukan akses sumber/lampiran yang belum tersedia. Tidak disebut lulus.
- Suite browser lain/cross-browser tidak dijalankan untuk perubahan ini.
