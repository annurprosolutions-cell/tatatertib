# Sistem Tatatertib (Google Apps Script + Google Sheets)

Dibina mengikut PRD, TRD, AFD-DBD, BSD dan IPD.

**Status:** Fasa 0 hingga 6 siap (kod dan ujian automatik). **Fasa 7 (ujian dalam akaun klien, deploy, serahan) belum dibuat.**
Semua ujian automatik berjalan terhadap tiruan (mock) Apps Script. Perkara yang hanya boleh disahkan dalam akaun Google sebenar
disenaraikan di bahagian [Senarai semak persekitaran sebenar](#senarai-semak-persekitaran-sebenar).

## Fasa dan skrin

| Fasa | Isi | Skrin | Fail utama |
|------|-----|-------|-----------|
| 0 | `setupSystem()`: 4 tab, header, dropdown, whitelist, perlindungan Sheet | - | `Setup.gs`, `Config.gs` |
| 1 | Login Google, whitelist, akses ditolak | S-01 | `Auth.gs`, `Code.gs`, `Denied.html` |
| 2 | Carian, tambah dan kemas kini rekod | S-02 hingga S-05 | `Records.gs`, `JsCari/JsProfil/JsBorang.html` |
| 3 | Import CSV dengan pemetaan lajur, standardisasi nilai, semakan duplikasi | S-09 | `Import.gs`, `JsImport.html` |
| 4 | Dashboard (Chart.js) | S-06 | `Dashboard.gs`, `JsDashboard.html` |
| 5 | Cetak OPR (template Google Docs ke PDF ke folder Drive) | S-07 | `Opr.gs`, `JsOpr.html` |
| 6 | Paparan audit log | S-08 | `AuditView.gs`, `JsAudit.html` |

`Api.gs` ialah satu-satunya senarai fungsi yang boleh dipanggil dari browser. Setiap fungsi di situ bermula dengan semakan whitelist.
Ujian automatik memastikan tiada fungsi lain boleh dipanggil dari browser.

## Struktur

```
src/        fail Apps Script (.gs, .html, appsscript.json)
test/       ujian automatik dan mock Apps Script
```

## Deploy

Pilih satu cara untuk meletakkan fail dalam projek Apps Script.

**Cara A: clasp (disyorkan, kira-kira 20 fail)**

1. Dalam akaun Google klien: cipta folder `RuzTatatertib` dan satu Google Sheet di dalamnya.
2. Sheet > Extensions > Apps Script. Dalam Project Settings, salin Script ID.
3. Dalam folder repo ini:
   ```bash
   npm install -g @google/clasp
   clasp login
   echo '{"scriptId":"ISI_SCRIPT_ID","rootDir":"src"}' > .clasp.json
   clasp push
   ```

**Cara B: salin tampal.** Cipta fail dengan nama yang sama seperti dalam `src/` (`.gs` jadi Script, `.html` jadi HTML).
Dalam Project Settings, tanda "Show appsscript.json manifest file in editor" dan salin kandungan `appsscript.json`.

Selepas fail masuk:

1. Pilih `setupSystem` dalam dropdown Run, klik Run, benarkan akses. Semak 4 tab: `rekod_tatatertib`, `admin_whitelist`, `audit_log`, `config`.
2. Dalam `admin_whitelist`, isi emel dan nama admin lain pada baris kosong dan tanda kotak `aktif`.
3. Run `setupOpr` (benarkan akses Drive dan Docs). Ia cipta folder `RuzTatatertib/OPR` dan template OPR lalai, dan menyimpan ID dalam tab `config`.
   Kongsi folder OPR dengan 4 admin sahaja. Jangan guna "anyone with the link".
4. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone** (atau domain agensi jika Workspace).
5. Dalam tab `config`, tukar `MOD` kepada `production` bila sedia. Selagi bukan `production`, tanda UJIAN dipaparkan di header.

Selepas kemas kini kod: Deploy > Manage deployments > Edit > Version: New version. Jika skop baharu diminta, run sebarang fungsi dari editor dan benarkan.

**Jika `setupSystem` versi Fasa 0 lama sudah pernah dijalankan:** run versi baharu. Versi lama menggunakan `insertCheckboxes()` yang
menetapkan semua tanda `aktif` kepada FALSE. Versi baharu membaiki keadaan itu (seed semula admin pemilik, bersihkan FALSE berselerak) dan tidak lagi
menyahaktifkan admin bila dijalankan berulang kali.

## Tab config

| Kunci | Fungsi |
|-------|--------|
| `TEMPLATE_OPR_ID` | ID dokumen Google Docs template OPR. Diisi `setupOpr()`. Letak ID template rasmi klien di sini jika ada |
| `FOLDER_PDF_ID` | ID folder untuk PDF OPR. Diisi `setupOpr()` |
| `MOD` | `dev` atau `production` |
| `EMEL_IMPORT` | Emel (asing dengan koma) yang dibenarkan import. Kosong bermaksud semua admin. Selepas migrasi siap, letak satu emel sahaja untuk mengunci |

Tempat letak dalam template OPR: `{{nama}} {{ic}} {{gred}} {{skim}} {{tpt_bertugas}} {{negeri}} {{salahlaku}} {{tahun}}
{{keputusan_tatatertib}} {{tarikh_kuatkuasa}} {{rayuan_tatatertib}} {{status_semasa}} {{tarikh_cetak}}`.
`{{butiran_kes}}` sentiasa dikosongkan walaupun ada dalam template (BSD: butiran kes tidak dipaparkan dalam OPR).

## Dropdown

Negeri (16) ialah senarai tertutup. Gred, skim, salah laku, keputusan tatatertib dan status semasa belum disahkan klien, jadi borang menerima teks bebas
dengan cadangan daripada data sedia ada, dan ejaan yang beza huruf besar/kecil atau ruang disatukan secara automatik.
Bila klien beri senarai rasmi: isi `DROPDOWNS` dalam `src/Config.gs`, tukar `disahkan` kepada `true`, push, dan run `setupSystem()` semula.
Skrin Import memaparkan semua nilai unik daripada fail lama dan membolehkan admin menyatukan variasi sebelum import.

## Ujian automatik

```bash
node test/run.js      # 83 ujian logic server (Fasa 0 hingga 6)
node test/e2e.js      # 26 langkah UI dalam Chromium (Playwright dipasang secara global)
```

Pilihan untuk `e2e.js`: `CHARTJS_PATH` (salinan `chart.umd.js` untuk menggantikan CDN), `AXE_PATH` (`axe.min.js`, menjalankan semakan aksesibiliti WCAG 2.1 A/AA),
`SHOT_DIR` (folder tangkapan skrin).

## Senarai semak persekitaran sebenar

Mock tidak boleh mengesahkan perkara berikut. Semak semasa Fasa 7:

1. **Emel pelawat dikesan untuk admin kedua.** `Session.getActiveUser().getEmail()` dengan "Execute as: Me" hanya dipercayai untuk pelawat dalam domain Workspace yang sama.
   Kod ini fail-closed: emel kosong ditolak. Jika admin kedua ditolak walaupun ada dalam whitelist, guna Workspace dengan akses domain, atau tukar ke
   "Execute as: User accessing" dan kongsi Sheet kepada 4 admin sahaja.
2. `setupSystem` tidak memberi amaran zon masa. Buka rekod dengan tarikh kuat kuasa 15/03/2013 dan pastikan Sheet dan sistem sama-sama papar 15/03/2013.
3. IC dengan sifar di depan (contoh `050101145678`) kekal 12 digit dalam Sheet, carian dan import.
4. Cetak OPR: masa jana (sasaran PRD: 10 saat), PDF satu halaman, ruang tandatangan dan cop kosong, fail muncul dalam folder OPR, butiran kes tiada.
   Jika template rasmi klien digunakan, semak susun atur.
5. Muat turun PDF dan "Buka untuk cetak" berfungsi dalam Chrome, Edge dan pelayar telefon (di dalam iframe Apps Script).
6. Chart.js dimuat dalam rangkaian pejabat. Jika CDN disekat, dashboard jatuh kepada bar ringkas dan jadual angka, jumlah tetap betul.
7. Import data sebenar (kira-kira 650 rekod): masa, jumlah sebelum dan selepas sepadan, laporan duplikat.
8. Dua admin menyimpan serentak: yang kedua nampak mesej "sistem sibuk" atau "rekod diubah oleh pengguna lain", tiada data hilang.
9. Admin biasa tidak boleh edit tab `audit_log`, `admin_whitelist` dan `config` terus dalam Sheet.
10. Kuota Apps Script untuk penukaran PDF pada akaun Gmail percuma (TRD seksyen 7).

## Keputusan reka bentuk yang perlu klien tahu

- **IC unik (BSD).** Seorang pegawai hanya boleh ada satu baris. Jika ada pegawai yang sama dengan lebih daripada satu kes, baris kedua ditolak semasa import dan borang.
  Perlu keputusan klien (lihat soalan di bawah).
- **Tiada fungsi padam rekod.** AFD tidak mempunyai aliran padam dan audit_log tidak mempunyai tindakan padam.
- **Import dicatat sebagai `TAMBAH`** dengan butiran bermula `IMPORT:`, supaya nilai `tindakan` kekal seperti BSD.
- **OPR dijana bila admin menekan "Jana PDF"**, bukan semasa skrin dibuka. Satu klik menghasilkan satu fail dan satu baris `CETAK_OPR`.
  Pratonton maklumat dipaparkan sebelum itu.
- **Akses ditolak dicatat sekali seminit bagi setiap emel** supaya log tidak dibanjiri oleh percubaan berulang.
- **Konflik suntingan:** jika dua admin mengedit rekod sama, yang kedua diminta muat semula.
- **Audit log tidak menyimpan nama pegawai.** Skrin audit mencari nama daripada `rekod_id` semasa paparan.
- Baris yang ditaip terus dalam Sheet tanpa `id` diberi `id` secara automatik semasa dibaca, supaya tidak terlepas daripada carian. Laluan yang disokong tetap borang dan import.
- Tab `config` ditambah kunci `MOD` dan `EMEL_IMPORT` (tiada perubahan pada skema tab).

## Soalan terbuka untuk klien

1. Workspace (domain rasmi) atau Gmail peribadi? Menentukan kaedah akses (semakan 1 di atas).
2. Template OPR rasmi dan contoh laporan.
3. Senarai rasmi gred, skim, jenis kesalahan, jenis hukuman dan status.
4. Siapa pemilik akaun Google dan Sheet.
5. Bolehkah seorang pegawai mempunyai lebih daripada satu kes? Jika ya, peraturan IC unik perlu diubah (perubahan skema).
6. Tempoh retention rekod dan jadual backup mingguan.
