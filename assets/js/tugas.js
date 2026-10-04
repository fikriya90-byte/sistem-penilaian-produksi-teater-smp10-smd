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
        <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${k.warna}"></span><span class="text-sm font-medium">${k.label}</span></div>
        <span class="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">${items.length}</span>
      </div>
      <div class="kanban-drop p-2 space-y-2 flex-1 min-h-[300px]" data-status="${k.id}">
        ${items.map((t) => `
          <div class="kanban-card p-3 rounded-lg bg-surface-container-high cursor-grab active:cursor-grabbing hover:bg-surface-container-highest transition border border-outline-variant/40"
            draggable="true" data-id="${t.id}">
            <div class="flex items-start justify-between gap-2 mb-1">
              <p class="text-xs font-medium line-clamp-2">${esc(t.judul)}</p>
              <span class="text-[9px] px-1.5 py-0.5 rounded-full ${prioritasBadge(t.prioritas)} shrink-0">${t.prioritas || "-"}</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-on-surface-variant mt-2">
              <span class="material-symbols-outlined text-xs">schedule</span>${countdown(t.deadline)}
            </div>
          </div>
        `).join("") || `<p class="text-[10px] text-on-surface-variant text-center py-4">Kosong</p>`}
      </div>
    </div>`;
  }).join("");

  bindKanbanDragDrop();
}

function bindKanbanDragDrop() {
  let draggedId = null;
  let draggedFrom = null;

  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      draggedId = card.dataset.id;
      draggedFrom = card.closest(".kanban-drop")?.dataset.status;
      card.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => { card.style.opacity = ""; });
  });

  document.querySelectorAll(".kanban-drop").forEach((drop) => {
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("bg-primary-container/20", "ring-2", "ring-primary/40");
    });
    drop.addEventListener("dragleave", () => {
      drop.classList.remove("bg-primary-container/20", "ring-2", "ring-primary/40");
    });
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("bg-primary-container/20", "ring-2", "ring-primary/40");
      const newStatus = drop.dataset.status;
      if (!draggedId || draggedFrom === newStatus) return;
      try {
        await updateDoc(doc(db, "tugas", draggedId), {
          [`statusPerSiswa.${ME.uid}`]: newStatus,
          updatedAt: serverTimestamp(),
        });
        await logActivity(ME.uid, `kanban_move_${newStatus}`, draggedId);
        showToast(`Dipindah ke ${newStatus}`, "success");
        await refresh();
      } catch (err) { showToast("Gagal memindahkan.", "error"); }
    });
  });
}

/* =============== VERIFIKASI =============== */
async function renderVerifikasi() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  if (!bolehVerifikasi()) {
    c.innerHTML = `<div class="glass rounded-2xl p-10 text-center">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
      <p class="text-sm text-on-surface-variant">Hanya Koordinator/Guru/Sutradara/Pimpinan.</p>
    </div>`;
    return;
  }

  c.innerHTML = `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4">Verifikasi Tugas Siswa</h3>
    <div class="flex gap-2 mb-4 flex-wrap">
      <button data-vf="pending" class="vf-tab px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium">Menunggu</button>
      <button data-vf="verified" class="vf-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container">Terverifikasi</button>
      <button data-vf="revisi" class="vf-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container">Perlu Revisi</button>
    </div>
    <div id="vf-list" class="space-y-3">${skeleton(3)}</div>
  </div>`;

  const renderVerifList = async (filter = "pending") => {
    const el = document.getElementById("vf-list");
    if (!el) return;
    el.innerHTML = skeleton(3);

    const items = [];
    for (const t of TUGAS) {
      const statusPer = t.statusPerSiswa || {};
      const buktiPer = t.buktiPerSiswa || {};
      const verifPer = t.verifikasiPerSiswa || {};

      for (const [uid, status] of Object.entries(statusPer)) {
        if (status !== "Selesai") continue;
        const v = verifPer[uid];
        if (filter === "pending" && v) continue;
        if (filter === "verified" && v?.status !== "verified") continue;
        if (filter === "revisi" && v?.status !== "revisi") continue;

        try {
          const sSnap = await getDocs(query(collection(db, "users"), where("__name__", "==", uid)));
          if (sSnap.empty) continue;
          const siswa = sSnap.docs[0].data();
          if (ME.profile.peran.startsWith("Koordinator") && siswa.divisi !== ME.profile.divisi) continue;
          if (ME.profile.peran === "Sutradara" && siswa.peran !== "Pemain") continue;
          items.push({ tugas: t, uid, siswa, bukti: buktiPer[uid], verif: v });
        } catch (e) { /* skip */ }
      }
    }

    if (!items.length) {
      el.innerHTML = `<p class="text-sm text-on-surface-variant text-center py-8">Tidak ada item untuk diverifikasi</p>`;
      return;
    }

    el.innerHTML = items.map((item) => `
      <div class="p-4 rounded-xl bg-surface-container border-l-4 ${item.verif?.status === "verified" ? "border-green-500" : item.verif?.status === "revisi" ? "border-orange-500" : "border-yellow-500"}">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-semibold text-sm shrink-0">${inisial(item.siswa.nama)}</div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">${esc(item.siswa.nama)}</p>
            <p class="text-xs text-on-surface-variant">${esc(item.siswa.peran)}</p>
            <div class="mt-2 p-2 rounded-lg bg-surface-container-high">
              <p class="text-xs font-medium">${esc(item.tugas.judul)}</p>
              <p class="text-[10px] text-on-surface-variant mt-0.5">Deadline: ${formatTanggal(item.tugas.deadline)}</p>
            </div>
            ${item.bukti ? `
              <div class="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                <p class="text-[10px] text-green-400 font-medium mb-1">Bukti:</p>
                ${item.bukti.url ? `<a href="${esc(item.bukti.url)}" target="_blank" class="text-xs text-primary underline break-all">${esc(item.bukti.url)}</a>` : ""}
              </div>` : '<p class="text-[10px] text-orange-400 mt-2">Belum ada bukti</p>'}
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          ${(!item.verif || filter === "pending") ? `
            <button class="btn-verify px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium" data-tugas="${item.tugas.id}" data-uid="${item.uid}">✓ Verifikasi</button>
            <button class="btn-revisi px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-medium" data-tugas="${item.tugas.id}" data-uid="${item.uid}">✎ Minta Revisi</button>` : ""}
        </div>
      </div>
    `).join("");

    el.querySelectorAll(".btn-verify").forEach((b) =>
      b.addEventListener("click", async () => {
        const komentar = prompt("Komentar verifikasi (opsional):") || "Disetujui.";
        try {
          await updateDoc(doc(db, "tugas", b.dataset.tugas), {
            [`verifikasiPerSiswa.${b.dataset.uid}`]: {
              status: "verified", olehUid: ME.uid, olehNama: ME.profile.nama,
              komentar, waktu: new Date().toISOString(),
            },
          });
          await kirimNotifikasi({
            penerimaUid: b.dataset.uid, jenis: "Info",
            judul: "Tugas Terverifikasi",
            pesan: `Tugas Anda telah diverifikasi oleh ${ME.profile.nama}.`,
            dari: ME.profile.nama, link: "checklist.html",
          });
          await logActivity(ME.uid, "verifikasi_tugas", b.dataset.tugas);
          showToast("Tugas diverifikasi.", "success");
          renderVerifList(filter);
        } catch (e) { showToast("Gagal verifikasi.", "error"); }
      })
    );

    el.querySelectorAll(".btn-revisi").forEach((b) =>
      b.addEventListener("click", async () => {
        const komentar = prompt("Alasan revisi (wajib):");
        if (!komentar?.trim()) return showToast("Alasan wajib diisi.", "warning");
        try {
          await updateDoc(doc(db, "tugas", b.dataset.tugas), {
            [`verifikasiPerSiswa.${b.dataset.uid}`]: {
              status: "revisi", olehUid: ME.uid, olehNama: ME.profile.nama,
              komentar, waktu: new Date().toISOString(),
            },
            [`statusPerSiswa.${b.dataset.uid}`]: "Sedang Dikerjakan",
          });
          await kirimNotifikasi({
            penerimaUid: b.dataset.uid, jenis: "Reminder",
            judul: "Tugas Perlu Revisi",
            pesan: `${ME.profile.nama} meminta revisi: ${komentar}`,
            dari: ME.profile.nama, link: "checklist.html",
          });
          await logActivity(ME.uid, "minta_revisi", b.dataset.tugas);
          showToast("Permintaan revisi terkirim.", "success");
          renderVerifList(filter);
        } catch (e) { showToast("Gagal minta revisi.", "error"); }
      })
    );
  };

  renderVerifList("pending");
  document.querySelectorAll(".vf-tab").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".vf-tab").forEach((x) => {
        x.className = "vf-tab px-3 py-1.5 rounded-lg text-xs bg-surface-container";
      });
      b.className = "vf-tab px-3 py-1.5 rounded-lg text-xs bg-primary-container text-primary font-medium";
      renderVerifList(b.dataset.vf);
    })
  );
}

/* =============== RIWAYAT =============== */
async function renderRiwayat() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4">Riwayat Per Tahapan</h3>
    <div class="space-y-3">
      ${["persiapan", "pelaksanaan", "pertunjukan", "pasca"].map((tahap) => {
        const items = TUGAS.filter((t) => t.tahapan === tahap);
        if (!items.length) return "";
        return `
        <div>
          <h4 class="text-sm font-medium text-secondary mb-2">Tahapan ${tahap.charAt(0).toUpperCase() + tahap.slice(1)}</h4>
          <div class="space-y-1.5 pl-4">
            ${items.map((t) => {
              const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
              return `<div class="p-2 rounded-lg bg-surface-container text-xs flex items-center justify-between gap-2">
                <span class="flex-1 truncate">${esc(t.judul)}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge(status)} shrink-0">${status}</span>
              </div>`;
            }).join("")}
          </div>
        </div>`;
      }).join("") || `<p class="text-sm text-on-surface-variant text-center py-8">Belum ada riwayat</p>`}
    </div>
  </div>`;
}

