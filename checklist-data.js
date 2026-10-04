/**
 * SP-PPT — Template Checklist Default Per Peran
 */

export const CHECKLIST_PER_PERAN = {
  "Pimpinan Produksi": [
    { nama: "Menyusun jadwal & alur kerja produksi", tahapan: "persiapan", prioritas: "Tinggi" },
    { nama: "Membagi tugas ke koordinator divisi", tahapan: "persiapan", prioritas: "Tinggi" },
    { nama: "Memimpin rapat koordinasi mingguan", tahapan: "pelaksanaan", prioritas: "Sedang" },
    { nama: "Monitoring progres 6 divisi", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Menyusun LPJ akhir produksi", tahapan: "pasca", prioritas: "Kritis" },
    { nama: "Broadcast pengumuman penting", tahapan: "pelaksanaan", prioritas: "Sedang" },
  ],
  Sekretaris: [
    { nama: "Membuat presensi setiap rapat/latihan", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Mengarsipkan dokumen produksi", tahapan: "pelaksanaan", prioritas: "Sedang" },
    { nama: "Menyusun jadwal kegiatan", tahapan: "persiapan", prioritas: "Tinggi" },
    { nama: "Kompilasi laporan divisi", tahapan: "pasca", prioritas: "Tinggi" },
  ],
  Bendahara: [
    { nama: "Menyusun RAB produksi", tahapan: "persiapan", prioritas: "Kritis" },
    { nama: "Mencatat pengeluaran harian", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Mengumpulkan nota pembelian", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Menyusun laporan keuangan", tahapan: "pasca", prioritas: "Kritis" },
  ],
  Sutradara: [
    { nama: "Memahami naskah secara mendalam", tahapan: "persiapan", prioritas: "Kritis" },
    { nama: "Casting pemain sesuai karakter", tahapan: "persiapan", prioritas: "Kritis" },
    { nama: "Latihan blocking adegan 1", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Latihan blocking adegan 2", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Evaluasi akting pemain", tahapan: "pelaksanaan", prioritas: "Tinggi" },
  ],
  "Asisten Sutradara": [
    { nama: "Membuat prompt book digital", tahapan: "persiapan", prioritas: "Tinggi" },
    { nama: "Mencatat blocking per adegan", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Menyusun cue sheet", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Standby cue saat pementasan", tahapan: "pertunjukan", prioritas: "Kritis" },
  ],
  Pemain: [
    { nama: "Baca naskah lengkap", tahapan: "persiapan", prioritas: "Kritis" },
    { nama: "Hafal dialog adegan 1", tahapan: "pelaksanaan", prioritas: "Kritis" },
    { nama: "Hafal dialog adegan 2", tahapan: "pelaksanaan", prioritas: "Kritis" },
    { nama: "Latihan blocking dengan asisten", tahapan: "pelaksanaan", prioritas: "Tinggi" },
    { nama: "Tampil maksimal saat pertunjukan", tahapan: "pertunjukan", prioritas: "Kritis" },
  ],
};

// Fallback default untuk koordinator/anggota
const DEFAULT_ANGGOTA = [
  { nama: "Bantu persiapan divisi", tahapan: "persiapan", prioritas: "Sedang" },
  { nama: "Kerjakan tugas sesuai arahan koordinator", tahapan: "pelaksanaan", prioritas: "Tinggi" },
  { nama: "Hadiri latihan/rapat divisi", tahapan: "pelaksanaan", prioritas: "Sedang" },
  { nama: "Rapikan & kembalikan alat", tahapan: "pasca", prioritas: "Sedang" },
];

[
  "Koordinator Perlengkapan", "Anggota Perlengkapan",
  "Koordinator Publikasi & Dokumentasi", "Anggota Publikasi & Dokumentasi",
  "Koordinator Tata Panggung", "Anggota Tata Panggung",
  "Koordinator Tata Rias", "Anggota Tata Rias",
  "Koordinator Tata Busana", "Anggota Tata Busana",
  "Koordinator Tata Musik & Suara", "Anggota Tata Musik & Suara",
].forEach((p) => {
  if (!CHECKLIST_PER_PERAN[p]) CHECKLIST_PER_PERAN[p] = DEFAULT_ANGGOTA;
});

export const STATUS_LIST = ["Belum Dikerjakan", "Sedang Dikerjakan", "Selesai", "Terlewat"];
export const KANBAN_KOLOM = [
  { id: "Belum Dikerjakan", label: "To Do", icon: "radio_button_unchecked", warna: "bg-gray-500" },
  { id: "Sedang Dikerjakan", label: "In Progress", icon: "autorenew", warna: "bg-blue-500" },
  { id: "Selesai", label: "Done", icon: "check_circle", warna: "bg-green-500" },
  { id: "Terlewat", label: "Blocked", icon: "block", warna: "bg-red-500" },
];
