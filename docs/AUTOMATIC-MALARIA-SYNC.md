# Sinkronisasi publikasi malaria

Pipeline resmi memiliki jalur: indeks/portal → unduh terbatas → ekstraksi/normalisasi → validasi → berkas immutable → penggantian manifest atomik → PR data → persetujuan/merge → build Vercel yang terhubung. Job tidak menggabungkan PR atau men-deploy Vercel. Koneksi Git–Vercel produksi belum dapat diperiksa dari lingkungan ini; maintainer perlu memastikan production branch dan build proyek memakai repo ini.

## Menjalankan

Gunakan Node 22.18+ atau 24, Python 3, `curl`, serta Poppler `pdftotext` (`apt-get install poppler-utils`). `npm ci` memasang dependensi aplikasi. Tidak diperlukan kredensial pasien atau API privat.

```sh
npm run data:sync:malaria -- --year 2026 --dry-run
npm run data:sync:malaria -- --year 2026
npm run data:sync:malaria
npm run data:validate:malaria
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

Tanpa `--year`, indeks menentukan publikasi terbaru. `--dry-run` melakukan request dan validasi tetapi tidak menulis artefak data, log persisten, atau manifest di repositori (berkas pembaca sementara dibersihkan). Exit 1 menandakan minimal satu sumber gagal/perlu ditinjau; sumber lain tetap bisa berhasil. JSON stdout mencatat semua hasil dan versi yang dipertahankan. Pemanggilan lokal yang menulis memakai direktori lock `.sync-lock`; setelah proses terhenti paksa, pastikan tidak ada proses lain sebelum menghapus lock yang tertinggal.

Workflow [sync-malaria.yml](../.github/workflows/sync-malaria.yml) menjalankan cron `20 23 * * *` UTC (06.20 WIB) dan `workflow_dispatch` dengan tahun opsional serta dry run. Concurrency group mencegah job bersamaan. GitHub perlu mengizinkan Actions membuat PR. Workflow membuat/memperbarui **draft PR** di `automation/malaria-data`, menyertakan hasil pemeriksaan dalam Actions summary, dan tetap menandai job gagal bila ada sumber yang gagal. Ia menjalankan typecheck, lint, tes, validasi seluruh versi, dan build sebelum menyiapkan PR. Tidak ada klaim pembaruan produksi sebelum persetujuan/merge dan deployment berhasil.

## SKDR

Mulai dari `https://surveilans.kemkes.go.id/publikasi`; HTMLParser membaca anchor aktual, judul, tanggal (`time`, atribut tanggal, metadata detail, atau tanggal Indonesia), detail publikasi, dan pagination `rel=next`. Penelusuran dibatasi delapan halaman indeks dan delapan PDF per run. Tahun/buletin berasal dari **judul**, bukan nama berkas; tidak ada tebakan URL PDF. Tautan atau identitas yang ambigu ditahan. Situs yang memakai pagination lain memerlukan adapter yang diperiksa terhadap HTML nyata.

Poppler membaca teks seluruh halaman. Adapter `malaria-section-text-labels-v1` mencari bagian **Malaria Konfirmasi**, frasa cakupan “sampai/hingga/s.d. M… tahun …”, angka berlabel nasional, dan satu baris angka untuk setiap label 38 provinsi. Angka bisa mendahului atau mengikuti label. Halaman diambil dari hasil ekstraksi, bukan konstanta 36/45. Hanya cacah integer (termasuk nol) diterima. Grafik pindai, label vertikal/terpisah, periode ambigu, label berulang, atau kurang dari 38 provinsi menghasilkan **Perlu ditinjau**. Adapter konservatif ini belum dapat dicocokkan dengan tata letak PDF live karena CONNECT 403; dukungan layout tidak dianggap terbukti oleh fixture. Jangan melonggarkan aturan atau mengisi kekosongan dengan nilai rekaan.

Snapshot memisahkan tahun terbit, nomor buletin, tahun data setiap baris, minggu cakupan, tanggal terbit, waktu tarik, URL indeks/PDF, nomor halaman, dan SHA-256 PDF. Kasus tahun data yang berbeda dari tahun terbit ditahan untuk audit pemisahan seri. Batas 2025 yang ada hanya mendukung tahun data 2025–2026; publikasi tahun lain ditahan sampai master historis yang sesuai diaudit. Nasional diterbitkan tetap terpisah dari subtotal/jumlah provinsi. Angka 388.495, jumlah turunan 394.361, dan selisih 5.866 diuji pada fixture M44 yang jelas sintetis; jumlah provinsi tidak pernah diturunkan dari total nasional.

## SISMAL

Mulai dari `https://malaria.kemkes.go.id/case`, periksa pola URL pada HTML atau maksimal 12 bundle JavaScript first-party. Adapter menerima URL literal atau template literal tahun, mempertahankan trailing slash dan query yang teramati. Bentuk bundle yang belum dikenali ditahan untuk ditinjau, bukan ditebak. URL teramati diuji dengan request nyata lalu respons divalidasi; parameter provinsi tidak dipercaya sebagai cakupan. Satu respons per tahun cukup untuk lintas provinsi; filter wilayah dilakukan lokal. Tahun terbaru dan seri SISMAL yang sudah ada diperiksa secara independen, termasuk 2025 saat terbaru 2026.

