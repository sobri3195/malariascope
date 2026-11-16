# Surveilans Malaria Indonesia

Halaman `/surveilans-indonesia` menyediakan panel situasi, asal penularan, kesiapan layanan, respons kasus, serta rekonsiliasi/ekspor. `/jakarta` mengarahkan ke kode 31 sambil mempertahankan periode, sumber, dan panel. Tidak ditemukan modul Jakarta maupun `MalariaScope_Jakarta.patch` pada checkout dasar 78525c3dffa697aecc0809ce435f713f298c2e1c.

## Status sumber dan batas kemampuan

**Implementasi alur tersedia; pengisian angka resmi belum selesai.** Tidak ada angka Profil Kesehatan Indonesia, snapshot SKDR, rekap PE, penilaian fasilitas, atau respons kasus yang dibundel. Akses `kemkes.go.id` dan `www.kemkes.go.id` ditolak proxy jaringan (CONNECT 403) pada 16 November 2026. Jangan menganggap pengujian fixture sebagai pemeriksaan angka resmi Jakarta, Papua, atau Jawa Tengah. Tambahkan akses domain publikasi di pengaturan jaringan, periksa dokumen, lalu masukkan rekap agregat melalui kontrak di bawah. Tidak ada redistribusi angka provinsi, asumsi nol, atau pemakaian model Papua untuk mengisi kekosongan.

Master kode Kemendagri dipaketkan sebagai transkripsi terbuka berlisensi MIT dari `cahyadsn/wilayah` commit `c2eff0881e3c75b8822f8c84ea9d23affc11aadb`. Bukan master yang diunduh langsung dari server Kemendagri. Snapshot 2025 memuat 38 provinsi dan 514 kab/kota; arsip 2022 memuat 37 provinsi dan 514 kab/kota, arsip 2020 memuat 34 provinsi dan 514 kab/kota. Snapshot arsip tidak mengklaim mencakup semua perubahan dalam tahun tersebut. Semua unit tersedia untuk pencarian/pemilihan meskipun tidak ada angka. Identitas `ID` ditambahkan aplikasi untuk Indonesia.

Referensi hukum, URL resmi, URL salinan keputusan, hash SHA-256 dokumen/SQL, keterbatasan audit, dan status publikasi tercatat di [`public/data/indonesia/sources.json`](../public/data/indonesia/sources.json). Nomor keputusan perubahan 300.2.2-2430/2025 diperiksa melalui OCR halaman pertama salinan PDF; setiap kode/nama transkripsi belum diperiksa ulang terhadap lampiran resmi. Header SQL masih menyebut 2138/2025 sementara README menyebut perubahan 2430/2025; perbedaan ini dicatat, bukan disembunyikan. Tidak ada poligon yang diklaim sebagai batas resmi.

## Filter dan penyimpanan

Contoh URL: `/surveilans-indonesia?wilayah=2025&region=31&periode=2025&panel=situasi&sumber=ID-SUMBER%40v1`.

Parameter `wilayah` memilih versi master, `region` kode Kemendagri atau ID, `periode` tahun awal periode rekap, `sumber` adalah `source_id@publication_version`, `panel` adalah situasi/asal/layanan/respons/rekonsiliasi. Filter wilayah bersifat **tepat satu unit**: memilih provinsi hanya menampilkan baris provinsi, bukan penjumlahan anaknya. Sumber/versi berbeda tidak dijumlahkan. Periode kosong menampilkan seluruh tahun secara terpisah. Tautan berparameter salah menampilkan kesalahan, bukan memilih wilayah lain diam-diam.

Impor disimpan lokal dalam `malariascope-indonesia-aggregate-v1`, terpisah dari store riset/dataset sintetis. URL membagikan filter, bukan isi impor. Penerima perlu memuat rekap yang sama. Data penyimpanan divalidasi ulang saat dibaca; kegagalan baca/tulis ditampilkan. Tidak ada unggahan server.

## Kontrak CSV

Empat templat tanpa angka ada di [`public/data/indonesia/templates`](../public/data/indonesia/templates); dapat diunduh dari setiap panel. Batas 5 MB dan 10.000 baris. Header harus persis sesuai templat, tanpa kolom tambahan/duplikat. Nama/NIK/alamat/telepon pasien dilarang; pola NIK 16 digit dan email juga ditolak dalam nilai. Pemeriksaan pola bukan jaminan anonimisasi: petugas wajib memeriksa seluruh teks bebas, URL, dan metadata sebelum konfirmasi. Jangan unggah data pasien untuk menguji penolakan.

