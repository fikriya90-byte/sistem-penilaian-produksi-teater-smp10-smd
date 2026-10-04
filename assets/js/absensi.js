/**
 * SP-PPT — Modul Absensi
 * Sesi, Statistik, Grid Presensi, Export CSV
 */

import { auth, db } from "./firebase-init.js";
import {
  addDoc, collection, query, where, getDocs, serverTimestamp,
  doc, updateDoc, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasiBanyak } from "./notifikasi.js";

let ME = null;
let TAB = "sesi";
let SESI_AKTIF = null;
let SEMUA_SESI = [];
let SEMUA_KEHADIRAN = [];
let SEMUA_SISWA = [];

const STATUS_LIST = ["Hadir", "Izin", "Sakit", "Alpa"];

/* =========================================================
 * HAK BUAT
 * ========================================================= */
function cekHakBuat() {
  const p = ME.profile.peran, r = ME.profile.role;
  if (r === "guru" || r === "admin") return { boleh: true, tipe: "bebas", label: "Guru/Admin — peserta bebas" };
  if (["Pimpinan Produksi", "Sekretaris"].includes(p)) return { boleh: true, tipe: "bebas", label: `${p} — peserta bebas` };
  if (["Sutradara", "Asisten Sutradara"].includes(p)) return { boleh: true, tipe: "terkunci-pemain-musik", label: `${p} — peserta TERKUNCI: Pemain + Tata Musik` };
  if (p.startsWith("Koordinator")) return { boleh: true, tipe: "terkunci-divisi", label: `Koordinator — peserta TERKUNCI: anggota ${ME.profile.divisi}` };
  return { boleh: false };
}

async function ambilPeserta(tipe, cakupan, target) {
  try {
    let q;
    if (tipe === "terkunci-pemain-musik") {
      q = query(collection(db, "users"), where("role", "==", "siswa"),
        where("peran", "in", ["Pemain", "Koordinator Tata Musik & Suara", "Anggota Tata Musik & Suara"]));
    } else if (tipe === "terkunci-divisi") {
      q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", ME.profile.divisi));
    } else {
      if (cakupan === "divisi" && target) q = query(collection(db, "users"), where("role", "==", "siswa"), where("divisi", "==", target));
      else if (cakupan === "peran" && target) q = query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", target));
      else q = query(collection(db, "users"), where("role", "==", "siswa"));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[Absensi] peserta gagal:", e);
    return [];
  }
}

/* =========================================================
 * LOAD
 * ========================================================= */
async function loadSemua() {
  const [sesiSnap, khSnap, siswaSnap] = await Promise.all([
    getDocs(query(collection(db, "sesiAbsensi"), limit(200))).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, "kehadiran"), limit(2000))).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, "users"), where("role", "==", "siswa"), limit(500))).catch(() => ({ docs: [] })),
  ]);
  SEMUA_SESI = sesiSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  SEMUA_KEHADIRAN = khSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  SEMUA_SISWA = siswaSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* =========================================================
 * TAB SWITCH
 * ========================================================= */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"}`;
  });
  if (tab === "sesi") renderTabSesi();
  if (tab === "statistik") renderTabStatistik();
  if (tab === "grid") renderTabGrid();
}

/* =========================================================
 * TAB: SESI
 * ========================================================= */