Kontrak normalisasi ada di [sismal.ts](../src/indonesia/sismal.ts). Array/envelope, kolom agregat yang diizinkan, tahun eksplisit, jenjang kabupaten, kode/nama/induk, angka/status/tanggal dan duplikat diperiksa. Kolom asing ditolak; JSON mentah respons API tidak diterbitkan. SHA-256 respons asli dicatat, tetapi hanya normalisasi agregat disimpan. Status “Belum tervalidasi” tetap verbatim. ID sumber `1105` + ACEH TIMUR + induk ACEH dipetakan ke string Kemendagri `11.03` untuk 2025–2026. Nama ambigu/tidak ditemukan menahan **seluruh kandidat**, disertai alasan dan ID, sehingga tidak ada publikasi parsial diam-diam. Empty adalah belum tersedia, bukan angka nol, dan tidak boleh menghapus observasi yang ada.

## Dinkes/Satu Data

Registry [regional-sources.json](../scripts/malaria/regional-sources.json) sengaja kosong: belum ada unduhan daerah yang diverifikasi. Adapter JSON agregat tersedia di [regional.mjs](../scripts/malaria/regional.mjs). Tambahkan hanya setelah URL HTTPS `.go.id`, definisi, tanggal terbit, periode, jenjang dan kode wilayah dapat diperiksa. Konfigurasi wajib: `id`, `url`, `year`, `publishedAt`, `periodStart`, `periodEnd`, `level`, `regionCode`, `definition`. Setiap baris JSON harus persis berisi `regionCode, level, year, periodStart, periodEnd, metric, definition, value, availability`, dengan `metric=confirmed_cases`; kode harus sesuai cakupan konfigurasi. Jangan memasukkan identitas pasien. Sumber baru dapat divalidasi/diarsipkan pipeline; pilihan UI saat ini tetap SKDR dan SISMAL. Integrasi tampilan daerah memerlukan tinjauan definisi indikator tersendiri.

## Versi, integritas, dan kegagalan

`public/data/indonesia/manifest.json` adalah katalog yang dibaca **bersama** oleh Dashboard dan Surveilans Indonesia. `sync-manifest.json` lama hanyalah arsip percobaan sebelumnya. Migrasi awal memakai `scripts/bootstrap-malaria-catalog.mjs`, mempertahankan label `user-supplied-incomplete` dan `bootstrap`, tanpa menyatakan unduhan resmi berhasil.

Setiap versi berada di `/data/indonesia/versions/<sumber>/<id>.json`. Hash respons asli dan hash semantik (tanpa waktu tarik) mendeteksi duplikat; recheck identik menghasilkan “Tidak ada pembaruan”. Perubahan isi dengan identitas buletin sama menghasilkan revisi baru. Snapshot baru ditulis lengkap melalui file sementara sebelum ditautkan secara immutable; PDF sumber yang lolos disimpan berdasarkan checksum di `evidence/skdr`. Hanya sesudah staging berhasil manifest diganti dengan rename atomik. Kegagalan skema/layout/pemetaan/cakupan/unduhan tidak memindahkan pointer sumber tersebut. Recheck edisi lama tidak menurunkan pointer terbaru. Versi lama tidak dihapus. Penurunan wilayah berangka ditahan untuk audit, termasuk respons kosong setelah sebelumnya berisi observasi.

HTTPS memverifikasi TLS; host dan setiap redirect dibatasi allowlist; maksimum tiga percobaan, timeout 20 detik/request, ukuran 32 MiB/PDF atau respons, 4 MiB/HTML dan 6 MiB/bundle. Retry hanya untuk gangguan sementara. `Retry-After` detik/tanggal dihormati; jika melebihi 30 detik job berhenti dengan alasan penundaan, tanpa retry lebih awal. `retryAt` disimpan dalam manifest; job berikutnya juga menahan request ke host itu sampai batas waktunya. Log tidak menyimpan payload asing atau baris pasien.

Browser memuat manifest `cache: no-store`, memeriksa kontrak, memilih path versi, menghitung SHA-256 byte respons, lalu memvalidasi data/identitas/tahun. Manifest punya header Vercel `no-cache`; versi immutable punya cache satu tahun. Dashboard menampilkan sumber, versi, minggu cakupan, waktu cek dan alasan mempertahankan snapshot lama. Bila manifest gagal saat sesi sudah memiliki katalog, katalog itu dipertahankan dengan peringatan; sesi baru tanpa manifest menampilkan kegagalan. Kegagalan berkas/checksum menutup data dan ekspor, tanpa beralih ke seri riset.

Contoh:

