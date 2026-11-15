/**
 * Config.gs - pemalar dan skema (rujuk BSD seksyen 3 dan 6).
 * Tiada ID Sheet atau folder di sini. ID disimpan dalam Script Properties dan tab config.
 *
 * PERATURAN FAIL: fail .gs lain dimuatkan ikut urutan fail, jadi kod di luar fungsi
 * (top-level) tidak boleh merujuk pemalar daripada fail lain. Rujuk hanya di dalam fungsi.
 */

const APP_NAME = 'Sistem Tatatertib';
const PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';
const TZ_SISTEM = 'Asia/Kuala_Lumpur';

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

// Nilai tindakan mengikut BSD seksyen 3 (audit_log). Import dicatat sebagai TAMBAH dengan butiran "IMPORT: ...".
const TINDAKAN = {
  CARIAN: 'CARIAN',
  LIHAT: 'LIHAT',
  TAMBAH: 'TAMBAH',
  KEMAS_KINI: 'KEMAS_KINI',
  CETAK_OPR: 'CETAK_OPR',
  LOG_MASUK: 'LOG_MASUK',
  AKSES_DITOLAK: 'AKSES_DITOLAK'
};

/**
 * Kunci tab config. Nilai kosong diisi kemudian.
 * - TEMPLATE_OPR_ID, FOLDER_PDF_ID: diisi oleh setupOpr().
 * - MOD: dev atau production (papar tanda UJIAN dalam sistem jika bukan production).
 * - EMEL_IMPORT: senarai emel (asing dengan koma) yang dibenarkan import. Kosong = semua admin.
 */
const CONFIG_SEED = [
  ['TEMPLATE_OPR_ID', ''],
  ['FOLDER_PDF_ID', ''],
  ['MOD', 'dev'],
  ['EMEL_IMPORT', '']
];

/**
 * Senarai dropdown.
 * disahkan=true : strict. Hanya nilai dalam senarai diterima.
 * disahkan=false: senarai belum dimuktamadkan klien (PRD soalan terbuka 3). Borang menerima
 *                 teks bebas dengan cadangan (senarai ini + nilai sedia ada dalam Sheet), dan
 *                 ejaan yang sama (beza huruf besar/kecil atau ruang) disatukan secara automatik.
 * Bila klien beri senarai rasmi: isi nilai, tukar disahkan kepada true, run setupSystem() semula.
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
  gred: { disahkan: false, nilai: [] },
  skim: { disahkan: false, nilai: [] },
  salahlaku: { disahkan: false, nilai: [] },
  keputusan_tatatertib: { disahkan: false, nilai: [] }
};

/**
 * 13 medan rekod (BSD seksyen 3) untuk borang, validasi dan import.
 * jenis: text | textarea | ic | tahun | tarikh | pilihan
 */
const FIELDS = [
  { key: 'nama', label: 'Nama penuh', jenis: 'text', wajib: true, maks: 200 },
  { key: 'ic', label: 'No. kad pengenalan', jenis: 'ic', wajib: true },
  { key: 'gred', label: 'Gred', jenis: 'pilihan', wajib: true },
  { key: 'skim', label: 'Skim', jenis: 'pilihan', wajib: true },
  { key: 'tpt_bertugas', label: 'Tempat bertugas', jenis: 'text', wajib: true, maks: 200 },
  { key: 'negeri', label: 'Negeri', jenis: 'pilihan', wajib: true },
  { key: 'salahlaku', label: 'Salah laku', jenis: 'pilihan', wajib: true },
  { key: 'butiran_kes', label: 'Butiran kes', jenis: 'textarea', wajib: false, maks: 2000 },
  { key: 'tahun', label: 'Tahun', jenis: 'tahun', wajib: true },
  { key: 'keputusan_tatatertib', label: 'Keputusan tatatertib', jenis: 'pilihan', wajib: true },
  { key: 'tarikh_kuatkuasa', label: 'Tarikh kuat kuasa', jenis: 'tarikh', wajib: true },
  { key: 'rayuan_tatatertib', label: 'Rayuan tatatertib', jenis: 'text', wajib: false, maks: 200 },
  { key: 'status_semasa', label: 'Status semasa', jenis: 'pilihan', wajib: true, lalai: 'Aktif' }
];

const HAD = {
  CARIAN_MIN: 2,
  CARIAN_MAKS_AKSARA: 100,
  CARIAN_MAKS_HASIL: 500,
  TAHUN_MIN: 1950,
  PILIHAN_TEKS_MAKS: 200,
  AUDIT_SAIZ_HALAMAN: 25,
  AUDIT_BACA_MAKS: 20000,
  CSV_MAKS_AKSARA: 5000000,
  CSV_MAKS_BARIS: 20000,
  LAPORAN_SENARAI_MAKS: 1000
};

const RESPONSE_ERROR = {
  TIADA_KEBENARAN: 'Tiada kebenaran',
  BELUM_DISEDIAKAN: 'Sistem belum disediakan. Sila hubungi pentadbir.',
  RALAT_UMUM: 'Ralat sistem. Sila cuba lagi atau hubungi pentadbir.',
  SIBUK: 'Sistem sedang digunakan oleh admin lain. Sila cuba sekali lagi dalam beberapa saat.'
};