function renderTabSesi() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  const hak = cekHakBuat();

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold">Daftar Sesi Absensi</h3>
      ${hak.boleh ? `<button id="btn-buat-sesi" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium flex items-center gap-1"><span class="material-symbols-outlined text-sm">add</span> Buat Sesi</button>` : ""}
    </div>
    <div id="sesi-list" class="space-y-3"></div>
  </div>`;

  renderSesiList();

  document.getElementById("btn-buat-sesi")?.addEventListener("click", () => {
    const wrapCakupan = document.getElementById("cakupan-wrap");
    const locked = document.getElementById("cakupan-locked");
    if (!wrapCakupan || !locked) return;
    if (hak.tipe === "bebas") {
      wrapCakupan.classList.remove("hidden");
      locked.classList.add("hidden");
    } else {
      wrapCakupan.classList.add("hidden");
      locked.classList.remove("hidden");
      locked.textContent = hak.label;
    }
    openModal("modal-sesi");
  });
}

function renderSesiList() {
  const el = document.getElementById("sesi-list");
  if (!el) return;
  const list = SEMUA_SESI;

  if (!list.length) {
    el.innerHTML = `<div class="text-center py-10 text-on-surface-variant">
      <span class="material-symbols-outlined text-5xl block mb-2">event_busy</span>
      <p class="text-sm">Belum ada sesi absensi</p>
    </div>`;
    return;
  }

  el.innerHTML = list.slice(0, 50).map((s) => {
    const khSesi = SEMUA_KEHADIRAN.filter((k) => k.sesiId === s.id);
    const totalPeserta = s.pesertaUids?.length || 0;
    const sudahIsi = khSesi.length;
    const persen = totalPeserta ? Math.round((sudahIsi / totalPeserta) * 100) : 0;
    return `
    <div class="p-4 rounded-xl bg-surface-container">
      <div class="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-medium text-sm">${esc(s.judul)}</h4>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-primary-container text-primary">${esc(s.jenis)}</span>
          </div>
          <p class="text-xs text-on-surface-variant mt-1">${formatTanggal(s.tanggal)} · ${esc(s.jam || "")} · ${esc(s.lokasi || "")}</p>
          <p class="text-xs text-on-surface-variant">Dibuat: ${esc(s.pembuatNama || "-")} (${esc(s.pembuatPeran || "-")})</p>
        </div>
        <div class="flex flex-col gap-1">
          <button class="btn-isi px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-medium" data-id="${s.id}">Isi Absensi</button>
        </div>
      </div>
      <div class="mt-2 flex items-center gap-2 text-[10px]">
        <div class="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
          <div class="h-full bg-primary transition-all" style="width:${persen}%"></div>
        </div>
        <span class="text-on-surface-variant">${sudahIsi}/${totalPeserta} (${persen}%)</span>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll(".btn-isi").forEach((b) =>
    b.addEventListener("click", () => bukaIsiAbsensi(b.dataset.id))
  );
}

async function bukaIsiAbsensi(sesiId) {
  SESI_AKTIF = sesiId;
  const sesi = SEMUA_SESI.find((s) => s.id === sesiId);
  if (!sesi) return;
  const judulEl = document.getElementById("isi-judul");
  if (judulEl) judulEl.textContent = sesi.judul;

  const peserta = await ambilPeserta(sesi.tipe || "bebas", sesi.cakupan, sesi.target);
  const list = document.getElementById("isi-list");
  if (!list) return;

  const khSnap = await getDocs(query(collection(db, "kehadiran"), where("sesiId", "==", sesiId)));
  const sudahAda = {};
  khSnap.docs.forEach((d) => { const k = d.data(); sudahAda[k.siswaUid] = k.status; });

  list.innerHTML = peserta.map((s) => `
    <div class="p-3 rounded-lg bg-surface-container flex items-center gap-3" data-uid="${s.uid}">
      <div class="w-8 h-8 rounded-full bg-primary-container text-primary flex items-center justify-center text-xs font-semibold">${inisial(s.nama)}</div>
      <div class="flex-1"><p class="text-sm">${esc(s.nama)}</p><p class="text-[10px] text-on-surface-variant">${esc(s.peran)}</p></div>
      <select class="status-siswa px-2 py-1 rounded-lg bg-surface-container-high border border-outline-variant text-xs">
        ${STATUS_LIST.map((st) => `<option value="${st}" ${sudahAda[s.uid] === st ? "selected" : ""}>${st}</option>`).join("")}
      </select>
    </div>`).join("");

  openModal("modal-isi");
}

/* =========================================================
 * TAB: STATISTIK
 * ========================================================= */
