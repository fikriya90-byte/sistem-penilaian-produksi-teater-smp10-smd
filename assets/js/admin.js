/**
 * SP-PPT — Panel Admin/Guru
 * Export XLSX, Import siswa, Backup/Restore, Kelola siswa, Migrasi, Logs
 */

import { auth, db, PERAN_LIST, PERAN_DIVISI } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query,
  where, getDocs, orderBy, serverTimestamp, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif, getAllStudents,
} from "./utils.js";
import { KRITERIA_PER_PERAN } from "./agregasi.js";

let ME = null;
let TAB = "export";
let SISWA_CACHE = [];

const TABS = [
  { id: "export", label: "Export", icon: "download" },
  { id: "import", label: "Import Siswa", icon: "upload" },
  { id: "siswa", label: "Kelola Siswa", icon: "people" },
  { id: "migrasi", label: "Migrasi Data", icon: "sync" },
  { id: "backup", label: "Backup/Restore", icon: "backup" },
  { id: "logs", label: "Log Sistem", icon: "history" },
];

function isAdminGuru() {
  return ME?.profile?.role === "guru" || ME?.profile?.role === "admin";
}

function renderTabs() {
  const c = document.getElementById("tabs-container");
  if (!c) return;
  c.innerHTML = TABS.map((t) => `
    <button data-tab="${t.id}" class="tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${t.id === TAB ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"}">
      <span class="material-symbols-outlined text-base">${t.icon}</span> ${t.label}
    </button>`).join("");
  c.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    TAB = b.dataset.tab; renderTabs(); renderTabContent();
  }));
}

function renderTabContent() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  const r = RENDERERS[TAB];
  if (r) r(c).catch((e) => {
    console.error("[Admin] renderer gagal:", e);
    c.innerHTML = `<div class="glass rounded-2xl p-8 text-center"><p class="text-sm text-error">${esc(e.message || "Gagal memuat")}</p></div>`;
  });
}

const RENDERERS = {};