- `/dashboard?dataset=skdr-indonesia&snapshot=latest` mengikuti versi aktif terbaru.
- `/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=31` tetap memilih edisi M44 (revisi terakhir edisi itu).
- `/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44-bootstrap-04a01c757dc10e32&region=31` mengunci revisi awal tertentu.

Saved view baru menyimpan `versionId` immutable; saved view lama tetap memakai alias edisi. Region/source/year/bulletin, Inspector dan ekspor memakai satu konteks. JSON/CSV menyertakan versi, checksum sumber/data, path, status dan waktu cek. Ekspor nasional menandai angka publikasi vs jumlah turunan dengan label terpisah; tidak menjumlahkan antarjenjang.

## Bukti sesi 16 November 2026

Pengecekan live `npm run data:sync:malaria -- --year 2026` pada **2026-11-16T10:55:58.973Z**: akses indeks SKDR dan portal SISMAL ditolak kebijakan jaringan **CONNECT 403**. Semua pointer awal dipertahankan; `lastSuccessAt` tetap null. Ini bukan respons API kosong. Draft allowlist lingkungan dari pekerjaan sebelumnya belum berlaku pada runtime ini.

| Sumber/tahun | Cakupan berangka yang tersedia | Belum tersedia / batas bukti |
| --- | --- | --- |
| SKDR 2026 M44 | Nasional 388.495; Aceh 391, DKI 367, Gorontalo 8.252, Papua 157.608 | 34 provinsi null; seluruh kabupaten tanpa angka SKDR; angka berasal dari permintaan, belum diverifikasi PDF |
| SISMAL 2025 | Aceh Timur 4, ID sumber 1105 → 11.03 | Kabupaten lain belum tersedia; hanya contoh dari permintaan, belum ditarik portal |
| SISMAL 2026 | Tidak ada angka | Not-fetched dipertahankan; tidak dianggap empty terverifikasi |
| Daerah | Tidak ada sumber terkonfigurasi | Tidak ada angka daerah rekaan |

Semua 38 provinsi dan 514 kabupaten/kota tetap dapat dipilih dari master yang ada. Master adalah transkripsi Kemendagri terversi, belum seluruhnya diaudit terhadap lampiran resmi. Tidak ada proyeksi angka provinsi menjadi kabupaten atau model Papua untuk wilayah lain.

## Hasil pengujian aktual

- `npm run typecheck`, `npm run lint`, `npm run data:validate:malaria`, `npm run build`: lulus.
- `npm test`: 261/261 lulus, termasuk 11 pengujian pipeline dengan beberapa kasus per tes. `npm run test:coverage`: 93,62% baris, 88,23% cabang, 93,64% fungsi; seluruh ambang CI lulus.
- `npm run test:browser`: rangkaian terakhir **33/33 suite lulus** pada Chromium. Percobaan awal 32/33; satu transisi tahun riset di `research-evidence.mjs` gagal, lalu lulus secara terisolasi dan dalam pengulangan lengkap. Tidak ada suite yang dilewati. Firefox/WebKit tidak dijalankan lokal pada perubahan ini.
- `npm run test:accessibility`: 32 konteks, 0 jenis pelanggaran WCAG A/AA, termasuk Dashboard SKDR/SISMAL dan empat panel rekap.
- Workflow CI dan sinkronisasi dapat diparse sebagai YAML. Job GitHub terjadwal/production deployment belum dijalankan atau diverifikasi dari lingkungan ini.
- Pengecekan live dan dry run: exit 1 karena CONNECT 403; semua versi awal dipertahankan. Fixture tidak membuktikan kompatibilitas layout atau skema live yang belum dapat dibaca.

Tes browser [automatic-malaria-sync.mjs](../tests/automatic-malaria-sync.mjs) menjalankan **pipeline penerbit sesungguhnya** pada direktori sementara, dengan unduhan serta pembaca PDF sintetis yang diberi label sebagai fixture. Manifest dan checksum keluaran pipeline diberikan ke aplikasi melalui intersepsi request browser. Event request membuktikan perpindahan berikut:

```text
/data/indonesia/versions/skdr/2026-m44-bootstrap-04a01c757dc10e32.json
→ /data/indonesia/versions/skdr/2026-m45-e063e2fe917ee49d-b3a5ee05e188dd04.json
→ /data/indonesia/versions/skdr/2026-m44-bootstrap-04a01c757dc10e32.json
```

Langkah kedua menampilkan fixture nasional 400.000 dengan label sampai M44 2026. Langkah ketiga memulihkan saved view M44, tetap 388.495 setelah reload walaupun versi terbaru telah berubah. Tautan Surveilans Indonesia memakai konteks yang sama. Kegagalan sumber/manifest mempertahankan katalog/versi terakhir dengan peringatan; byte yang checksum-nya salah menonaktifkan data dan ekspor. Ekspor saved view memuat ID versi lama, checksum, status gagal sumber, dan filter wilayah aktif. Seluruh berkas fixture dibersihkan dari direktori sementara; snapshot M45 sintetis **tidak** disertakan dalam aset publik.