function renderTabStatistik() {
  const c = document.getElementById("tab-content");
  if (!c) return;

  const totalHadir = SEMUA_KEHADIRAN.filter((k) => k.status === "Hadir").length;
  const totalAlpa = SEMUA_KEHADIRAN.filter((k) => k.status === "Alpa").length;
  const persen = SEMUA_KEHADIRAN.length ? Math.round((totalHadir / SEMUA_KEHADIRAN.length) * 100) : 0;

  c.innerHTML = `
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
    <div class="glass rounded-xl p-4"><p class="text-xs text-on-surface-variant">Total Sesi</p><p class="text-2xl font-bold text-primary">${SEMUA_SESI.length}</p></div>
    <div class="glass rounded-xl p-4"><p class="text-xs text-on-surface-variant">Total Hadir</p><p class="text-2xl font-bold text-green-400">${totalHadir}</p></div>
    <div class="glass rounded-xl p-4"><p class="text-xs text-on-surface-variant">Total Alpa</p><p class="text-2xl font-bold text-error">${totalAlpa}</p></div>
    <div class="glass rounded-xl p-4"><p class="text-xs text-on-surface-variant">Persen Kehadiran</p><p class="text-2xl font-bold text-secondary">${persen}%</p></div>
  </div>

  <div class="flex gap-2 mb-4 flex-wrap">
    <button data-stat="sesi" class="stat-tab px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium">Per Sesi</button>
    <button data-stat="siswa" class="stat-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container">Per Siswa</button>
    <button data-stat="divisi" class="stat-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container">Per Divisi</button>
    <button id="btn-export" class="ml-auto px-3 py-1.5 rounded-lg text-xs bg-secondary text-on-secondary font-medium flex items-center gap-1">
      <span class="material-symbols-outlined text-sm">download</span> Export
    </button>
  </div>
  <div id="stat-content"></div>`;

  renderStatContent("sesi");

  document.querySelectorAll(".stat-tab").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".stat-tab").forEach((x) => x.className = "stat-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container");
      b.className = "stat-tab px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium";
      renderStatContent(b.dataset.stat);
    })
  );

  document.getElementById("btn-export")?.addEventListener("click", () => openModal("modal-export"));
}

