# Bandingkan Dua Wilayah

Pada GIS Surveilans Indonesia, buka Profil Wilayah 360°, lalu pilih **Tetapkan sebagai A**. Pilih wilayah lain melalui pencarian, peta, atau pemilih wilayah dan gunakan **Tetapkan sebagai B**. Kedua kolom menampilkan identitas, jenjang, indikator, angka/status, periode, sumber, versi dan cakupan data. Angka induk provinsi tidak dipakai sebagai pengganti angka kabupaten/kota yang kosong.

**Tukar A/B** membalik urutan dan penyebut persentase. **Hapus A/B** mengosongkan satu kolom; **Kembali ke wilayah tunggal** menghapus kedua pilihan tanpa mengubah wilayah yang sedang dibuka. Pilihan perbandingan tidak berubah saat pengguna menelusuri wilayah lain.

Selisih dihitung sebagai B − A hanya ketika jenjang, indikator, satuan, periode dan definisi/versi sumber cocok serta kedua angka tersedia. Perubahan relatif adalah `(B − A) / A × 100` hanya untuk A > 0. Untuk A = 0, selisih absolut tetap ditampilkan dengan status **Persentase tidak dapat dihitung**. Perbandingan berbeda konteks tetap menampilkan masing-masing angka dan alasan mengapa selisih tidak dihitung. SKDR kumulatif dan SISMAL tahunan tetap terpisah. Angka parsial tetap berlabel parsial; kesebandingan tidak membuktikan kelengkapan atau verifikasi ilmiah.

URL publik menyimpan `compareA` dan `compareB`, masing-masing referensi JSON berisi kode wilayah, seri sumber, tahun, snapshot dan versi. Angka tidak diambil dari URL atau localStorage: saat dibuka ulang, snapshot dimuat dan divalidasi memakai kontrak sumber yang sama. Versi yang hilang/berubah ditandai tidak tersedia dan tidak diganti dengan angka edisi terbaru. Query wilayah dan konteks lain dipertahankan. Referensi tidak sah dapat dihapus melalui kolomnya.

Peta menampilkan label permanen A/B beserta nama wilayah pada geometri berkode yang tersedia. Bingkai peta mencakup kedua geometri; label mengarahkan pembaca ke angka/periode di kolomnya agar tidak mencampur konteks layer aktif dengan pilihan tersimpan. Paket publik saat ini hanya memiliki geometri studi Papua, bukan batas seluruh provinsi/kabupaten Indonesia. Pilihan tanpa geometri diberi keterangan eksplisit; bentuk atau posisi wilayah tidak dibuat-buat. Data perbandingan tetap tersedia melalui kolom.

## Validasi

Dari root repository, jalankan `npm run typecheck`, `npm run lint`, `npm test`, dan `npm run build`. Mulai preview pada port 4173 lalu jalankan:

```sh
APP_URL=http://127.0.0.1:4173 node tests/region-comparison.mjs
APP_URL=http://127.0.0.1:4173 node tests/region-360.mjs
```

Suite perbandingan menguji desktop/seluler, dua provinsi pada snapshot sama, jenjang berbeda, data kosong, angka nol, pergantian sumber/periode, tukar, hapus, kembali ke wilayah tunggal, label peta, dan pemulihan setelah reload. Geometri provinsi dan nilai nol pada suite adalah fixture khusus pengujian, bukan data publik. Unit test memeriksa setiap dimensi kesebandingan dan validasi referensi URL secara terpisah.