/* ====================== EXPORT ====================== */
RENDERERS.export = async (c) => {
  const siswa = await getAllStudents();
  SISWA_CACHE = siswa;
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">download</span> Export Data
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Rekap Nilai</p>
        <p class="text-xs text-on-surface-variant mb-2">Multi-sheet: Rekap, Statistik</p>
        <button id="btn-xlsx-nilai" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Absensi</p>
        <p class="text-xs text-on-surface-variant mb-2">Sheet: Per Sesi, Per Siswa</p>
        <button id="btn-xlsx-absensi" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">XLSX Tugas</p>
        <p class="text-xs text-on-surface-variant mb-2">Sheet: Daftar, Status per siswa</p>
        <button id="btn-xlsx-tugas" class="w-full py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Download XLSX</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container">
        <p class="text-sm font-medium mb-1">Template Import</p>
        <p class="text-xs text-on-surface-variant mb-2">Excel kosong</p>
        <button id="btn-template" class="w-full py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">Download Template</button>
      </div>
      <div class="p-3 rounded-xl bg-surface-container md:col-span-2">
        <p class="text-sm font-medium mb-1">Backup JSON (Semua Koleksi)</p>
        <button id="btn-json" class="w-full py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium">Download Backup</button>
      </div>
    </div>
  </div>`;

  document.getElementById("btn-xlsx-nilai")?.addEventListener("click", () => exportXLSXNilai(siswa));
  document.getElementById("btn-xlsx-absensi")?.addEventListener("click", () => exportXLSXAbsensi(siswa));
  document.getElementById("btn-xlsx-tugas")?.addEventListener("click", () => exportXLSXTugas(siswa));
  document.getElementById("btn-template")?.addEventListener("click", downloadTemplateImport);
  document.getElementById("btn-json")?.addEventListener("click", exportJSON);
};

async function exportXLSXNilai(siswa) {
  if (!window.XLSX) return showToast("XLSX lib belum dimuat", "error");
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();
    const dataRekap = [];
    for (const s of siswa) {
      const pSnap = await getDocs(query(collection(db, "penilaian"), where("targetUid", "==", s.uid)));
      const penilaian = pSnap.docs.map((d) => d.data());
      const kriteria = KRITERIA_PER_PERAN[s.peran] || [];
      let total = 0, cnt = 0;
      const perTahap = { persiapan: [], pelaksanaan: [], pertunjukan: [], pasca: [] };
      penilaian.forEach((p) => { if (perTahap[p.tahapan]) perTahap[p.tahapan].push(p); });
      const hasilT = {};
      Object.entries(perTahap).forEach(([t, arr]) => {
        if (!arr.length) { hasilT[t] = 0; return; }
        let sum = 0;
        arr.forEach((p) => {
          let t2 = 0, tb = 0;
          (p.nilai || []).forEach((n) => {
            const k = kriteria.find((x) => x.nama === n.kriteria);
            const b = k ? k.bobot : 10;
            t2 += ({ 4: 100, 3: 80, 2: 60, 1: 40 }[n.skor] || 0) * b;
            tb += b;
          });
          if (tb) sum += t2 / tb;
        });
        hasilT[t] = sum / arr.length;
      });
      const bob = { persiapan: 20, pelaksanaan: 35, pertunjukan: 30, pasca: 15 };
      Object.entries(hasilT).forEach(([t, v]) => { total += v * (bob[t] / 100); });
      const pred = total >= 90 ? "A" : total >= 80 ? "B" : total >= 70 ? "C" : total >= 60 ? "D" : "E";
      dataRekap.push({
        Nama: s.nama, NIS: s.nis || "", Kelas: s.kelas || "", Peran: s.peran, Divisi: s.divisi || "",
        Persiapan: hasilT.persiapan.toFixed(2), Pelaksanaan: hasilT.pelaksanaan.toFixed(2),
        Pertunjukan: hasilT.pertunjukan.toFixed(2), Pasca: hasilT.pasca.toFixed(2),
        NilaiAkhir: total.toFixed(2), Predikat: pred,
      });
      cnt++;
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRekap), "Rekap");
    const nilaiArr = dataRekap.map((r) => parseFloat(r.NilaiAkhir));
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    dataRekap.forEach((r) => { dist[r.Predikat]++; });
    const dataStat = [
      { Metrik: "Total Siswa", Nilai: siswa.length },
      { Metrik: "Rata-rata", Nilai: nilaiArr.length ? (nilaiArr.reduce((a, b) => a + b, 0) / nilaiArr.length).toFixed(2) : 0 },
      { Metrik: "Tertinggi", Nilai: nilaiArr.length ? Math.max(...nilaiArr).toFixed(2) : 0 },
      { Metrik: "Terendah", Nilai: nilaiArr.length ? Math.min(...nilaiArr).toFixed(2) : 0 },
      ...Object.entries(dist).map(([k, v]) => ({ Metrik: `Predikat ${k}`, Nilai: v })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataStat), "Statistik");
    XLSX.writeFile(wb, `SP-PPT_Nilai_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_nilai");
    showToast("XLSX diunduh!", "success");
  } catch (e) { console.error(e); showToast("Gagal export.", "error"); }
}