Metadata setiap baris:

| Kolom                                       | Makna                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| region_version, region_code                 | Snapshot master dan kode wilayah sesuai cakupan sumber; jangan memetakan kode lama ke batas baru hanya karena namanya sama.                                                                |
| period_start, period_end                    | Tanggal ISO inklusif; tanggal tidak sah ditolak.                                                                                                                                           |
| source_id, source_type, publication_version | Identitas seri, jenis publikasi, dan versi revisi; revisi berbeda tetap terpisah.                                                                                                          |
| published_at, reviewed_at                   | Tanggal terbit dan tanggal pemeriksaan yang dinyatakan pengimpor; bukan stempel verifikasi independen aplikasi.                                                                            |
| source_url, locator                         | URL HTTPS publikasi dan halaman/tabel/nomor rekap yang persis. Situasi hanya menerima domain pemerintah `.go.id` atau `skdr.surveilans.org`. Host saja tidak membuktikan keaslian dokumen. |
| definition, coverage                        | Definisi kasus/indikator dan unit/populasi yang tercakup; jelaskan ketidaklengkapan.                                                                                                       |
| geo_basis                                   | `pelaporan`, `domisili`, atau `paparan`; tidak dianggap setara.                                                                                                                            |
| status                                      | `reported`, `partial`, `unavailable`. Bilangan cacah aman wajib pada reported/partial; semua kolom hitungan kosong pada unavailable. 0 hanya untuk nol yang benar-benar dilaporkan.        |

- **Situasi**: `source_type=profil`, `skdr`, atau `rekap-resmi`; `confirmed` sesuai definisi sumber. Profil wajib periode tahun penuh. SKDR wajib `week_start`/`week_end` (1–53) selain tanggal periode; minggu tidak diisi untuk sumber lain. Snapshot mingguan tidak ditambahkan ke angka tahunan. Kabupaten/kota hanya boleh diisi dari dokumen tingkat kabupaten/kota, bukan alokasi angka provinsi.
- **Asal**: `source_type=pe-agregat`; `imported` (impor), `introduced` (lokal terkait impor), `indigenous` (setempat), `other`, `unclassified`. Jumlah kelimanya wajib sama dengan `confirmed`, termasuk untuk rekap parsial. Isian belum diklasifikasi bukan diubah menjadi setempat.
- **Layanan**: `source_type=penilaian-fasyankes`; `assessed_at` dalam periode. Pasangan `rdt_ready/rdt_assessed`, `microscopy_ready/microscopy_assessed`, `referral_ready/referral_assessed` masing-masing indikator memiliki penyebut sendiri, bukan seluruh fasilitas wilayah secara otomatis. Pembilang tidak boleh lebih besar. Penyebut 0 menghasilkan persentase tidak tersedia.
- **Respons**: `source_type=rekap-respons`; satu kelompok agregat homogen per tahap dan waktu pemicu SOP. `stage=notifikasi|penyelidikan|penanggulangan`. `trigger_at` dan `as_of` ISO dengan zona waktu; `deadline_hours` tenggat SOP untuk tahap tersebut, tanpa default buatan. `sop_url`, `sop_version`, `sop_effective_from/to` wajib; masa berlaku harus mencakup tanggal pemicu. `required_count` mencakup **semua** kejadian yang diwajibkan SOP dalam kelompok, termasuk yang belum selesai; `completed_count` ≤ required; `timely_count` ≤ completed. Satu baris tidak boleh mencampur pemicu/tenggat/SOP yang berbeda. Respons hanya masuk penyebut jika `trigger_at + deadline_hours <= as_of`. Pada batas tenggat tepat sudah jatuh tempo. Pembilangnya timely_count pada kelompok yang jatuh tempo; kelompok belum jatuh tempo dikeluarkan dari keduanya. Tampilkan setiap tahap/kelompok terpisah; jangan menganggap denominator tahap berikutnya sama dengan notifikasi. Kelompok per tahap harus saling lepas. Ketepatan angka rekap harus diaudit terhadap SOP oleh pemilik data; aplikasi tidak menyatakan SOP sudah disahkan hanya karena URL terisi.

Duplikat unit/periode/sumber/versi ditolak (respons juga memakai tahap dan pemicu). Tanggal, bilangan cacah aman, urutan waktu, dan konsistensi diperiksa sebelum penyimpanan; pratinjau dan konfirmasi wajib. Tidak ada pengubahan data riset.

