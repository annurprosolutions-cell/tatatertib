/**
 * Config.gs - pemalar dan skema (rujuk BSD seksyen 3 dan 6).
 * Tiada ID Sheet atau folder di sini. ID disimpan dalam Script Properties.
 */

const APP_NAME = 'Sistem Tatatertib';
const PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

const SHEETS = {
  REKOD: 'rekod_tatatertib',
  WHITELIST: 'admin_whitelist',
  AUDIT: 'audit_log',
  CONFIG: 'config'
};

// Susunan lajur mengikut BSD seksyen 3. Kod lain baca ikut NAMA header, bukan nombor lajur.
const HEADERS = {
  rekod_tatatertib: [
    'id', 'nama', 'ic', 'gred', 'skim', 'tpt_bertugas', 'negeri', 'salahlaku',
    'butiran_kes', 'tahun', 'keputusan_tatatertib', 'tarikh_kuatkuasa',
    'rayuan_tatatertib', 'status_semasa', 'created_at', 'created_by', 'updated_at'
  ],
  admin_whitelist: ['emel', 'nama', 'aktif'],
  audit_log: ['timestamp', 'emel', 'tindakan', 'rekod_id', 'butiran'],
  config: ['kunci', 'nilai']
};

const TINDAKAN = {
  CARIAN: 'CARIAN',
  LIHAT: 'LIHAT',
  TAMBAH: 'TAMBAH',
  KEMAS_KINI: 'KEMAS_KINI',
  CETAK_OPR: 'CETAK_OPR',
  LOG_MASUK: 'LOG_MASUK',
  AKSES_DITOLAK: 'AKSES_DITOLAK'
};

// Kunci config (nilai kosong, diisi kemudian). MOD ditambah untuk tanda dev/production (TRD seksyen 9).
const CONFIG_SEED = [
  ['TEMPLATE_OPR_ID', ''],
  ['FOLDER_PDF_ID', ''],
  ['MOD', 'dev']
];

/**
 * Senarai dropdown.
 * disahkan=false bermakna senarai ini PLACEHOLDER sehingga klien beri senarai rasmi (PRD soalan 3).
 * Placeholder dipasang sebagai amaran sahaja (allowInvalid) supaya data import Fasa 3 tidak disekat.
 * Ubah senarai di sini, kemudian run setupSystem() semula untuk kemas kini dropdown (data tidak terusik).
 */
const DROPDOWNS = {
  negeri: {
    disahkan: true,
    nilai: [
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
      'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
      'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'
    ]
  },
  status_semasa: { disahkan: false, nilai: ['Aktif', 'Dalam Rayuan', 'Selesai'] },
  gred: { disahkan: false, nilai: ['(ISI SENARAI GRED DARIPADA KLIEN)'] },
  skim: { disahkan: false, nilai: ['(ISI SENARAI SKIM DARIPADA KLIEN)'] },
  salahlaku: { disahkan: false, nilai: ['(ISI KATEGORI KESALAHAN DARIPADA KLIEN)'] },
  keputusan_tatatertib: { disahkan: false, nilai: ['(ISI JENIS HUKUMAN DARIPADA KLIEN)'] }
};

const RESPONSE_ERROR = {
  TIADA_KEBENARAN: 'Tiada kebenaran',
  BELUM_DISEDIAKAN: 'Sistem belum disediakan. Sila hubungi pentadbir.'
};