async function exportXLSXAbsensi(siswa) {
  if (!window.XLSX) return showToast("XLSX lib belum dimuat", "error");
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();
    const sesiSnap = await getDocs(query(collection(db, "sesiAbsensi"), limit(500)));
    const khSnap = await getDocs(query(collection(db, "kehadiran"), limit(3000)));
    const sesi = sesiSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const kh = khSnap.docs.map((d) => d.data());

    const data1 = sesi.map((s) => {
      const k = kh.filter((x) => x.sesiId === s.id);
      return {
        Judul: s.judul, Jenis: s.jenis, Tanggal: s.tanggal, Jam: s.jam, Lokasi: s.lokasi,
        Total: k.length, Hadir: k.filter((x) => x.status === "Hadir").length,
        Izin: k.filter((x) => x.status === "Izin").length, Sakit: k.filter((x) => x.status === "Sakit").length,
        Alpa: k.filter((x) => x.status === "Alpa").length,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), "Per Sesi");

    const data2 = siswa.map((s) => {
      const k = kh.filter((x) => x.siswaUid === s.uid);
      const h = k.filter((x) => x.status === "Hadir").length;
      return { Nama: s.nama, Peran: s.peran, Kelas: s.kelas || "", Hadir: h, Total: k.length, Persen: k.length ? Math.round((h / k.length) * 100) + "%" : "0%" };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), "Per Siswa");
    XLSX.writeFile(wb, `SP-PPT_Absensi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_absensi");
    showToast("XLSX diunduh!", "success");
  } catch (e) { console.error(e); showToast("Gagal export.", "error"); }
}

async function exportXLSXTugas(siswa) {
  if (!window.XLSX) return showToast("XLSX lib belum dimuat", "error");
  showToast("Menyiapkan XLSX...", "info");
  try {
    const wb = XLSX.utils.book_new();
    const tSnap = await getDocs(query(collection(db, "tugas"), limit(500)));
    const tugas = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const data1 = tugas.map((t) => ({
      Judul: t.judul, Tahapan: t.tahapan, Prioritas: t.prioritas, Deadline: t.deadline,
      Target: t.target, Dibuat: t.pembuatNama || "-",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data1), "Daftar Tugas");
    const data2 = [];
    tugas.forEach((t) => {
      Object.entries(t.statusPerSiswa || {}).forEach(([uid, status]) => {
        const s = siswa.find((x) => x.uid === uid);
        if (!s) return;
        data2.push({ Tugas: t.judul, Siswa: s.nama, Peran: s.peran, Status: status });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data2), "Status Per Siswa");
    XLSX.writeFile(wb, `SP-PPT_Tugas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity(ME.uid, "export_xlsx_tugas");
    showToast("XLSX diunduh!", "success");
  } catch (e) { console.error(e); showToast("Gagal export.", "error"); }
}

function downloadTemplateImport() {
  if (!window.XLSX) return showToast("XLSX lib belum dimuat", "error");
  const wb = XLSX.utils.book_new();
  const template = [{ Nama: "Contoh Siswa", NIS: "12345", Kelas: "IX-A", Email: "siswa@email.com", WhatsApp: "08123456789", Peran: "Pemain" }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template), "Template");
  XLSX.writeFile(wb, "template_import_siswa.xlsx");
  showToast("Template diunduh!", "success");
}