## Pembaruan dan rekonsiliasi

1. Unduh dokumen resmi berikut lampiran; simpan salinan/hash, tanggal terbit, versi, locator, definisi, cakupan tanggal/minggu, dan tingkat wilayah. Catat koreksi publikasi. Periksa angka terhadap tabel asli, bukan kutipan media. Periksa ulang hasil ekstraksi secara independen.
2. Pastikan versi kode/batas cocok dengan dokumen. Untuk sumber sebelum pemekaran, gunakan snapshot lama yang sesuai. Bila tidak ada snapshot yang cocok, tambahkan master arsip yang diperiksa dalam perubahan data tersendiri; jangan mengalihkan angka Papua lama ke salah satu provinsi baru. Tahun label sumber saja tidak cukup menentukan batas.
3. Isi templat agregat dan lakukan pemeriksaan privasi. Rekap baru tidak menggantikan versi lama otomatis. Untuk rekap parsial nyatakan cakupan; untuk unavailable kosongkan hitungan. Masukkan sumber tingkat kabupaten/kota hanya jika tersedia.
4. Impor, tinjau, lalu konfirmasi. Pilih wilayah/periode/sumber; bandingkan pada panel rekonsiliasi. Perbedaan definisi, periode, minggu, cakupan, basis wilayah, jenis sumber, versi publikasi, atau batas ditampilkan sebagai penghalang kesetaraan. Kesamaan metadata tidak membuktikan angka sama. Tidak ada total gabungan lintas sumber/tingkat wilayah.
5. Ekspor sesuai filter. CSV membawa seluruh metadata asli dan hitungan, memakai quoting dan pelindung formula spreadsheet. CSV bukan daftar pasien. Perbarui ledger sources.json dan dokumentasikan hasil audit ketika menambahkan angka bawaan yang sudah diperiksa.

Untuk mereproduksi master: `node scripts/update-indonesia-regions.mjs`, lalu `npx prettier --write src/indonesia/regions.json` dan tinjau diff. Skrip memakai commit tetap dan memverifikasi checksum sumber sebelum menulis; jangan mengganti checksum untuk melewati kegagalan. Untuk pemutakhiran kode resmi, periksa keputusan baru dan seluruh daftar beserta tanggal berlaku terlebih dahulu, pertahankan snapshot lama, baru ubah pin/hash secara eksplisit dalam PR data yang ditinjau.

## Validasi

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` dari root. Setelah build, jalankan preview port 4173 dan `APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/surveilans-indonesia.mjs`.

Unit test mencakup semua kontrak, nol/parsial/kosong, jumlah asal, indikator layanan, batas tenggat dan penyebut respons, perbedaan versi/sumber/batas, identitas terlarang, duplikat, CSV aman, 38 provinsi/514 kab-kota, Jakarta/Papua/Jawa Tengah/kabupaten tanpa angka. Browser test mencakup pintasan Jakarta, hierarki/pencarian, URL/reload, impor fixture uji, ekspor, data anak tidak diisi dari provinsi, penolakan kolom pasien, dan lebar mobile. **Skenario satu provinsi dengan angka publik terverifikasi belum dijalankan karena publikasi belum dapat diakses**; pengujian UI Jawa Tengah bukan pengganti pemeriksaan tersebut.

### Hasil pada 16 November 2026

- Typecheck dan lint: lulus.
- `npm test`: 220 tes lulus, 0 gagal, 0 dilewati (13 tes kontrak Indonesia ditambah 207 tes sebelumnya).
- Production build: lulus.
- `tests/surveilans-indonesia.mjs`: lulus pada build produksi, termasuk Jakarta, Papua, Jawa Tengah, dan kabupaten tanpa angka. Semua angka dalam tes adalah fixture uji, bukan angka publik.
- `tests/browser.mjs`: lulus; alur impor/alert/readiness dan rute lama, tanpa page error.
- Reproduksi master dengan pin/checksum: lulus; setelah Prettier hash berkas hasil sama (idempoten).
- Seluruh suite browser lain/cross-browser tidak dijalankan pada perubahan ini.
- Pemeriksaan angka publik Profil Kesehatan Indonesia/SKDR dan perbandingan provinsi dengan data publik: belum dijalankan, akses publikasi diblokir jaringan. Audit seluruh transkripsi kode terhadap lampiran resmi juga belum selesai. Batasan tersebut mencegah klaim data resmi lengkap.