function renderStatContent(jenis) {
  const el = document.getElementById("stat-content");
  if (!el) return;

  if (jenis === "sesi") {
    el.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4">Statistik Per Sesi</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="text-on-surface-variant">
            <tr class="border-b border-outline-variant/40">
              <th class="text-left p-2">Judul</th><th class="text-left p-2">Jenis</th>
              <th class="text-center p-2">Total</th><th class="text-center p-2">H</th>
              <th class="text-center p-2">I</th><th class="text-center p-2">S</th>
              <th class="text-center p-2">A</th><th class="text-center p-2">%</th>
            </tr>
          </thead>
          <tbody>
            ${SEMUA_SESI.slice(0, 30).map((s) => {
              const kh = SEMUA_KEHADIRAN.filter((k) => k.sesiId === s.id);
              const h = kh.filter((k) => k.status === "Hadir").length;
              const i = kh.filter((k) => k.status === "Izin").length;
              const sa = kh.filter((k) => k.status === "Sakit").length;
              const a = kh.filter((k) => k.status === "Alpa").length;
              const total = kh.length;
              const persen = total ? Math.round((h / total) * 100) : 0;
              return `<tr class="border-b border-outline-variant/20">
                <td class="p-2">${esc(s.judul)}</td><td class="p-2">${esc(s.jenis)}</td>
                <td class="p-2 text-center">${total}</td>
                <td class="p-2 text-center text-green-400 font-bold">${h}</td>
                <td class="p-2 text-center text-blue-400">${i}</td>
                <td class="p-2 text-center text-yellow-400">${sa}</td>
                <td class="p-2 text-center text-error">${a}</td>
                <td class="p-2 text-center font-bold text-primary">${persen}%</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
    return;
  }

  if (jenis === "siswa") {
    const rows = SEMUA_SISWA.map((s) => {
      const kh = SEMUA_KEHADIRAN.filter((k) => k.siswaUid === s.uid);
      const h = kh.filter((k) => k.status === "Hadir").length;
      const total = kh.length;
      const persen = total ? Math.round((h / total) * 100) : 0;
      return { siswa: s, h, total, persen };
    }).sort((a, b) => b.persen - a.persen);

    el.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4">Statistik Per Siswa</h3>
      <div class="space-y-1.5">
        ${rows.slice(0, 50).map((r) => `
          <div class="p-2 rounded-lg bg-surface-container flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-primary-container text-primary flex items-center justify-center text-xs font-semibold">${inisial(r.siswa.nama)}</div>
            <div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${esc(r.siswa.nama)}</p><p class="text-[10px] text-on-surface-variant">${esc(r.siswa.peran)}</p></div>
            <div class="text-right">
              <p class="text-sm font-bold ${r.persen >= 80 ? "text-green-400" : r.persen >= 60 ? "text-yellow-400" : "text-error"}">${r.persen}%</p>
              <p class="text-[10px] text-on-surface-variant">${r.h}/${r.total}</p>
            </div>
          </div>
        `).join("")}
      </div>
    </div>`;
    return;
  }

  if (jenis === "divisi") {
    const divisiSet = [...new Set(SEMUA_SISWA.map((s) => s.divisi).filter(Boolean))];
    const rows = divisiSet.map((d) => {
      const sUids = SEMUA_SISWA.filter((s) => s.divisi === d).map((s) => s.uid);
      const kh = SEMUA_KEHADIRAN.filter((k) => sUids.includes(k.siswaUid));
      const h = kh.filter((k) => k.status === "Hadir").length;
      const total = kh.length;
      const persen = total ? Math.round((h / total) * 100) : 0;
      return { divisi: d, h, total, persen, jumlah: sUids.length };
    }).sort((a, b) => b.persen - a.persen);

    el.innerHTML = `
    <div class="glass rounded-2xl p-5">
      <h3 class="font-headline font-semibold mb-4">Statistik Per Divisi</h3>
      <div class="space-y-2">
        ${rows.map((r) => `
          <div class="p-3 rounded-xl bg-surface-container">
            <div class="flex items-center justify-between mb-2">
              <p class="text-sm font-medium">${esc(r.divisi)}</p>
              <span class="text-sm font-bold ${r.persen >= 80 ? "text-green-400" : r.persen >= 60 ? "text-yellow-400" : "text-error"}">${r.persen}%</span>
            </div>
            <div class="h-2 rounded-full bg-surface-container-high overflow-hidden mb-1">
              <div class="h-full bg-primary" style="width:${r.persen}%"></div>
            </div>
            <p class="text-[10px] text-on-surface-variant">${r.jumlah} anggota · ${r.h}/${r.total} hadir</p>
          </div>
        `).join("")}
      </div>
    </div>`;
  }
}

/* =========================================================
 * TAB: GRID
 * ========================================================= */
function renderTabGrid() {
  const c = document.getElementById("tab-content");
  if (!c) return;

  const tanggalSet = [...new Set(SEMUA_SESI.map((s) => s.tanggal))].sort().reverse().slice(0, 30).reverse();

  if (!tanggalSet.length) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">grid_on</span>
      <p class="text-sm text-on-surface-variant">Belum ada data untuk grid presensi</p>
    </div>`;
    return;
  }

  let siswaList = SEMUA_SISWA;
  if (ME.profile.peran.startsWith("Koordinator")) {
    siswaList = SEMUA_SISWA.filter((s) => s.divisi === ME.profile.divisi);
  }

  const cols = tanggalSet.length;
  const colWidth = 36;

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h3 class="font-headline font-semibold">Grid Presensi</h3>
        <p class="text-xs text-on-surface-variant">${siswaList.length} siswa × ${cols} tanggal</p>
      </div>
      <button id="btn-export-grid" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">download</span> Export
      </button>
    </div>

    <div class="overflow-x-auto">
      <table class="text-[10px]" style="min-width: ${300 + cols * colWidth}px;">
        <thead>
          <tr>
            <th class="sticky left-0 bg-surface-container p-2 text-left z-10 min-w-[180px]">Nama</th>
            ${tanggalSet.map((t) => {
              const d = new Date(t);
              return `<th class="p-1 text-center" style="min-width:${colWidth}px">
                <div class="text-[9px] text-on-surface-variant">${d.getDate()}/${d.getMonth() + 1}</div>
              </th>`;
            }).join("")}
            <th class="p-1 text-center bg-surface-container">%</th>
          </tr>
        </thead>
        <tbody>
          ${siswaList.map((s) => {
            const khSiswa = SEMUA_KEHADIRAN.filter((k) => k.siswaUid === s.uid);
            let hadir = 0, total = 0;
            const cells = tanggalSet.map((t) => {
              const sesiHariIni = SEMUA_SESI.filter((x) => x.tanggal === t);
              const sesiIds = sesiHariIni.map((x) => x.id);
              const kh = khSiswa.filter((k) => sesiIds.includes(k.sesiId));
              if (kh.length) {
                total++;
                if (kh.some((k) => k.status === "Hadir")) hadir++;
                const status = kh.some((k) => k.status === "Alpa") ? "A" :
                  kh.some((k) => k.status === "Sakit") ? "S" :
                  kh.some((k) => k.status === "Izin") ? "I" : "H";
                const color = status === "H" ? "bg-green-600" : status === "I" ? "bg-blue-600" : status === "S" ? "bg-yellow-500" : "bg-error";
                return `<td class="p-0.5 text-center"><div class="w-6 h-6 mx-auto rounded ${color} text-white text-[9px] font-bold flex items-center justify-center">${status}</div></td>`;
              }
              return `<td class="p-0.5 text-center"><div class="w-6 h-6 mx-auto rounded bg-surface-container-high text-on-surface-variant text-[9px] flex items-center justify-center">-</div></td>`;
            }).join("");
            const persen = total ? Math.round((hadir / total) * 100) : 0;
            return `<tr class="border-b border-outline-variant/20">
              <td class="sticky left-0 bg-surface-container p-2 font-medium z-10 truncate" style="max-width:180px;">
                ${esc(s.nama)}
                <div class="text-[9px] text-on-surface-variant font-normal">${esc(s.peran)}</div>
              </td>
              ${cells}
              <td class="p-1 text-center font-bold ${persen >= 80 ? "text-green-400" : persen >= 60 ? "text-yellow-400" : "text-error"}">${persen}%</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-3 mt-4 pt-4 border-t border-outline-variant/40 text-[10px]">
      <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-600"></span>Hadir</span>
      <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-600"></span>Izin</span>
      <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-yellow-500"></span>Sakit</span>
      <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-error"></span>Alpa</span>
    </div>
  </div>`;

  document.getElementById("btn-export-grid")?.addEventListener("click", () => {
    const csv = ["Nama,Peran," + tanggalSet.join(",") + ",Persen"];
    siswaList.forEach((s) => {
      const khSiswa = SEMUA_KEHADIRAN.filter((k) => k.siswaUid === s.uid);
      let hadir = 0, total = 0;
      const row = tanggalSet.map((t) => {
        const sesiIds = SEMUA_SESI.filter((x) => x.tanggal === t).map((x) => x.id);
        const kh = khSiswa.filter((k) => sesiIds.includes(k.sesiId));
        if (kh.length) {
          total++;
          if (kh.some((k) => k.status === "Hadir")) hadir++;
          return kh.some((k) => k.status === "Alpa") ? "A" : kh.some((k) => k.status === "Sakit") ? "S" : kh.some((k) => k.status === "Izin") ? "I" : "H";
        }
        return "-";
      });
      const persen = total ? Math.round((hadir / total) * 100) : 0;
      csv.push(`"${s.nama}","${s.peran}",${row.join(",")},${persen}%`);
    });
    downloadCSV(csv.join("\n"), `grid_presensi_${Date.now()}.csv`);
  });
}

/* =========================================================
 * EXPORT CSV
 * ========================================================= */
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  showToast("Export berhasil!", "success");
}

function handleExport(tipe) {
  let csv = "";
  const timestamp = new Date().toISOString().slice(0, 10);

  if (tipe === "csv-sesi") {
    csv = "Judul,Jenis,Tanggal,Jam,Lokasi,Total,Hadir,Izin,Sakit,Alpa,Persen\n";
    SEMUA_SESI.forEach((s) => {
      const kh = SEMUA_KEHADIRAN.filter((k) => k.sesiId === s.id);
      const h = kh.filter((k) => k.status === "Hadir").length;
      const i = kh.filter((k) => k.status === "Izin").length;
      const sa = kh.filter((k) => k.status === "Sakit").length;
      const a = kh.filter((k) => k.status === "Alpa").length;
      const persen = kh.length ? Math.round((h / kh.length) * 100) : 0;
      csv += `"${s.judul}","${s.jenis}","${s.tanggal}","${s.jam}","${s.lokasi}",${kh.length},${h},${i},${sa},${a},${persen}%\n`;
    });
    downloadCSV(csv, `rekap_per_sesi_${timestamp}.csv`);
  }
  if (tipe === "csv-siswa") {
    csv = "Nama,Peran,Kelas,Total Hadir,Total Sesi,Persen\n";
    SEMUA_SISWA.forEach((s) => {
      const kh = SEMUA_KEHADIRAN.filter((k) => k.siswaUid === s.uid);
      const h = kh.filter((k) => k.status === "Hadir").length;
      const persen = kh.length ? Math.round((h / kh.length) * 100) : 0;
      csv += `"${s.nama}","${s.peran}","${s.kelas || ""}",${h},${kh.length},${persen}%\n`;
    });
    downloadCSV(csv, `rekap_per_siswa_${timestamp}.csv`);
  }
  if (tipe === "csv-divisi") {
    csv = "Divisi,Jumlah Anggota,Total Hadir,Total Sesi,Persen\n";
    const divisiSet = [...new Set(SEMUA_SISWA.map((s) => s.divisi).filter(Boolean))];
    divisiSet.forEach((d) => {
      const sUids = SEMUA_SISWA.filter((s) => s.divisi === d).map((s) => s.uid);
      const kh = SEMUA_KEHADIRAN.filter((k) => sUids.includes(k.siswaUid));
      const h = kh.filter((k) => k.status === "Hadir").length;
      const persen = kh.length ? Math.round((h / kh.length) * 100) : 0;
      csv += `"${d}",${sUids.length},${h},${kh.length},${persen}%\n`;
    });
    downloadCSV(csv, `rekap_per_divisi_${timestamp}.csv`);
  }
}

/* =========================================================
 * INIT
 * ========================================================= */
(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

    const menu = [
      { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
      { icon: "fact_check", label: "Absensi", href: "absensi.html" },
      { icon: "checklist", label: "Checklist", href: "checklist.html" },
      { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
      { icon: "groups", label: "Struktur", href: "struktur.html" },
      { icon: "folder", label: "Arsip", href: "arsip.html" },
      { icon: "support_agent", label: "Aduan", href: "aduan.html" },
      { icon: "description", label: "Rapor", href: "rapor.html" },
    ];
    const nav = document.getElementById("sidebar-nav");
    if (nav) nav.innerHTML = menu.map((m) => `
      <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "absensi.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
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
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
      { icon: "checklist", label: "Tugas", href: "checklist.html" },
      { icon: "groups", label: "Kerabat", href: "struktur.html" },
    ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "absensi.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

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
      sb.classList.toggle("hidden");
      sb.classList.toggle("flex");
    });

    initNotifikasi(uid, profile);
    document.getElementById("btn-notif")?.addEventListener("click", bukaPanelNotif);

    await loadSemua();

    document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) =>
      b.addEventListener("click", () => switchTab(b.dataset.tab))
    );

    document.getElementById("s-cakupan")?.addEventListener("change", (e) => {
      const t = document.getElementById("s-target");
      if (!t) return;
      t.classList.toggle("hidden", e.target.value !== "divisi" && e.target.value !== "peran");
    });

    document.getElementById("form-sesi")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const hak = cekHakBuat();
      const tipe = hak.tipe;
      const cakupan = tipe === "bebas" ? document.getElementById("s-cakupan").value : tipe;
      const target = tipe === "bebas" ? document.getElementById("s-target").value.trim() : "";

      try {
        const peserta = await ambilPeserta(tipe, cakupan, target);
        const pesertaUids = peserta.map((p) => p.uid);

        await addDoc(collection(db, "sesiAbsensi"), {
          judul: document.getElementById("s-judul").value.trim(),
          jenis: document.getElementById("s-jenis").value,
          tanggal: document.getElementById("s-tanggal").value,
          jam: document.getElementById("s-jam").value,
          lokasi: document.getElementById("s-lokasi").value.trim(),
          cakupan, target, tipe,
          pesertaUids,
          pembuatUid: ME.uid,
          pembuatNama: ME.profile.nama,
          pembuatPeran: ME.profile.peran,
          createdAt: serverTimestamp(),
        });

        if (pesertaUids.length) {
          await kirimNotifikasiBanyak({
            penerimaUids: pesertaUids,
            jenis: "Tugas",
            judul: `Absensi Dibuka: ${document.getElementById("s-judul").value}`,
            pesan: `${ME.profile.nama} membuka sesi absensi. Isi kehadiran segera.`,
            dari: ME.profile.nama,
            link: "absensi.html",
          });
        }

        await logActivity(ME.uid, "buat_sesi_absensi", tipe);
        showToast(`Sesi absensi dibuat untuk ${pesertaUids.length} peserta!`, "success");
        closeModal("modal-sesi");
        e.target.reset();
        await loadSemua();
        renderSesiList();
      } catch (err) {
        console.error(err);
        showToast("Gagal membuat sesi.", "error");
      }
    });

    document.getElementById("btn-semua-hadir")?.addEventListener("click", () => {
      document.querySelectorAll(".status-siswa").forEach((s) => (s.value = "Hadir"));
    });

    document.getElementById("btn-simpan-absen")?.addEventListener("click", async () => {
      const rows = document.querySelectorAll("#isi-list [data-uid]");
      let sukses = 0;
      for (const r of rows) {
        const uid = r.dataset.uid;
        const status = r.querySelector(".status-siswa").value;
        try {
          const cek = await getDocs(query(collection(db, "kehadiran"), where("sesiId", "==", SESI_AKTIF), where("siswaUid", "==", uid)));
          if (!cek.empty) {
            await updateDoc(doc(db, "kehadiran", cek.docs[0].id), { status, waktu: serverTimestamp() });
          } else {
            await addDoc(collection(db, "kehadiran"), { sesiId: SESI_AKTIF, siswaUid: uid, status, metode: "manual", waktu: serverTimestamp() });
          }
          sukses++;
        } catch (e) { console.error(e); }
      }
      showToast(`${sukses} absensi tersimpan!`, "success");
      closeModal("modal-isi");
      await loadSemua();
      renderSesiList();
    });

    document.querySelectorAll("[data-export]").forEach((b) =>
      b.addEventListener("click", () => {
        handleExport(b.dataset.export);
        closeModal("modal-export");
      })
    );

    switchTab("sesi");
  } catch (e) {
    console.error("[Absensi] Fatal:", e);
    const c = document.getElementById("tab-content");
    if (c) c.innerHTML = `<div class="glass rounded-2xl p-8 text-center"><span class="material-symbols-outlined text-5xl text-error mb-3">error</span><p class="text-sm text-error">${esc(e.message || "Gagal memuat")}</p></div>`;
  }
})();
