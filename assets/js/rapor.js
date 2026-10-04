/**
 * SP-PPT — Rapor PDF
 * Generate rapor dengan kop resmi + QR
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, collection, query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { protectPage } from "./router.js";
import { showToast, esc, formatTanggal, logActivity } from "./utils.js";

const LOGO_SEKOLAH = "https://iili.io/nBiviCX.png";
const LOGO_MAPEL = "https://iili.io/nap50AB.png";

let ME = null;

const KRITERIA_PEMAIN = [
  { nama: "Hafalan Dialog", bobot: 20 },
  { nama: "Penjiwaan Karakter", bobot: 25 },
  { nama: "Proyeksi Suara & Intonasi", bobot: 15 },
  { nama: "Blocking & Movement", bobot: 15 },
  { nama: "Interaksi Panggung", bobot: 15 },
  { nama: "Kedisiplinan", bobot: 10 },
];

function skorKeNilai(s) {
  return { 4: 100, 3: 80, 2: 60, 1: 40 }[s] || 0;
}

function predikat(n) {
  if (n >= 90) return { huruf: "A", label: "Mahir, teladan" };
  if (n >= 80) return { huruf: "B", label: "Kompeten, andal" };
  if (n >= 70) return { huruf: "C", label: "Memenuhi standar" };
  if (n >= 60) return { huruf: "D", label: "Perlu perbaikan" };
  return { huruf: "E", label: "Tidak memenuhi" };
}

async function renderRapor(targetUid) {
  const uSnap = await getDoc(doc(db, "users", targetUid));
  if (!uSnap.exists()) { showToast("Siswa tidak ditemukan.", "error"); return; }
  const siswa = uSnap.data();

  let penilaian = [];
  try {
    const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", targetUid)));
    penilaian = pSnap.docs.map((d) => d.data());
  } catch (e) {
    console.warn("[Rapor] penilaian gagal:", e);
  }

  const tahapLabel = { persiapan: "Persiapan", pelaksanaan: "Pelaksanaan", pertunjukan: "Pertunjukan", pasca: "Pasca" };
  const nilaiPerTahap = { persiapan: 0, pelaksanaan: 0, pertunjukan: 0, pasca: 0 };

  Object.keys(nilaiPerTahap).forEach((t) => {
    const arr = penilaian.filter((p) => p.tahapan === t);
    if (!arr.length) return;
    let total = 0;
    arr.forEach((p) => {
      let t2 = 0, tb = 0;
      (p.nilai || []).forEach((n) => {
        const kr = KRITERIA_PEMAIN.find((x) => x.nama === n.kriteria) || { bobot: 10 };
        t2 += skorKeNilai(n.skor) * kr.bobot;
        tb += kr.bobot;
      });
      if (tb) total += t2 / tb;
    });
    nilaiPerTahap[t] = total / arr.length;
  });

  const bobot = { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 };
  const nilaiAkhir = Object.keys(nilaiPerTahap).reduce((s, t) => s + nilaiPerTahap[t] * bobot[t] / 100, 0);
  const pred = predikat(nilaiAkhir);

  const breakdown = { guru: [], ketua: [], rekan: [] };
  penilaian.forEach((p) => { if (breakdown[p.jenisPenilai]) breakdown[p.jenisPenilai].push(p); });

  const hitungRata = (arr) => {
    if (!arr.length) return 0;
    return arr.reduce((s, p) => {
      const kr = KRITERIA_PEMAIN;
      let t2 = 0, tb = 0;
      (p.nilai || []).forEach((n) => {
        const k = kr.find((x) => x.nama === n.kriteria) || { bobot: 10 };
        t2 += skorKeNilai(n.skor) * k.bobot; tb += k.bobot;
      });
      return s + (tb ? t2 / tb : 0);
    }, 0) / arr.length;
  };

  const nilaiGuru = hitungRata(breakdown.guru);
  const nilaiKetua = hitungRata(breakdown.ketua);
  const nilaiRekan = hitungRata(breakdown.rekan);

  const komentars = [];
  penilaian.forEach((p) => (p.nilai || []).forEach((n) => n.komentar && komentars.push(n.komentar)));

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(location.origin + "/rapor.html?uid=" + targetUid)}`;

  const el = document.getElementById("rapor-content");
  if (!el) return;

  el.innerHTML = `
    <div class="border-b-4 border-double border-black pb-3 mb-6">
      <div class="flex items-center gap-4">
        <img src="${LOGO_SEKOLAH}" alt="" class="w-20 h-20 object-contain" />
        <div class="flex-1 text-center">
          <p class="text-sm font-medium">PEMERINTAH KOTA SAMARINDA</p>
          <p class="text-sm font-medium">DINAS PENDIDIKAN DAN KEBUDAYAAN</p>
          <p class="text-xl font-bold">SMP NEGERI 10 SAMARINDA</p>
          <p class="text-[10px]">Jl. Teuku Umar No. 10, Karang Anyar, Sungai Kunjang, Samarinda, Kaltim</p>
        </div>
        <img src="${LOGO_MAPEL}" alt="" class="w-20 h-20 object-contain" />
      </div>
    </div>

    <h2 class="text-center font-bold text-base mb-1">RAPOR KOMPREHENSIF PRODUKSI PEMENTASAN TEATER (SP-PPT)</h2>
    <p class="text-center text-xs mb-6">TAHUN AJARAN 2025/2026</p>

    <table class="w-full text-xs mb-5">
      <tbody>
        <tr><td class="py-1 w-40 font-medium">Nama</td><td>: <b>${esc(siswa.nama)}</b></td></tr>
        <tr><td class="py-1 font-medium">NIS</td><td>: ${esc(siswa.nis || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Kelas</td><td>: ${esc(siswa.kelas || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Peran Utama</td><td>: <b>${esc(siswa.peran)}</b></td></tr>
        <tr><td class="py-1 font-medium">Divisi</td><td>: ${esc(siswa.divisi || "-")}</td></tr>
        <tr><td class="py-1 font-medium">Status Kelulusan</td><td>: <b>${nilaiAkhir >= 60 ? "LULUS" : "PERLU PERBAIKAN"}</b></td></tr>
      </tbody>
    </table>

    <div class="border-2 border-black p-4 mb-5 flex items-center gap-6">
      <div class="text-center flex-1">
        <p class="text-xs">NILAI AKHIR KOMPOSIT</p>
        <p class="text-4xl font-bold">${nilaiAkhir.toFixed(2)}</p>
      </div>
      <div class="text-center flex-1 border-x border-black">
        <p class="text-xs">PREDIKAT</p>
        <p class="text-4xl font-bold">${pred.huruf}</p>
        <p class="text-[10px]">${pred.label}</p>
      </div>
      <div class="text-xs flex-1">
        <p>Guru (50%): <b>${nilaiGuru.toFixed(1)}</b></p>
        <p>Ketua (30%): <b>${nilaiKetua.toFixed(1)}</b></p>
        <p>Rekan (20%): <b>${nilaiRekan.toFixed(1)}</b></p>
      </div>
    </div>

    <p class="font-bold text-sm mb-2">A. Penilaian Per Tahapan</p>
    <table class="w-full text-xs border border-black mb-5">
      <thead class="bg-gray-200"><tr><th class="border border-black p-2">Tahapan</th><th class="border border-black p-2">Bobot</th><th class="border border-black p-2">Nilai</th></tr></thead>
      <tbody>
        ${Object.keys(tahapLabel).map((t) => `
          <tr><td class="border border-black p-2">${tahapLabel[t]}</td><td class="border border-black p-2 text-center">${bobot[t]}%</td><td class="border border-black p-2 text-center font-bold">${nilaiPerTahap[t].toFixed(2)}</td></tr>`).join("")}
      </tbody>
    </table>

    <p class="font-bold text-sm mb-2">B. Rincian Kompetensi Utama</p>
    <table class="w-full text-xs border border-black mb-5">
      <thead class="bg-gray-200"><tr><th class="border border-black p-2 text-left">Kriteria</th><th class="border border-black p-2">Bobot</th></tr></thead>
      <tbody>
        ${KRITERIA_PEMAIN.map((k) => `<tr><td class="border border-black p-2">${k.nama}</td><td class="border border-black p-2 text-center">${k.bobot}%</td></tr>`).join("")}
      </tbody>
    </table>

    <p class="font-bold text-sm mb-2">C. Catatan</p>
    <div class="border border-black p-3 text-xs mb-5 min-h-[80px]">
      <p class="font-medium mb-1">Guru Pengampu:</p>
      <p class="text-gray-700 mb-3">"${esc(komentars[0] || "Terus pertahankan semangat belajar dan berkarya.")}"</p>
      <p class="font-medium mb-1">Ketua Produksi:</p>
      <p class="text-gray-700">"${esc(komentars[1] || "Kerja sama tim yang baik, tingkatkan lagi.")}"</p>
    </div>

    <div class="grid grid-cols-3 gap-4 text-xs mb-4">
      <div class="text-center"><img src="${qrUrl}" alt="QR" class="w-20 h-20 mx-auto mb-1" /><p class="text-[9px]">Verifikasi Dokumen</p></div>
      <div class="text-center">
        <p>Samarinda, ${formatTanggal(new Date())}</p>
        <p>Guru Pembina,</p>
        <div class="h-16"></div>
        <p class="font-bold border-t border-black pt-1">(............................)</p>
      </div>
      <div class="text-center">
        <p>&nbsp;</p><p>Kepala Sekolah,</p><div class="h-16"></div>
        <p class="font-bold border-t border-black pt-1">(............................)</p>
      </div>
    </div>

    <p class="text-[9px] text-gray-500 text-center mt-4 italic">Dokumen ini digenerate otomatis oleh SP-PPT · SMPN 10 Samarinda</p>
  `;
}

async function exportPDF(ringkas = false) {
  const { jsPDF } = window.jspdf;
  const el = document.getElementById("rapor-content");
  if (!el) return;
  showToast("Menyiapkan PDF...", "info");
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const w = 210, h = (canvas.height * w) / canvas.width;
    if (!ringkas) pdf.addImage(img, "PNG", 0, 0, w, h);
    else pdf.addImage(img, "PNG", 0, 0, w, Math.min(h, 200));
    pdf.save(`rapor_${(ME.profile.nama || "user").replace(/\s+/g, "_")}_${Date.now()}.pdf`);
    showToast("PDF berhasil diunduh!", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal export PDF.", "error");
  }
}

(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

    const params = new URLSearchParams(location.search);
    const targetUid = params.get("uid") || ME.uid;
    if (targetUid !== ME.uid && !["guru", "admin"].includes(profile.role)) {
      showToast("Akses ditolak.", "error");
      return;
    }

    await renderRapor(targetUid);

    document.getElementById("btn-cetak")?.addEventListener("click", () => window.print());
    document.getElementById("btn-pdf-lengkap")?.addEventListener("click", () => exportPDF(false));
    document.getElementById("btn-pdf-ringkas")?.addEventListener("click", () => exportPDF(true));
  } catch (e) {
    console.error("[Rapor] Fatal:", e);
    const el = document.getElementById("rapor-content");
    if (el) el.innerHTML = `<div class="p-8 text-center text-red-600">
      <p class="font-bold">Gagal memuat rapor</p>
      <p class="text-xs mt-2">${esc(e.message || String(e))}</p>
      <button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Muat Ulang</button>
    </div>`;
  }
})();