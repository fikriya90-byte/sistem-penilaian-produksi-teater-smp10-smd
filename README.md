# SP-PPT — Sistem Penilaian & Manajemen Produksi Teater

SMP Negeri 10 Samarinda · Kelas IX · Seni Budaya & Teater

## Fitur

### Fondasi
- Login multi-role (Siswa / Guru / Admin) via Firestore tanpa Firebase Auth
- Session disimpan di `localStorage`, expired 8 jam
- Password di-hash **SHA-256 + salt** (bukan plaintext)
- Dashboard dinamis per role
- PWA offline-ready (service worker v2.1.0)
- Dark-mode-first

### Penilaian
- 4 tahapan: Persiapan, Pelaksanaan, Pertunjukan, Pasca
- 3 penilai: Guru 50%, Ketua 30%, Rekan 20% (auto-normalisasi)
- Batch penilaian, revisi dengan history, moderasi + deteksi anomali
- Radar/Bar/Tren chart (Chart.js)
- Rapor PDF dengan kop resmi + QR verifikasi (jsPDF + html2canvas)

### Manajemen Produksi
- **Jadwal**: Kalender + Master Schedule timeline + Booking alat (deteksi bentrok + approval)
- **Absensi**: Sesi dengan aturan pembuat ketat + statistik + grid presensi + export CSV
- **Checklist**: 10+ template per peran, kanban drag-drop, verifikasi, rating bintang, upload bukti
- **Broadcast**: Aturan target per peran + WA follow-up + template + jadwal
- **Struktur**: Baca dari `users` + fallback `classes.students`
- **Arsip**: Dokumen dari koleksi `informasi`
- **Aduan**: Anonim + WA guru + prioritas Bullying/Keamanan
- **Notifikasi**: 7 jenis realtime + filter + mark-all-read

### Panel Peran Khusus
- **Sutradara**: Visi artistik, casting, catatan harian, penilaian pemain
- **Asisten**: Prompt book (blocking grid 3×3), catatan, standby cue live
- **Koordinator**: 6 divisi dinamis
- **Pemain**: Naskah digital, latihan 10 langkah, rekam suara (MediaRecorder), blocking, refleksi

### Admin/Guru
- Export XLSX multi-sheet (Nilai, Absensi, Tugas)
- Import siswa dari Excel + hash password otomatis
- Migrasi `classes.students` → `users` (button di panel admin)
- Backup JSON semua koleksi
- Restore dari file JSON
- Log sistem

## Setup Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/) → project `penilaian-proyek-teater-siswa`
2. Aktifkan **Firestore Database** (production mode)
3. Copy isi `firestore.rules` ke Rules Firestore → **Publish**
4. Import `firestore.indexes.json` via CLI: `firebase deploy --only firestore:indexes`
   Atau buat manual sesuai file.

### Struktur Koleksi Firestore