async function exportJSON() {
  showToast("Menyiapkan backup...", "info");
  try {
    const koleksi = ["users", "penilaian", "jadwal", "sesiAbsensi", "kehadiran", "tugas", "broadcast", "informasi", "bookingAlat", "aduan", "notifikasi"];
    const backup = { timestamp: new Date().toISOString() };
    for (const k of koleksi) {
      try {
        const snap = await getDocs(query(collection(db, k), limit(2000)));
        backup[k] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) { backup[k] = []; }
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup_SP-PPT_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    await logActivity(ME.uid, "export_json_backup");
    showToast("Backup JSON diunduh!", "success");
  } catch (e) { console.error(e); showToast("Gagal export backup.", "error"); }
}

/* ====================== IMPORT ====================== */
RENDERERS.import = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">upload</span> Import Siswa dari Excel/CSV
    </h3>
    <div class="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-4 text-xs text-yellow-400">
      <p class="font-medium mb-1">Perhatian:</p>
      <ul class="pl-4 list-disc space-y-1">
        <li>Format kolom: Nama, NIS, Kelas, Email, WhatsApp, Peran</li>
        <li>Password default: <b>sppt2025</b> (hash otomatis)</li>
        <li>Email & WhatsApp harus unik</li>
      </ul>
    </div>
    <input id="file-import" type="file" accept=".xlsx,.xls,.csv" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm mb-3" />
    <div id="import-preview"></div>
    <button id="btn-download-template" class="mt-3 px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">download</span> Download Template
    </button>
  </div>`;

  document.getElementById("btn-download-template")?.addEventListener("click", downloadTemplateImport);
  document.getElementById("file-import")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) return showToast("XLSX lib belum dimuat", "error");
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      tampilkanPreview(rows);
    } catch (err) { console.error(err); showToast("Gagal membaca file.", "error"); }
  });
};

function tampilkanPreview(rows) {
  const el = document.getElementById("import-preview");
  if (!el) return;
  if (!rows.length) { el.innerHTML = `<p class="text-xs text-on-surface-variant">File kosong</p>`; return; }

  el.innerHTML = `
    <div class="p-3 rounded-xl bg-surface-container mb-3">
      <p class="text-sm font-medium mb-2">Preview (${rows.length} baris)</p>
      <div class="overflow-x-auto max-h-64">
        <table class="w-full text-xs">
          <thead class="text-on-surface-variant"><tr>${Object.keys(rows[0]).map((k) => `<th class="text-left p-1">${esc(k)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.slice(0, 20).map((r) => `<tr class="border-b border-outline-variant/20">${Object.values(r).map((v) => `<td class="p-1">${esc(String(v || ""))}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${rows.length > 20 ? `<p class="text-[10px] text-on-surface-variant mt-2">Menampilkan 20 dari ${rows.length}</p>` : ""}
    </div>
    <button id="btn-proses-import" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Proses Import ${rows.length} Siswa</button>`;

  document.getElementById("btn-proses-import")?.addEventListener("click", async () => {
    if (!confirm(`Import ${rows.length} siswa?`)) return;
    showToast("Memproses import...", "info");
    let sukses = 0, gagal = 0;
    const errors = [];
    const { hashPassword, normalisasiWA } = await import("./utils.js");

    for (const row of rows) {
      const nama = String(row.Nama || row.nama || "").trim();
      const nis = String(row.NIS || row.nis || "").trim();
      const kelas = String(row.Kelas || row.kelas || "").trim();
      const email = String(row.Email || row.email || "").trim().toLowerCase();
      const wa = normalisasiWA(String(row.WhatsApp || row.whatsapp || row.WA || "").trim());
      const peran = String(row.Peran || row.peran || "Pemain").trim();

      if (!nama || !email) { errors.push(`${nama || "(no name)"}: Nama/Email kosong`); gagal++; continue; }

      try {
        const cek = await getDocs(query(collection(db, "users"), where("email", "==", email)));
        if (!cek.empty) { errors.push(`${nama}: Email sudah terdaftar`); gagal++; continue; }
      } catch (_) { /* ignore */ }

      try {
        const uid = `student_${email}`;
        const salt = uid + "_" + Date.now();
        const passwordHash = await hashPassword("sppt2025", salt);
        await setDoc(doc(db, "users", uid), {
          role: "siswa", nama, nis, kelas, email, whatsapp: wa, peran,
          divisi: PERAN_DIVISI[peran] || "Pemeran",
          salt, passwordHash,
          fotoUrl: "", createdAt: serverTimestamp(),
        }, { merge: true });
        sukses++;
      } catch (e) { errors.push(`${nama}: ${e.message}`); gagal++; }
    }

    await logActivity(ME.uid, "import_siswa", `${sukses} sukses, ${gagal} gagal`);
    showToast(`Import: ${sukses} sukses, ${gagal} gagal`, sukses > 0 ? "success" : "error", 5000);
    if (errors.length) alert(`Gagal:\n${errors.slice(0, 10).join("\n")}${errors.length > 10 ? `\n...dan ${errors.length - 10} lainnya` : ""}`);
    document.getElementById("file-import").value = "";
    document.getElementById("import-preview").innerHTML = "";
  });
}

/* ====================== KELOLA SISWA ====================== */
RENDERERS.siswa = async (c) => {
  const list = await getAllStudents();
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">people</span> Kelola Siswa <span class="text-xs text-on-surface-variant font-normal">(${list.length})</span>
      </h3>
      <input id="search-siswa" placeholder="Cari nama..." class="px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs" />
    </div>
    <div id="siswa-list" class="space-y-2"></div>
  </div>`;

  const renderList = (filter = "") => {
    const el = document.getElementById("siswa-list");
    if (!el) return;
    let filtered = list;
    if (filter) filtered = filtered.filter((s) => (s.nama || "").toLowerCase().includes(filter.toLowerCase()));
    if (!filtered.length) { el.innerHTML = `<p class="text-sm text-center text-on-surface-variant py-6">Tidak ada siswa</p>`; return; }
    el.innerHTML = filtered.map((s) => `
      <div class="p-3 rounded-xl bg-surface-container flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-semibold">${inisial(s.nama)}</div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">${esc(s.nama)}</p>
          <p class="text-[10px] text-on-surface-variant">${esc(s.peran)} · ${esc(s.kelas || "-")} · ${esc(s.email)}</p>
        </div>
        <button class="btn-edit px-2 py-1 rounded text-[10px] bg-primary-container text-primary" data-uid="${s.uid}">Edit</button>
        <button class="btn-del px-2 py-1 rounded text-[10px] bg-error/20 text-error" data-uid="${s.uid}" data-src="${s._sumber}">Hapus</button>
      </div>`).join("");

    el.querySelectorAll(".btn-edit").forEach((b) =>
      b.addEventListener("click", () => bukaEditSiswa(list.find((x) => x.uid === b.dataset.uid), c))
    );
    el.querySelectorAll(".btn-del").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Hapus siswa ini?")) return;
        try {
          await deleteDoc(doc(db, "users", b.dataset.uid));
          showToast("Siswa dihapus.", "success");
          RENDERERS.siswa(c);
        } catch (e) { showToast("Gagal hapus.", "error"); }
      })
    );
  };
  renderList();
  document.getElementById("search-siswa")?.addEventListener("input", (e) => renderList(e.target.value));
};

function bukaEditSiswa(s, c) {
  if (!s) return;
  document.getElementById("modal-title").textContent = "Edit Siswa";
  document.getElementById("modal-body").innerHTML = `
    <div class="space-y-3">
      <input id="e-nama" value="${esc(s.nama)}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-nis" value="${esc(s.nis || "")}" placeholder="NIS" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-kelas" value="${esc(s.kelas || "")}" placeholder="Kelas" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-email" value="${esc(s.email || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <input id="e-wa" value="${esc(s.whatsapp || "")}" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm" />
      <select id="e-peran" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        ${PERAN_LIST.filter((p) => !["Guru Pembina", "Admin"].includes(p)).map((p) => `<option ${s.peran === p ? "selected" : ""}>${p}</option>`).join("")}
      </select>
      <button id="e-submit" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Simpan Perubahan</button>
    </div>`;
  openModal("modal-form");
  document.getElementById("e-submit").onclick = async () => {
    const peran = document.getElementById("e-peran").value;
    try {
      await updateDoc(doc(db, "users", s.uid), {
        nama: document.getElementById("e-nama").value.trim(),
        nis: document.getElementById("e-nis").value.trim(),
        kelas: document.getElementById("e-kelas").value.trim(),
        email: document.getElementById("e-email").value.trim().toLowerCase(),
        whatsapp: document.getElementById("e-wa").value.trim(),
        peran,
        divisi: PERAN_DIVISI[peran] || "Pemeran",
        updatedAt: serverTimestamp(),
      });
      await logActivity(ME.uid, "edit_siswa", s.uid);
      showToast("Data diperbarui!", "success");
      closeModal("modal-form");
      renderTabContent();
    } catch (e) { showToast("Gagal simpan.", "error"); }
  };
}

/* ====================== MIGRASI ====================== */
RENDERERS.migrasi = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">sync</span> Migrasi classes.students → users
    </h3>
    <div class="p-3 rounded-lg bg-tertiary/10 border border-tertiary/30 text-xs text-tertiary mb-4">
      <p class="font-medium mb-1">Info:</p>
      <p>Skrip ini menyalin siswa dari <code>classes.students</code> (model lama) ke koleksi <code>users</code> (source of truth baru). Data asli TIDAK dihapus.</p>
    </div>
    <button id="btn-run-migrasi" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Jalankan Migrasi</button>
    <pre id="migrasi-log" class="mt-4 p-3 rounded-lg bg-surface-container text-xs max-h-80 overflow-y-auto whitespace-pre-wrap"></pre>
  </div>`;

  const logEl = document.getElementById("migrasi-log");
  const log = (m) => { if (logEl) { logEl.textContent += m + "\n"; logEl.scrollTop = logEl.scrollHeight; } };

  document.getElementById("btn-run-migrasi")?.addEventListener("click", async () => {
    if (!confirm("Jalankan migrasi sekarang?")) return;
    logEl.textContent = "=== MULAI ===";
    let sukses = 0, skip = 0, gagal = 0;
    try {
      const cSnap = await getDocs(collection(db, "classes"));
      log(`Ditemukan ${cSnap.size} kelas`);
      for (const cDoc of cSnap.docs) {
        const k = cDoc.data();
        for (const s of (k.students || [])) {
          if (!s.email) { skip++; continue; }
          const email = s.email.toLowerCase().trim();
          const uid = `student_${email}`;
          try {
            const existing = await getDoc(doc(db, "users", uid));
            if (existing.exists()) { skip++; log(`SKIP: ${email} sudah ada`); continue; }
            await setDoc(doc(db, "users", uid), {
              role: "siswa", nama: s.name || "Siswa", nis: s.nis || "",
              kelas: k.name || "", kelasId: cDoc.id, email,
              whatsapp: s.phone || "", peran: s.peran || "Pemain",
              divisi: s.divisi || "Pemeran", password: s.password || "",
              migratedAt: serverTimestamp(),
            });
            sukses++;
            log(`OK: ${s.name || email}`);
          } catch (e) { gagal++; log(`GAGAL: ${email} - ${e.message}`); }
        }
      }
      await logActivity(ME.uid, "migrasi_classes_users", `${sukses} sukses, ${skip} skip, ${gagal} gagal`);
      log(`\n=== SELESAI: ${sukses} sukses, ${skip} skip, ${gagal} gagal ===`);
      showToast("Migrasi selesai!", "success");
    } catch (e) { log(`FATAL: ${e.message}`); showToast("Migrasi gagal.", "error"); }
  });
};

/* ====================== BACKUP ====================== */
RENDERERS.backup = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-primary">backup</span> Backup & Restore
    </h3>
    <div class="p-4 rounded-xl bg-surface-container mb-4">
      <p class="text-sm font-medium mb-1">Backup Manual</p>
      <p class="text-xs text-on-surface-variant mb-3">Snapshot seluruh data ke JSON</p>
      <button id="btn-backup" class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-medium">Download Backup</button>
    </div>
    <div class="p-4 rounded-xl bg-surface-container">
      <p class="text-sm font-medium mb-1">Restore</p>
      <p class="text-xs text-error mb-3">⚠️ Menimpa data existing!</p>
      <input id="file-restore" type="file" accept=".json" class="w-full mb-3 text-xs" />
      <button id="btn-restore" class="w-full py-2.5 rounded-lg bg-error text-white text-sm font-medium">Restore</button>
    </div>
  </div>`;

  document.getElementById("btn-backup")?.addEventListener("click", exportJSON);
  document.getElementById("btn-restore")?.addEventListener("click", () => {
    const file = document.getElementById("file-restore").files[0];
    if (!file) return showToast("Pilih file backup.", "warning");
    if (!confirm("Restore data? Data akan tertimpa.")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        const koleksi = ["users", "penilaian", "jadwal", "sesiAbsensi", "kehadiran", "tugas", "broadcast", "informasi"];
        let total = 0;
        for (const k of koleksi) {
          if (!backup[k]) continue;
          for (const item of backup[k]) {
            const { id, ...data } = item;
            if (id) {
              try { await setDoc(doc(db, k, id), data, { merge: true }); total++; } catch (_) {}
            }
          }
        }
        await logActivity(ME.uid, "restore_backup", `${total} dokumen`);
        showToast(`Restore selesai: ${total} dokumen`, "success");
      } catch (err) { console.error(err); showToast("File backup tidak valid.", "error"); }
    };
    reader.readAsText(file);
  });
};

/* ====================== LOGS ====================== */
RENDERERS.logs = async (c) => {
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">history</span> Log Sistem
      </h3>
      <input id="search-log" placeholder="Cari aksi..." class="px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs" />
    </div>
    <div id="logs-list" class="space-y-1 max-h-[60vh] overflow-y-auto">${skeleton(5)}</div>
  </div>`;

  try {
    let list = [];
    try {
      const snap = await getDocs(query(collection(db, "logs"), orderBy("waktu", "desc"), limit(200)));
      list = snap.docs.map((d) => d.data());
    } catch (_) {
      const snap = await getDocs(query(collection(db, "logs"), limit(200)));
      list = snap.docs.map((d) => d.data()).sort((a, b) => (b.waktu?.seconds || 0) - (a.waktu?.seconds || 0));
    }
    const el = document.getElementById("logs-list");
    if (!el) return;
    if (!list.length) { el.innerHTML = `<p class="text-sm text-center text-on-surface-variant py-6">Belum ada log</p>`; return; }
    el.innerHTML = list.map((l) => {
      const color = l.aksi?.includes("login") ? "text-green-400" :
        l.aksi?.includes("hapus") ? "text-error" :
        l.aksi?.includes("penilaian") ? "text-primary" : "text-on-surface-variant";
      return `<div class="p-2 rounded-lg bg-surface-container flex items-center gap-3 text-xs">
        <span class="${color} font-medium min-w-[100px]">${esc(l.aksi || "-")}</span>
        <span class="text-on-surface-variant flex-1 truncate">${esc((l.uid || "anon").slice(0, 10))} · ${esc(l.target || "")}</span>
        <span class="text-on-surface-variant text-[10px]">${l.waktu ? waktuRelatif(l.waktu) : "-"}</span>
      </div>`;
    }).join("");

    document.getElementById("search-log")?.addEventListener("input", (e) => {
      const kw = e.target.value.toLowerCase();
      document.querySelectorAll("#logs-list > div").forEach((el2) => {
        el2.style.display = el2.textContent.toLowerCase().includes(kw) ? "" : "none";
      });
    });
  } catch (e) {
    const el = document.getElementById("logs-list");
    if (el) el.innerHTML = `<p class="text-sm text-center py-6">Gagal memuat logs.</p>`;
  }
};

/* ====================== INIT ====================== */
(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

    if (!isAdminGuru()) {
      document.getElementById("tab-content").innerHTML = `
        <div class="glass rounded-2xl p-10 text-center">
          <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <p class="text-sm">Halaman ini hanya untuk Guru/Admin.</p>
          <a href="dashboard.html" class="inline-block mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Kembali</a>
        </div>`;
      return;
    }

    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.textContent = profile.role === "admin" ? "Panel Admin" : "Panel Guru";

    const menu = [
      { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
      { icon: "admin_panel_settings", label: profile.role === "admin" ? "Panel Admin" : "Panel Guru", href: "admin.html" },
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
      { icon: "fact_check", label: "Absensi", href: "absensi.html" },
      { icon: "checklist", label: "Checklist", href: "checklist.html" },
      { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
      { icon: "groups", label: "Struktur", href: "struktur.html" },
      { icon: "folder", label: "Arsip", href: "arsip.html" },
      { icon: "description", label: "Rapor", href: "rapor.html" },
      { icon: "settings", label: "Pengaturan", href: "pengaturan.html" },
    ];
    const nav = document.getElementById("sidebar-nav");
    if (nav) nav.innerHTML = menu.map((m) => `
      <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "admin.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
        <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
      </a>`).join("");

    const av = document.getElementById("header-avatar");
    if (av) av.textContent = inisial(profile.nama);
    const badge = document.getElementById("badge-role");
    if (badge) {
      badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`;
      badge.textContent = profile.peran;
    }

    const bn = document.getElementById("bottom-nav");
    if (bn) bn.innerHTML = [
      { icon: "dashboard", label: "Home", href: "dashboard.html" },
      { icon: "admin_panel_settings", label: "Panel", href: "admin.html" },
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "groups", label: "Struktur", href: "struktur.html" },
      { icon: "settings", label: "Setting", href: "pengaturan.html" },
    ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "admin.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

    const html = document.documentElement;
    if (localStorage.getItem("theme") === "light") html.classList.remove("dark");
    const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
    const setIcon = () => { if (iconT) iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode"; };
    setIcon();
    btnT?.addEventListener("click", () => {
      html.classList.toggle("dark");
      localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light");
      setIcon();
    });
    document.getElementById("btn-logout")?.addEventListener("click", async () => {
      if (!confirm("Keluar?")) return;
      await logActivity(ME.uid, "logout");
      await signOut(auth);
      window.location.replace("index.html");
    });
    document.getElementById("btn-menu")?.addEventListener("click", () => {
      const sb = document.getElementById("sidebar");
      if (!sb) return;
      sb.classList.toggle("hidden"); sb.classList.toggle("flex");
    });

    renderTabs();
    renderTabContent();
  } catch (e) {
    console.error("[Admin] Fatal:", e);
    const c = document.getElementById("tab-content");
    if (c) c.innerHTML = `<div class="glass rounded-2xl p-8 text-center"><p class="text-sm text-error">${esc(e.message || "Gagal memuat")}</p><button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Muat Ulang</button></div>`;
  }
})();
