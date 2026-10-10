# Audit machine learning MALARIASCOPE

Audit kode dan data, 10 Oktober 2026 (Asia/Bangkok). Dasar kode: main setelah PR #23, `83a8385`. Perubahan dalam PR ini memperbaiki protokol dan fitur lokal; tidak mengganti hasil studi yang diberikan, menyediakan data resmi, atau memvalidasi model untuk penggunaan klinis.

Temuan utama: aplikasi sudah memiliki pelatihan, inference JSON, workbench evaluasi dan monitoring. Kekurangan paling penting berikutnya adalah batas temporal backtesting, identitas model yang belum lengkap, pemilihan parameter, pembanding tanpa iklim, pemeriksaan hasil pelatihan, dan penilaian applicability. Model yang lebih kompleks tidak otomatis lebih baik.

## Bukti data yang tersedia

`public/data/verified/evidence-coverage.json` menyatakan panel seimbang 48 baris, delapan kabupaten, 2020–2025; lagged targets 40 baris. Metadata paket menyebut 53 outcome, tetapi berkas yang tersedia menyediakan 49. Tahun-tahun Supiori yang tidak diberikan tidak boleh diisi untuk menaikkan ukuran sampel. Manifest menyatakan sumber adalah ekstraksi studi pengguna, belum diaudit independen, dan lisensi redistribusi sumber belum ditentukan pemasok.

Jumlah tersebut adalah cakupan paket studi, **bukan** jumlah training setiap run baru. Pipeline melaporkan cohort sebenarnya, exclusions, training rows, holdout pairs dan data sesudah holdout yang diabaikan. Missing lagged climate mengecualikan baris dari common complete-case comparison, termasuk Persistence dan Ridge tanpa iklim. Ini menjaga pembanding adil tetapi membatasi cakupan. Hasil pengujian perubahan ini berasal dari fixture sintetis, bukan pelatihan ulang studi resmi.

## Kekurangan dan hasil perbaikan

P0 = dapat merusak interpretasi/keutuhan hasil. P1 = fungsi penelitian penting. P2 = pengembangan lanjutan.

| Prioritas | Fitur/temuan sebelum perubahan                                                    | Dampak                                                                                                     | Status dalam PR ini                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Rolling-origin melintasi semua tahun input, termasuk holdout dan tahun setelahnya | Pengguna dapat mengira seluruh evaluasi adalah validasi sebelum test                                       | Diperbaiki: outer backtest hanya sebelum holdout; future eligible rows dicatat terpisah                                                                   |
| P0        | Version artifact terutama mengikuti hash file, tahun, seed                        | Perubahan kode/parameter/library tidak terwakili; perubahan outcome test mengubah identitas walau fit sama | Diperbaiki: fit identity memuat training-cohort hash, fitur, parameter, seed, klasifikasi, environment dan hash kode; source-file hash tetap terpisah     |
| P0        | Tidak ada pemeriksaan matematis run.json di UI                                    | Angka laporan yang salah dapat ditampilkan sebagai metrik                                                  | Ditambahkan inspector v2: residual, absolute error, MAE, RMSE, R², bias dan median dicek dari pasangan; cohort dan selisih perbandingan juga dicek        |
| P1        | Hyperparameter selalu default                                                     | Tidak ada pemilihan yang dapat direproduksi pada panel baru                                                | Ditambahkan `--tune`: grid kecil, expanding-origin MAE sebelum holdout, default eksplisit jika kurang dari dua fold; nested selection pada outer backtest |
| P1        | Tidak ada Ridge tanpa iklim dalam pipeline baru                                   | Manfaat prediktor iklim tidak dapat dibandingkan pada cohort sama                                          | Ditambahkan Ridge satu fitur `cases_lag1`, dengan artefak/inference sendiri, pada common cohort yang sama                                                 |
| P1        | Interval MAE per model saja                                                       | Selisih model tidak dinilai sebagai pasangan district yang sama                                            | Ditambahkan 95% paired district percentile bootstrap versus Persistence dan Ridge tanpa iklim; tidak mengklaim superioritas independen                    |
| P1        | Tidak ada diagnostik kontribusi fitur model baru                                  | Formula risiko bukan penjelasan kemampuan prediksi ML                                                      | Ditambahkan held-out marginal permutation importance, mean perubahan MAE dan SD; tidak digunakan untuk tuning dan bukan efek kausal                       |
| P1        | Model import hanya menampilkan hash/fit akhir                                     | Pengguna sulit mengetahui konfigurasi dan rentang applicability                                            | Ditambahkan source/license declaration, training rows/period, selection trace, library/code versions, input ranges, dan peringatan extrapolation          |
| P1        | Validation period dan beberapa metadata artifact tidak diperiksa                  | JSON tidak sesuai dapat merusak UI atau inference                                                          | Guard diperketat: tipe/string/parameter/range/ensemble limits; finite preprocessing termasuk batas float32 tree                                           |
| P1        | CSV header/nama kabupaten belum diperiksa penuh                                   | Baris ambigu, kabupaten kosong dan duplikat beda kapitalisasi dapat diterima                               | Diperbaiki: header unik/wajib, panjang baris, district NFKC/whitespace/case identity, nilai finite dan domain yang tersedia                               |
| P1        | Direktori run yang sudah terisi dapat ditulis ulang                               | Hasil eksperimen terdahulu bisa hilang                                                                     | Diperbaiki: menolak direktori output nonempty; tidak mengubah dataset verified                                                                            |
| P1        | Hasil training belum bisa ditinjau sebagai evidence lokal tersimpan               | Pipeline dan UI terpisah; user mudah kehilangan konteks hasil                                              | Ditambahkan saved run inspector, ekspor, hapus terkonfirmasi, filter global year/district, pilihan model dan leaderboard dinamis                          |
| P1        | Library ML rusak dapat terlihat sebagai library kosong                            | Impor berikutnya berpotensi menghilangkan bukti lokal                                                      | Diperbaiki: raw values dipertahankan, import diblokir sampai recovery eksplisit, tersedia ekspor raw; captured runs masuk complete backup                 |

