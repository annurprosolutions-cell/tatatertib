# Sistem Tatatertib (Google Apps Script)

Ikut dokumen PRD/TRD/AFD-DBD/BSD/IPD. Status: **Fasa 0 dan Fasa 1 siap**.

## Struktur
- `src/` : fail Apps Script (`.gs`, `.html`, `appsscript.json`). Copy-paste ke projek, atau guna `clasp push` dari folder ini.
- `test/run.js` : ujian logic dengan mock (`node test/run.js`).

## Deploy Fasa 0 dan 1
1. Dalam akaun Google klien: cipta folder `RuzTatatertib`, cipta Google Sheet di dalamnya.
2. Extensions > Apps Script. Masukkan semua fail dalam `src/` (nama fail sama, `.gs` jadi Script, `.html` jadi HTML).
3. Pilih `setupSystem`, klik Run, benarkan akses. Semak 4 tab: `rekod_tatatertib`, `admin_whitelist`, `audit_log`, `config`.
4. Tambah 3 admin lain dalam `admin_whitelist` (emel, nama, tick `aktif`).
5. Deploy > New deployment > Web app. Execute as: Me. Akses: ikut keputusan (lihat nota di bawah).
6. Test: buka URL dengan akaun admin (masuk) dan akaun bukan whitelist (Tiada kebenaran). Semak `audit_log`.

## Nota penting: emel pelawat
`Session.getActiveUser().getEmail()` hanya dipercayai bila pelawat dalam domain Workspace yang sama dengan pemilik skrip.
Dengan Gmail peribadi + "Execute as: Me", emel pelawat lain mungkin kosong. Kod ini **fail closed**: emel kosong = ditolak.
Kalau semasa test akaun admin kedua ditolak walaupun ada dalam whitelist, pilihan: (a) guna Workspace dan akses "domain", atau
(b) tukar ke "Execute as: User accessing the web app" dan share Sheet kepada 4 admin sahaja.

## Dropdown
Negeri (16) sudah lengkap. Gred, skim, salahlaku, keputusan_tatatertib dan status_semasa masih placeholder dalam
`src/Config.gs` (`DROPDOWNS`). Kemas kini bila klien beri senarai, lalu run `setupSystem()` semula.
