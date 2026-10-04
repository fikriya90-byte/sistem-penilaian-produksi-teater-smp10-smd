/**
 * SP-PPT — Modul Checklist & Tugas
 * Fix FIX-07: null-safe, error boundary, no orphan refs.
 */

import { auth, db } from "./firebase-init.js";
import {
  doc, addDoc, updateDoc, collection, query, where, getDocs,
  serverTimestamp, limit, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, countdown,
  esc, warnaPeran, inisial, logActivity, formatTanggal,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasi, kirimNotifikasiBanyak } from "./notifikasi.js";
import { CHECKLIST_PER_PERAN, KANBAN_KOLOM } from "./checklist-data.js";

let ME = null;
let TAB = "list";
let TUGAS = [];
let TAHAPAN_AKTIF = "persiapan";
let TUGAS_DIPILIH = null;

function bolehBuat() {
  const p = ME.profile.peran, r = ME.profile.role;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sekretaris", "Sutradara", "Asisten Sutradara"].includes(p) ||
    p.startsWith("Koordinator");
}

function bolehVerifikasi() {
  const p = ME.profile.peran, r = ME.profile.role;
  return r === "guru" || r === "admin" ||
    ["Pimpinan Produksi", "Sutradara"].includes(p) ||
    p.startsWith("Koordinator");
}

async function ambilTahapanAktif() {
  try {
    const snap = await getDocs(query(collection(db, "periodes"), where("aktif", "==", true), limit(1)));
    if (!snap.empty) {
      const p = snap.docs[0].data();
      TAHAPAN_AKTIF = p.tahapanAktif || "persiapan";
    }
  } catch (e) { /* default */ }
}