Pemeriksaan konsistensi tidak membuktikan kebenaran sumber, lisensi, ataupun otorisasi. Artefak legacy v1 tanpa provenance tetap dapat di-infer tetapi diberi batas applicability yang tidak diketahui. Laporan run v1 harus dibuat ulang dengan pipeline v2 karena protokol temporalnya tidak memenuhi kontrak inspector baru.

Tambahan: `--cases-only` menjalankan cohort tersendiri untuk Persistence/Ridge tanpa iklim dengan input `district,year,cases`. Climate tidak diimputasi dan model climate tidak dinyatakan tersedia. Run ini diberi label CASES ONLY; metriknya tidak boleh dicampur atau langsung dibandingkan dengan cohort climate yang berbeda.

## Fitur ML yang masih kurang setelah PR ini

| Prioritas                    | Kebutuhan                                                                                    | Apa yang diperlukan / mengapa belum dinyatakan selesai                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 sebelum klaim tervalidasi | Data resmi lengkap, denominator historis, lisensi dan rekonsiliasi outcome                   | Sumber/izin asli dan reviewer independen. Kode atau dummy tidak dapat menghasilkan bukti tersebut                                                                                                |
| P0 sebelum penggunaan nyata  | Validasi prospektif dan validasi eksternal                                                   | Prediksi dikunci sebelum target mulai, outcome lengkap yang diterima sesudahnya, dan cohort eksternal; hindcast bukan pengganti                                                                  |
| P1                           | Spatially blocked validation, leave-district-out dan buffered evaluation                     | Protokol geografis/weights yang dinyatakan, ukuran cohort yang cukup, serta evaluasi khusus wilayah baru. Temporal test saat ini hanya mendukung konteks kabupaten yang sudah dikenal            |
| P1                           | Interval prediksi dengan dasar kalibrasi yang lebih kuat                                     | Sampel calibration memadai dan protokol yang sesuai dependensi waktu/spasial. Band dari earlier fit yang diterapkan ke final refit tetap exploratory, tanpa jaminan nominal coverage             |
| P1                           | ML mingguan/bulanan dan fitur musiman                                                        | Observasi aktual dengan frekuensi/tanggal ketersediaan; rule surveillance periodik tidak sama dengan model ML periodik                                                                           |
| P1                           | Data-availability timestamps / publication lag / revision vintages                           | CSV annual tidak memuat tanggal rilis. Lag kalender satu tahun belum membuktikan predictor tersedia saat forecast diterbitkan                                                                    |
| P1 untuk layanan bersama     | Job training terautentikasi, progress/cancellation, resource limits dan scheduler retraining | Training saat ini CLI; service opsional hanya workspace/surveillance, bukan eksekusi pelatihan melalui browser. Production server belum tersedia                                                 |
| P2                           | Experiment tracking bersama dan registry lifecycle                                           | Capture lokal sudah ada; belum ada MLflow-equivalent, approval/promotion, champion/challenger deployment, metadata pencarian lintas pengguna atau rollback inference service                     |
| P2                           | Monitoring drift terkalibrasi dan performa menurut subkelompok                               | Descriptive matched-cohort shifts sudah ada; threshold significance, interval uncertainty, multiplicity dan sample-size policy harus dirancang/ditinjau                                          |
| P2                           | Model count/rate atau hierarchical spatiotemporal                                            | Poisson/negative binomial, population offsets dan model antarwilayah perlu dibandingkan dengan baselines menggunakan sumber memadai; tidak ditambahkan hanya agar daftar algoritma lebih panjang |
| P2                           | Robustness terhadap missingness, district size dan measurement error                         | No imputation saat ini. Metode imputasi/sensitivity/error-in-variables memerlukan train-only preprocessing dan evaluasi khusus, bukan pengisian diam-diam                                        |
| P2                           | Explainability lanjutan dan joint uncertainty                                                | SHAP/PDP/conditional permutation harus mempertimbangkan korelasi; importance saat ini marginal/descriptive. Risiko kausal dan counterfactual tidak dapat disimpulkan                             |

