# SKDR Indonesia di Command Dashboard

Catatan sesi terbaru: [penarikan SKDR/SISMAL dan cakupan sekarang](MALARIA-SYNC.md). Status data dan jumlah wilayah pada catatan tersebut menggantikan hitungan parsial sesi awal di bawah.

## Status data: lampiran lengkap masih diperlukan

Implementasi ini memperluas kode di branch `feat/surveilans-indonesia` setelah commit `068b5ed`. Perubahan baru disiapkan sebagai diff lokal; tidak diterbitkan ke GitHub/Vercel. `src/jakarta/` dan lampiran `Prompt_Codex_MalariaScope_Indonesia.md` tidak ditemukan. Panel dan validasi agregat yang telah tersedia di `src/indonesia/` digunakan kembali.

**Snapshot bawaan belum merupakan ekstraksi lengkap buletin.** Permintaan menyebut total nasional 388.495, DKI Jakarta 367, Gorontalo 8.252, dan Papua 157.608. Hanya empat nilai itu yang disimpan; 35 provinsi lain memiliki `value: null` dan `availability: unavailable`. Ada tepat 1 unit nasional dan 38 provinsi, tetapi hanya 3 provinsi mempunyai angka. Ini dinyatakan dengan `evidence: user-supplied-incomplete` dan peringatan terlihat pada dashboard. `originalLabel`, URL publikasi, dan waktu penarikan tetap null karena tidak tersedia dalam pesan. Label tabel berasal dari master Kemendagri, bukan diklaim sebagai ejaan asli SKDR.

Metadata yang dinyatakan dalam permintaan: SKDR Kemenkes, Buletin M44 2026, data sampai M43, terbit 10 November 2026; angka nasional halaman 36 dan provinsi halaman 45. Angka tersebut belum diverifikasi terhadap dokumen aslinya. Tidak ada total, nilai provinsi lain, URL dokumen, atau waktu penarikan yang dibuat-buat.

Target jumlah provinsi 394.361 dan selisih 5.866 dicatat sebagai **target pemeriksaan dari permintaan**, bukan disisipkan ke perhitungan. Fungsi `skdrReconciliation` menjumlahkan hanya baris province. Selama ada provinsi unavailable/partial, `provinceSum` dan `difference` adalah null. Subtotal tersedia 166.227 dari 3 provinsi dilabeli parsial, bukan angka Indonesia. Fixture lengkap sintetis pada tes membuktikan perhitungan 394.361 − 388.495 = 5.866 tanpa memakai angka fixture sebagai data produksi.

## Alur dan isolasi konteks

Buka `/dashboard`, pilih DATASET **SKDR Kemenkes — Indonesia 2026**. YEAR menjadi 2026, wilayah Indonesia, label **Data sampai M43 2026 · Buletin M44**. URL yang dapat dipulihkan:

`/dashboard?dataset=skdr-indonesia&year=2026&snapshot=2026-m44&region=ID`

`region` adalah string kode Kemendagri (31 Jakarta, 75 Gorontalo, 91 Papua; kab/kota memakai titik). Pemilih provinsi memuat 38 provinsi; pemilih kab/kota mengikuti provinsi, termasuk wilayah tanpa angka. Tidak ada fallback dari provinsi ke kabupaten/kota. Data kabupaten/kota belum tersedia ditampilkan eksplisit. Master snapshot batas 2025 diambil dari transkripsi berkode Kemendagri yang sudah disertai asal/hash/lisensi; audit menyeluruh terhadap lampiran resmi dan pembaruan master 2026 masih perlu diselesaikan. Jangan menyebut transkripsi ini sebagai unduhan langsung master resmi.

`SkdrProvider` menyimpan satu konteks URL untuk dashboard, tabel, Inspector, snapshot tampilan, ekspor, serta panel surveilans. Model `SkdrRow` khusus memisahkan national/province/district, kode string, tahun, minggu, buletin, metrik, nilai, status, label asli, dan halaman sumber. Tidak ada pemaksaan baris nasional ke model lama `district + year`.

`store.tsx` menghentikan penulisan/pembacaan konteks URL riset ketika SKDR aktif dan menghentikan evaluasi/pencatatan alert riset. Dataset/seleksi/checklist/snapshot riset tetap tersimpan. Memilih kembali dataset studi Papua memulihkan konteks riset yang tetap ada. Snapshot tampilan SKDR menggunakan kontrak khusus di `workspace-context.ts` dan penyimpanan `malariascope-skdr-views-v1`, terpisah dari snapshot/alert/demo riset. Snapshot tampilan bukan salinan data dan tidak membuktikan publikasi sudah diperiksa.

Tidak ada insidens, risiko, atau prediksi tanpa input dan validasi kelayakan yang dibutuhkan. Geometri resmi yang cocok belum tersedia, sehingga area peta menjelaskan status tersebut; tabel tidak bergantung pada geometri. Poligon studi Papua tidak dipakai untuk menampilkan provinsi/kabupaten lainnya.