async function autoPopulateChecklist() {
  const peran = ME.profile.peran;
  const template = CHECKLIST_PER_PERAN[peran] || [];
  if (!template.length) return;
  try {
    const cekSnap = await getDocs(query(
      collection(db, "tugas"),
      where("autoPeran", "==", peran),
      where("tahapan", "==", TAHAPAN_AKTIF)
    ));
    const sudahAda = cekSnap.docs.map((d) => d.data().judul);
    for (const t of template) {
      if (t.tahapan !== TAHAPAN_AKTIF) continue;
      if (sudahAda.includes(t.nama)) continue;
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 14);
      await addDoc(collection(db, "tugas"), {
        judul: t.nama,
        deskripsi: `Checklist default untuk peran ${peran} di tahapan ${TAHAPAN_AKTIF}`,
        deadline: deadline.toISOString().slice(0, 16),
        prioritas: t.prioritas || "Sedang",
        tahapan: t.tahapan,
        target: "peran",
        peran: peran,
        autoPeran: peran,
        pembuatUid: "system",
        pembuatNama: "Sistem SP-PPT",
        statusPerSiswa: {},
        createdAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("[Tugas] autoPopulate gagal:", e);
  }
}

async function ambilTugas() {
  try {
    const snap = await getDocs(query(collection(db, "tugas"), limit(200)));
    const semua = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    TUGAS = semua.filter((t) => {
      if (!t.target || t.target === "semua") return true;
      if (t.target === "divisi" && t.divisi === ME.profile.divisi) return true;
      if (t.target === "peran" && t.peran === ME.profile.peran) return true;
      if (t.target === "custom" && (t.penerimaUids || []).includes(ME.uid)) return true;
      if (ME.profile.role === "guru" || ME.profile.role === "admin") return true;
      return false;
    });

    // Check deadline
    const now = Date.now();
    TUGAS = TUGAS.map((t) => {
      const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
      const deadlineMs = new Date(t.deadline).getTime();
      if (status !== "Selesai" && deadlineMs < now && status !== "Terlewat") {
        updateDoc(doc(db, "tugas", t.id), { [`statusPerSiswa.${ME.uid}`]: "Terlewat" }).catch(() => {});
        return { ...t, statusPerSiswa: { ...(t.statusPerSiswa || {}), [ME.uid]: "Terlewat" } };
      }
      return t;
    });
  } catch (e) {
    console.warn("[Tugas] ambil gagal:", e);
    TUGAS = [];
  }
}

function updateProgress() {
  const pctEl = document.getElementById("progres-pct");
  const barEl = document.getElementById("progres-bar");
  const countEl = document.getElementById("progres-count");
  const tahapEl = document.getElementById("progres-tahapan");
  if (!pctEl || !barEl || !countEl) return;

  if (!TUGAS.length) {
    pctEl.textContent = "0%"; barEl.style.width = "0%"; countEl.textContent = "0/0";
    ["stat-belum", "stat-proses", "stat-selesai", "stat-terlewat"].forEach((id) => {
      const el = document.getElementById(id); if (el) el.textContent = "0";
    });
    if (tahapEl) tahapEl.textContent = `Tahapan aktif: ${TAHAPAN_AKTIF}`;
    return;
  }

  const counts = { belum: 0, proses: 0, selesai: 0, terlewat: 0 };
  TUGAS.forEach((t) => {
    const s = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
    if (s === "Selesai") counts.selesai++;
    else if (s === "Sedang Dikerjakan") counts.proses++;
    else if (s === "Terlewat") counts.terlewat++;
    else counts.belum++;
  });

  const total = TUGAS.length;
  const pct = Math.round((counts.selesai / total) * 100);
  pctEl.textContent = pct + "%";
  barEl.style.width = pct + "%";
  countEl.textContent = `${counts.selesai}/${total}`;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("stat-belum", counts.belum); set("stat-proses", counts.proses);
  set("stat-selesai", counts.selesai); set("stat-terlewat", counts.terlewat);
  if (tahapEl) tahapEl.textContent = `Tahapan aktif: ${TAHAPAN_AKTIF.charAt(0).toUpperCase() + TAHAPAN_AKTIF.slice(1)}`;
}

function statusBadge(status) {
  const map = {
    "Selesai": "bg-green-600 text-white",
    "Sedang Dikerjakan": "bg-blue-600 text-white",
    "Terlewat": "bg-error text-white",
    "Belum Dikerjakan": "bg-surface-container-highest text-on-surface-variant",
  };
  return map[status] || map["Belum Dikerjakan"];
}

function prioritasBadge(p) {
  const map = {
    Rendah: "bg-gray-500/20 text-gray-400",
    Sedang: "bg-blue-500/20 text-blue-400",
    Tinggi: "bg-orange-500/20 text-orange-400",
    Kritis: "bg-error/20 text-error",
  };
  return map[p] || map.Sedang;
}

/* =============== TAB SWITCH =============== */
function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"}`;
  });
  if (tab === "list") renderList();
  if (tab === "kanban") renderKanban();
  if (tab === "verifikasi") renderVerifikasi();
  if (tab === "riwayat") renderRiwayat();
}