## Protokol yang dapat direproduksi

Input default wajib `district,year,cases,rainfall,temperature,humidity`; `--cases-only` hanya memerlukan `district,year,cases`. Fitur adalah kasus dan iklim dari tahun sebelumnya yang kontigu. Tahun outcome holdout tidak digunakan untuk scaler, fit, tuning atau pemilihan parameter. Predictor climate pada tahun outcome tidak digunakan. Target adalah **jumlah kasus**, bukan incidence, probabilitas individual atau rekomendasi klinis.

```sh
/workspace/malariascope-env/bin/python research/train.py authorized-panel.csv \
  --output research-output/new-run --test-year 2025 --seed 2025 --tune \
  --source 'Sumber berizin yang sebenarnya' --license 'Lisensi yang sebenarnya'
```

Grid: Ridge alpha 0.1/1/10; RF depth 3/5 dengan 100 trees; GB learning rate 0.05/0.1, depth 2, 100 estimators. Minimal fit delapan training rows, holdout tiga rows; tuning minimal dua eligible temporal folds. Pooling MAE memberi bobot sama per validation row, bukan per year. Urutan kandidat memecahkan tie secara deterministik. Mengubah metrik tampilan UI **tidak** mengubah objective tuning (MAE).

Setiap outer backtest menyeleksi parameter dari masa lalunya sendiri. Pemilihan final menggunakan pre-holdout rows; final holdout dievaluasi sekali. Leaderboard holdout adalah evaluasi, bukan keputusan otomatis untuk deployment. Mengulang pilihan konfigurasi setelah membaca test outcomes tetap dapat meng-overfit test set; library/code hashes membuat perubahan terlihat tetapi tidak mencegah perilaku tersebut.

`run.json` v2, `predictions.csv` dan empat artifact JSON (satu artifact Ridge untuk `--cases-only`) dihasilkan ke direktori baru. Predictions CSV kompatibel dengan Data Center, termasuk model no-climate. Full run memuat interval, perbandingan, importance, exclusions, selection trace dan environment. Bootstrap meresampling district pairs pada satu tahun; dependensi spasial membatasi interpretasinya. Feature permutation memakai holdout hanya sebagai diagnostik setelah selection. Input range adalah min/max training, **bukan** detektor OOD multivariat atau probabilitas confidence.

Di Model Laboratory atau Research Operations → Models: impor `run.json`, ubah primary metric, pilih year/district, inspeksi captured full-cohort diagnostics, kemudian impor artifact untuk exploratory inference. Run memiliki source hash sendiri dan tidak otomatis dicampurkan ke primary dataset. Saved runs disertakan dalam complete backup. Semua inferensi manual tetap berlabel **Scenario Output — Not Observed Data**.

## Bukti pengujian

- Test mutasi outcome/climate holdout dan tahun setelahnya: selection, backtest dan fitted predictions tetap sama.
- Test fit identity: perubahan konfigurasi/seed berbeda identitas; metadata source-file tetap terpisah dari fit.
- Reproducibility dua run identik; kesesuaian prediksi Python dan browser untuk Ridge full/no-climate, RF dan GB.
- Actual emitted run v2 diverifikasi dengan contract TypeScript, bukan hanya fixture UI.
- Invalid schema/nama/duplikat/CSV shape ditolak; tuning dengan fold kurang menggunakan default eksplisit; output nonempty tidak ditimpa.
- UI: metrik palsu ditolak, rank MAE/RMSE/R² berubah sesuai rumus/direction, filter global dan R² unavailable, peringatan applicability, recovery raw library, viewport mobile/tablet dan audit main-content accessibility.

Pemeriksaan ini menilai implementasi perangkat lunak. Tidak ada klaim bahwa hasil studi resmi telah direproduksi, model baru lebih unggul, atau artefak siap deployment.