/* =============== DETAIL =============== */
function bukaDetail(tugasId) {
  const t = TUGAS.find((x) => x.id === tugasId);
  if (!t) return;
  TUGAS_DIPILIH = t;

  const status = t.statusPerSiswa?.[ME.uid] || "Belum Dikerjakan";
  const bukti = t.buktiPerSiswa?.[ME.uid];
  const verif = t.verifikasiPerSiswa?.[ME.uid];

  const judulEl = document.getElementById("detail-judul");
  if (judulEl) judulEl.textContent = t.judul;

  const content = document.getElementById("detail-content");
  if (!content) return;

  content.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[10px] px-2 py-1 rounded-full ${statusBadge(status)}">${status}</span>
        <span class="text-[10px] px-2 py-1 rounded-full ${prioritasBadge(t.prioritas)}">Prioritas: ${t.prioritas || "Sedang"}</span>
        <span class="text-[10px] px-2 py-1 rounded-full bg-surface-container-high">Tahap: ${esc(t.tahapan || "-")}</span>
      </div>
      ${t.deskripsi ? `<div><p class="text-xs text-on-surface-variant mb-1">Deskripsi</p><p class="text-sm">${esc(t.deskripsi)}</p></div>` : ""}
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-lg bg-surface-container"><p class="text-on-surface-variant mb-1">Deadline</p><p class="font-medium">${formatTanggal(t.deadline)}</p></div>
        <div class="p-3 rounded-lg bg-surface-container"><p class="text-on-surface-variant mb-1">Sisa Waktu</p><p class="font-medium text-secondary">${countdown(t.deadline)}</p></div>
      </div>
      ${bukti ? `
        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <p class="text-xs font-medium text-green-400 mb-2">📎 Bukti Terupload</p>
          ${bukti.url ? `<a href="${esc(bukti.url)}" target="_blank" class="text-xs text-primary underline break-all block">${esc(bukti.url)}</a>` : ""}
          ${bukti.catatan ? `<p class="text-xs text-on-surface-variant mt-1">${esc(bukti.catatan)}</p>` : ""}
        </div>` : ""}
      ${verif ? `
        <div class="p-3 rounded-lg ${verif.status === "verified" ? "bg-green-500/10 border-green-500/30" : "bg-orange-500/10 border-orange-500/30"} border">
          <p class="text-xs font-medium ${verif.status === "verified" ? "text-green-400" : "text-orange-400"} mb-1">
            ${verif.status === "verified" ? "✓ Terverifikasi" : "⚠ Perlu Revisi"} oleh ${esc(verif.olehNama || "-")}
          </p>
          ${verif.komentar ? `<p class="text-xs">${esc(verif.komentar)}</p>` : ""}
        </div>` : ""}
      <div class="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/40">
        <button id="btn-upload-bukti" class="flex-1 min-w-[120px] py-2.5 rounded-lg bg-primary text-on-primary text-xs font-medium">📤 Upload Bukti</button>
        ${status !== "Selesai" ? `<button id="btn-tandai-selesai" class="flex-1 min-w-[120px] py-2.5 rounded-lg bg-green-600 text-white text-xs font-medium">✓ Tandai Selesai</button>` : ""}
      </div>
    </div>`;

  openModal("modal-detail");

  setTimeout(() => {
    document.getElementById("btn-upload-bukti")?.addEventListener("click", () => {
      closeModal("modal-detail");
      openModal("modal-upload");
    });
    document.getElementById("btn-tandai-selesai")?.addEventListener("click", async () => {
      await toggleStatus(tugasId);
      closeModal("modal-detail");
    });
  }, 50);
}

/* =============== UPLOAD BUKTI =============== */
document.getElementById("btn-simpan-bukti")?.addEventListener("click", async () => {
  if (!TUGAS_DIPILIH) return;
  const url = document.getElementById("up-url").value.trim();
  const catatan = document.getElementById("up-catatan").value.trim();
  if (!url) return showToast("Isi URL bukti.", "warning");
  try {
    await updateDoc(doc(db, "tugas", TUGAS_DIPILIH.id), {
      [`buktiPerSiswa.${ME.uid}`]: { url, catatan, waktu: new Date().toISOString() },
      [`statusPerSiswa.${ME.uid}`]: "Sedang Dikerjakan",
    });
    await logActivity(ME.uid, "upload_bukti_tugas", TUGAS_DIPILIH.id);
    showToast("Bukti tersimpan.", "success");
    closeModal("modal-upload");
    document.getElementById("up-url").value = "";
    document.getElementById("up-catatan").value = "";
    await refresh();
  } catch (e) { showToast("Gagal simpan bukti.", "error"); }
});

/* =============== REFRESH =============== */
async function refresh() {
  await ambilTugas();
  updateProgress();
  if (TAB === "list") renderList();
  if (TAB === "kanban") renderKanban();
  if (TAB === "riwayat") renderRiwayat();
}

/* =============== INIT =============== */
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
      <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "checklist.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
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
    ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "checklist.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

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

    await ambilTahapanAktif();
    await autoPopulateChecklist();
    await ambilTugas();
    updateProgress();

    document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) =>
      b.addEventListener("click", () => switchTab(b.dataset.tab))
    );

    // FAB buat tugas
    if (bolehBuat()) {
      const btn = document.createElement("button");
      btn.className = "fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-40 px-4 py-3 rounded-full bg-primary text-on-primary font-medium text-sm shadow-xl hover:scale-105 transition flex items-center gap-2";
      btn.innerHTML = `<span class="material-symbols-outlined">add</span> Tugas Baru`;
      btn.addEventListener("click", () => openModal("modal-tugas"));
      document.body.appendChild(btn);
    }

    document.getElementById("form-tugas")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const target = document.getElementById("t-target").value;
        await addDoc(collection(db, "tugas"), {
          judul: document.getElementById("t-judul").value.trim(),
          deskripsi: document.getElementById("t-desk").value.trim(),
          deadline: document.getElementById("t-deadline").value,
          prioritas: document.getElementById("t-prioritas").value,
          tahapan: document.getElementById("t-tahapan").value,
          target,
          divisi: target === "divisi" ? ME.profile.divisi : "",
          peran: target === "peran" ? ME.profile.peran : "",
          pembuatUid: ME.uid,
          pembuatNama: ME.profile.nama,
          statusPerSiswa: {},
          createdAt: serverTimestamp(),
        });
        await logActivity(ME.uid, "buat_tugas");
        showToast("Tugas dibuat!", "success");
        closeModal("modal-tugas");
        e.target.reset();
        await refresh();
      } catch (err) {
        console.error(err);
        showToast("Gagal buat tugas.", "error");
      }
    });

    switchTab("list");
  } catch (e) {
    console.error("[Tugas] Fatal:", e);
    const c = document.getElementById("tab-content");
    if (c) c.innerHTML = `<div class="glass rounded-2xl p-8 text-center"><span class="material-symbols-outlined text-5xl text-error mb-3">error</span><p class="text-sm text-error">${esc(e.message || "Gagal memuat")}</p><button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Muat Ulang</button></div>`;
  }
})();