Tautan **Buka lima panel surveilans** membawa query yang sama ke `/surveilans-indonesia`. Panel situasi dan rekonsiliasi memakai snapshot SKDR; tiga panel rekap memakai templat, pratinjau, validasi, konfirmasi dan penyimpanan agregat yang telah ada. `/jakarta` mempertahankan parameter lalu memilih kode 31. Rekap lokal tidak ikut disebarkan lewat URL.

Export overview (JSON) dan Ekspor CSV SKDR mempertahankan konteks, level, kode, status, versi, halaman dan metadata sumber. Nasional dan hasil penjumlahan provinsi diberi kolom berbeda, bukan ditambahkan. Ekspor kabupaten kosong tidak mengekspor angka provinsi. Kode/tahun/versi tidak sah atau kegagalan pemuatan menonaktifkan ekspor. Tiga panel rekap juga menyediakan ekspor JSON selain CSV.

## Memperbarui dari lampiran

1. Dapatkan lampiran Markdown asli dan dokumen publikasi. Cocokkan angka setiap baris terhadap halaman 36/45, label asli, jenjang, periode, versi batas wilayah, URL sumber, serta waktu penarikan. Jangan merekonstruksi baris yang hilang dari total.
2. `scripts/convert-skdr-indonesia.mjs` menerima tepat satu blok fenced CSV. Header kanonis berikut harus dipetakan eksplisit dari lampiran asli jika berbeda:

```csv
level,region_code,original_label,year,week_through,bulletin,metric,value,availability,page,source_url,published_at,retrieved_at
```

Nilai: level national/province, kode string ID atau kode Kemendagri, original_label sesuai SKDR, year 2026, week_through 43, bulletin M44, metric confirmed_cases, value integer cacah, availability reported, halaman 36 untuk nasional/45 untuk provinsi, source_url HTTPS publikasi pemerintah/SKDR, published_at 2026-11-10, retrieved_at ISO bertanggal dan zona waktu. Jangan masukkan pemisah ribuan ke kolom value. Hanya data agregat; tidak ada kolom pasien. Skrip menolak label ambigu/tidak dikenal, kode yang tidak sesuai label, metadata berbeda dalam satu snapshot, duplikat unit/metrik, nilai tidak sah dan snapshot yang tidak berisi tepat 1 nasional + 38 provinsi lengkap. Pemetaan label menyimpan `originalLabel` dan kode resminya.

3. Jalankan dari root menggunakan Node ≥22 yang mendukung TypeScript stripping:

```sh
node --experimental-strip-types scripts/convert-skdr-indonesia.mjs /path/Prompt_Codex_MalariaScope_Indonesia.md /tmp/skdr-candidate.json
```

Skrip baru menulis setelah validasi lengkap lulus dan menyertakan SHA-256 lampiran. Periksa kandidat/diff serta jumlah/selisih aktual, kemudian ganti `public/data/indonesia/skdr/2026-m44.json` dalam perubahan data yang ditinjau. Skrip tidak menyatakan keaslian publikasi hanya karena host/struktur benar. Kandidat lengkap menggunakan `evidence: attachment-extraction`; runtime juga menerapkan validasi ketat untuk status itu. Pertahankan snapshot buletin lama saat menambahkan versi baru; daftarkan id baru dan uji pemulihannya, jangan mengganti angka lama diam-diam. 4. Untuk memeriksa kontrak snapshot yang saat ini tersedia:

```sh
node --experimental-strip-types scripts/convert-skdr-indonesia.mjs --check
```

Perintah ini membedakan kontrak struktural yang sah dari kelengkapan sumber. Pada snapshot parsial sekarang, kontrak sah tetapi pemeriksaan lengkap melaporkan metadata/lampiran yang belum tersedia.

## Pengujian

Jalankan `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Setelah build selesai, mulai preview port 4173 dan jalankan:

```sh
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/skdr-dashboard.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/browser.mjs
APP_URL=http://127.0.0.1:4173 CHROMIUM_PATH=/usr/bin/chromium node tests/surveilans-indonesia.mjs
```

Tes SKDR mencakup 38 unit provinsi, nilai yang disampaikan pengguna, ketidaktersediaan 35 angka, penjumlahan/selisih pada fixture sintetis lengkap, kode salah, duplikat baris snapshot, label tak dikenal, konversi Markdown, penyebut kosong, ekspor exact-level, URL/reload, snapshot tampilan, perpindahan kembali ke Papua, pemuatan gagal dan mobile. Bukti angka publik lengkap serta geometri resmi belum dapat dinyatakan lulus sebelum lampiran disediakan.

### Hasil aktual sesi ini

- Typecheck, lint dan production build: lulus.
- 227 tes unit: lulus, 0 gagal, 0 dilewati.
- Browser `skdr-dashboard.mjs`: lulus (termasuk perbaikan overflow tabel mobile dan retry setelah HTTP 503).
- Browser `browser.mjs`: lulus, tanpa page error pada alur riset lama.
- Browser `surveilans-indonesia.mjs`: lulus.
- Kontrak snapshot bawaan: sah secara struktur, tetap tidak lengkap secara bukti/angka; konverter menolak kelengkapan palsu. Angka publik 38 provinsi dan rekonsiliasi sumber lengkap belum terverifikasi.
- Seluruh suite browser lainnya/cross-browser tidak dijalankan.