/* =============== LIST =============== */
function renderList() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  if (!TUGAS.length) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">task_alt</span>
      <p class="text-sm text-on-surface-variant mb-4">Belum ada tugas untuk Anda</p>
    </div>`;
    return;
  }

  const sorted = [...TUGAS].sort((a, b) => {
    const prio = { Kritis: 0, Tinggi: 1, Sedang: 2, Rendah: 3 };
    const pa = prio[a.prioritas] ?? 9;
    const pb = prio[b.prioritas] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(a.deadline || 0) - new Date(b.deadline || 0);
  });

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold">Daftar Tugas</h3>
      <select id="filter-status" class="px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-xs">
        <option value="all">Semua Status</option>
        <option value="Belum Dikerjakan">Belum Dikerjakan</option>
        <option value="Sedang Dikerjakan">Sedang Dikerjakan</option>
        <option value="Selesai">Selesai</option>
        <option value="Terlewat">Terlewat</option>
      </select>
    </div>
    <div id="list-container" class="space-y-2"></div>
  </div>`;

  renderListItems(sorted);

  document.getElementById("filter-status")?.addEventListener("change", (e) => {
    const f = e.target.value;
    const filtered = f === "all" ? sorted : sorted.filter((t) => (t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan") === f);
    renderListItems(filtered);
  });
}

function renderListItems(list) {
  const el = document.getElementById("list-container");
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-6">Tidak ada tugas dengan filter ini</p>`;
    return;
  }

  el.innerHTML = list.map((t) => {
    const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
    const bukti = t.buktiPerSiswa?.[ME.uid];
    const verifikasi = t.verifikasiPerSiswa?.[ME.uid];
    const isSelesai = status === "Selesai";

    return `
    <div class="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition border-l-4 ${
      t.prioritas === "Kritis" ? "border-error" :
      t.prioritas === "Tinggi" ? "border-orange-500" :
      t.prioritas === "Sedang" ? "border-blue-500" : "border-gray-500"
    }">
      <div class="flex items-start gap-3">
        <button class="chk-toggle shrink-0 mt-0.5 w-5 h-5 rounded border-2 ${isSelesai ? "bg-primary border-primary" : "border-outline-variant"} flex items-center justify-center transition" data-id="${t.id}">
          ${isSelesai ? '<span class="material-symbols-outlined text-on-primary text-sm">check</span>' : ""}
        </button>
        <div class="flex-1 min-w-0 cursor-pointer btn-detail" data-id="${t.id}">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <p class="text-sm font-medium ${isSelesai ? "line-through opacity-60" : ""}">${esc(t.judul)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${statusBadge(status)}">${status}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${prioritasBadge(t.prioritas)}">${t.prioritas || "Sedang"}</span>
            ${verifikasi?.status === "verified" ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">✓ Terverifikasi</span>' : ""}
            ${verifikasi?.status === "revisi" ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">⚠ Revisi</span>' : ""}
          </div>
          ${t.deskripsi ? `<p class="text-xs text-on-surface-variant line-clamp-2 mt-0.5">${esc(t.deskripsi)}</p>` : ""}
          <div class="flex items-center gap-3 mt-2 text-[10px] text-on-surface-variant flex-wrap">
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">schedule</span>${countdown(t.deadline)} lagi</span>
            <span>${formatTanggal(t.deadline)}</span>
            ${bukti ? '<span class="text-green-400">📎 Bukti</span>' : ""}
          </div>
        </div>
        <span class="material-symbols-outlined text-on-surface-variant text-sm shrink-0">chevron_right</span>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll(".chk-toggle").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleStatus(b.dataset.id); })
  );
  el.querySelectorAll(".btn-detail").forEach((b) =>
    b.addEventListener("click", () => bukaDetail(b.dataset.id))
  );
}

async function toggleStatus(tugasId) {
  const t = TUGAS.find((x) => x.id === tugasId);
  if (!t) return;
  const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
  const baru = status === "Selesai" ? "Sedang Dikerjakan" : "Selesai";
  try {
    await updateDoc(doc(db, "tugas", tugasId), {
      [`statusPerSiswa.${ME.uid}`]: baru,
      updatedAt: serverTimestamp(),
    });
    await logActivity(ME.uid, `toggle_tugas_${baru}`, tugasId);
    showToast(baru === "Selesai" ? "Tugas ditandai selesai" : "Tugas dibuka kembali", "success");
    await refresh();
  } catch (e) {
    console.error(e);
    showToast("Gagal update status.", "error");
  }
}

/* =============== KANBAN =============== */
function renderKanban() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold">Papan Kanban</h3>
      <p class="text-xs text-on-surface-variant flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">drag_indicator</span>Drag kartu antar kolom
      </p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" id="kanban-board"></div>
  </div>`;

  const board = document.getElementById("kanban-board");
  if (!board) return;
  board.innerHTML = KANBAN_KOLOM.map((k) => {
    const items = TUGAS.filter((t) => (t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan") === k.id);
    return `
    <div class="kanban-col rounded-xl bg-surface-container border border-outline-variant/40 min-h-[400px] flex flex-col">
      <div class="p-3 border-b border-outline-variant/40 flex items-center justify-between">
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${k.warna
