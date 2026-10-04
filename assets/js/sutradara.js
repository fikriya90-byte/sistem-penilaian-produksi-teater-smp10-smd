/**
 * SP-PPT — Sutradara
 * Visi, Casting, Catatan, Penilaian Pemain, Call Sheet
 */
import { auth, db } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where,
  getDocs, orderBy, serverTimestamp, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { protectPage } from "./router.js";
import {
  showToast, openModal, closeModal, skeleton, formatTanggal, esc,
  warnaPeran, inisial, logActivity, waktuRelatif,
} from "./utils.js";
import { initNotifikasi, bukaPanelNotif, kirimNotifikasi, kirimNotifikasiBanyak } from "./notifikasi.js";
import { KRITERIA_PER_PERAN, skorKeNilai } from "./agregasi.js";

let ME = null;
let TAB = "visi";
let VISI = null;
let PEMAIN = [];
let NILAI_TARGET = null;

function switchTab(tab) {
  TAB = tab;
  document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) => {
    const aktif = b.dataset.tab === tab;
    b.className = `tab-btn px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${aktif ? "bg-primary-container text-primary" : "text-on-surface-variant hover:bg-surface-container"}`;
  });
  if (tab === "visi") renderVisi();
  if (tab === "casting") renderCasting();
  if (tab === "catatan") renderCatatan();
  if (tab === "penilaian") renderPenilaian();
  if (tab === "call-sheet") renderCallSheet();
}

async function renderVisi() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  try {
    const snap = await getDocs(query(collection(db, "visiArtistik"), where("kelas", "==", ME.profile.kelas || ""), limit(1)));
    VISI = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (_) { VISI = null; }

  c.innerHTML = `
  <div class="glass rounded-2xl p-5 border-l-4 border-secondary">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary">palette</span> Visi Artistik
      </h3>
      <button id="btn-edit-visi" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">${VISI ? "Edit" : "Buat"} Visi</button>
    </div>
    ${VISI ? `
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-surface-container"><p class="text-xs text-on-surface-variant">Judul</p><p class="font-headline font-bold text-lg">${esc(VISI.judul)}</p></div>
          <div class="p-3 rounded-xl bg-surface-container"><p class="text-xs text-on-surface-variant">Gaya</p><p class="font-medium">${esc(VISI.gaya)}</p></div>
        </div>
        <div class="p-3 rounded-xl bg-surface-container"><p class="text-xs text-on-surface-variant mb-1">Tema</p><p class="text-sm">${esc(VISI.tema)}</p></div>
        ${VISI.scene ? `<div class="p-3 rounded-xl bg-surface-container"><p class="text-xs text-on-surface-variant mb-1">Scene</p><p class="text-sm whitespace-pre-wrap">${esc(VISI.scene)}</p></div>` : ""}
      </div>
    ` : `<div class="text-center py-10 text-on-surface-variant">
      <span class="material-symbols-outlined text-5xl block mb-2 opacity-40">palette</span>
      <p class="text-sm">Belum ada visi artistik</p>
    </div>`}
  </div>`;

  document.getElementById("btn-edit-visi")?.addEventListener("click", () => {
    if (VISI) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
      set("v-judul", VISI.judul); set("v-tema", VISI.tema); set("v-gaya", VISI.gaya || "Realisme");
      set("v-scene", VISI.scene); set("v-moodboard", VISI.moodboard); set("v-promptbook", VISI.promptbook);
    }
    openModal("modal-visi");
  });
}

async function renderCasting() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  let list = [];
  try {
    const snap = await getDocs(query(collection(db, "casting"), where("kelas", "==", ME.profile.kelas || "")));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.tokoh || "").localeCompare(b.tokoh || ""));
  } catch (_) {}

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-secondary">person_search</span> Casting</h3>
      <button id="btn-add-casting" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">+ Tokoh</button>
    </div>
    ${list.length ? `
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead class="text-on-surface-variant"><tr class="border-b border-outline-variant/40">
          <th class="text-left p-2">Tokoh</th><th class="text-left p-2">Deskripsi</th><th class="text-left p-2">Pemain</th><th class="text-center p-2">Status</th><th class="text-center p-2">Aksi</th>
        </tr></thead>
        <tbody>${list.map((row) => `
          <tr class="border-b border-outline-variant/20">
            <td class="p-2 font-medium">${esc(row.tokoh)}</td>
            <td class="p-2 text-on-surface-variant">${esc(row.deskripsi || "-")}</td>
            <td class="p-2">${esc(row.pemainNama || "-")}</td>
            <td class="p-2 text-center"><span class="text-[10px] px-2 py-0.5 rounded-full ${row.status === "Final" ? "bg-green-600/20 text-green-400" : row.status === "Cadangan" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}">${esc(row.status)}</span></td>
            <td class="p-2 text-center"><button class="btn-del-casting text-error" data-id="${row.id}"><span class="material-symbols-outlined text-sm">delete</span></button></td>
          </tr>`).join("")}</tbody>
      </table></div>
    ` : `<p class="text-center text-sm text-on-surface-variant py-6">Belum ada casting</p>`}
  </div>`;

  document.getElementById("btn-add-casting")?.addEventListener("click", async () => {
    try {
      const pSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", "Pemain"), where("kelas", "==", ME.profile.kelas || "")));
      PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    } catch (_) { PEMAIN = []; }
    const sel = document.getElementById("c-pemain");
    if (sel) sel.innerHTML = `<option value="">Pilih Pemain</option>` + PEMAIN.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("");
    openModal("modal-casting");
  });

  c.querySelectorAll(".btn-del-casting").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus casting?")) return;
      try { await deleteDoc(doc(db, "casting", b.dataset.id)); showToast("Dihapus.", "success"); renderCasting(); }
      catch (e) { showToast("Gagal hapus.", "error"); }
    })
  );
}

async function renderCatatan() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  let list = [];
  try {
    const snap = await getDocs(query(collection(db, "catatanHarian"), where("kelas", "==", ME.profile.kelas || "")));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).slice(0, 30);
  } catch (_) {}

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 class="font-headline font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-secondary">edit_note</span> Catatan Harian</h3>
      <button id="btn-add-catatan" class="px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-medium">+ Catatan</button>
    </div>
    <div class="space-y-2">
      ${list.length ? list.map((n) => `
        <div class="p-3 rounded-xl bg-surface-container">
          <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <p class="text-sm font-medium">${esc(n.adegan)}</p>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${n.status === "Baik" ? "bg-green-600/20 text-green-400" : n.status === "Perlu Perbaikan" ? "bg-yellow-500/20 text-yellow-400" : "bg-error/20 text-error"}">${esc(n.status || "-")}</span>
          </div>
          <p class="text-xs text-on-surface-variant">${formatTanggal(n.tanggal)}</p>
          <p class="text-sm mt-2 whitespace-pre-wrap">${esc(n.catatan || "")}</p>
        </div>`).join("") : `<p class="text-center text-sm text-on-surface-variant py-6">Belum ada catatan</p>`}
    </div>
  </div>`;

  document.getElementById("btn-add-catatan")?.addEventListener("click", async () => {
    const el = document.getElementById("ch-tanggal");
    if (el) el.value = new Date().toISOString().slice(0, 10);
    try {
      const pSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", "Pemain"), where("kelas", "==", ME.profile.kelas || "")));
      PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    } catch (_) { PEMAIN = []; }
    const sel = document.getElementById("ch-tag");
    if (sel) sel.innerHTML = PEMAIN.map((p) => `<option value="${p.uid}" data-nama="${esc(p.nama)}">${esc(p.nama)}</option>`).join("");
    openModal("modal-catatan");
  });
}

async function renderPenilaian() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  try {
    const pSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("peran", "==", "Pemain"), where("kelas", "==", ME.profile.kelas || "")));
    PEMAIN = pSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (_) { PEMAIN = []; }

  let sudahDinilai = {};
  try {
    const nSnap = await getDocs(query(collection(db, "penilaian"), where("penilaiUid", "==", ME.uid)));
    nSnap.docs.forEach((d) => {
      const n = d.data();
      if (!sudahDinilai[n.targetUid]) sudahDinilai[n.targetUid] = [];
      sudahDinilai[n.targetUid].push(n.tahapan);
    });
  } catch (_) {}

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <h3 class="font-headline font-semibold mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-secondary">grade</span> Penilaian Pemain</h3>
    ${PEMAIN.length ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${PEMAIN.map((p) => {
        const tahaps = sudahDinilai[p.uid] || [];
        return `<div class="p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition cursor-pointer btn-nilai" data-uid="${p.uid}" data-nama="${esc(p.nama)}">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold">${inisial(p.nama)}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${esc(p.nama)}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                ${["persiapan","pelaksanaan","pertunjukan","pasca"].map((t) => `<span class="text-[9px] px-1.5 py-0.5 rounded ${tahaps.includes(t) ? "bg-green-600/20 text-green-400" : "bg-surface-container-high text-on-surface-variant"}">${t.charAt(0).toUpperCase()}</span>`).join("")}
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>
        </div>`;
      }).join("")}
    </div>` : `<p class="text-center text-sm text-on-surface-variant py-8">Belum ada pemain</p>`}
  </div>`;

  c.querySelectorAll(".btn-nilai").forEach((b) =>
    b.addEventListener("click", () => bukaFormNilai(b.dataset.uid, b.dataset.nama))
  );
}

function bukaFormNilai(uid, nama) {
  NILAI_TARGET = { uid, nama };
  const kriteria = KRITERIA_PER_PERAN.Pemain;
  const jEl = document.getElementById("nilai-judul"); if (jEl) jEl.textContent = `Penilaian: ${nama}`;
  const sEl = document.getElementById("nilai-sub"); if (sEl) sEl.textContent = "Pemain · 6 kriteria";
  const form = document.getElementById("nilai-form");
  if (!form) return;

  form.innerHTML = `
    <div class="mb-3">
      <label class="text-xs text-on-surface-variant mb-1 block">Tahapan</label>
      <select id="nl-tahap" class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-sm">
        <option value="persiapan">Persiapan (20%)</option>
        <option value="pelaksanaan">Pelaksanaan (35%)</option>
        <option value="pertunjukan">Pertunjukan (30%)</option>
        <option value="pasca">Pasca (15%)</option>
      </select>
    </div>
    ${kriteria.map((k) => `
      <div class="p-3 rounded-xl bg-surface-container">
        <div class="flex justify-between mb-2"><p class="text-sm font-medium">${esc(k.nama)}</p><span class="text-xs text-on-surface-variant">${k.bobot}%</span></div>
        <input type="range" min="1" max="4" value="3" data-kriteria="${esc(k.nama)}" data-bobot="${k.bobot}" class="slider-nilai w-full accent-primary" />
        <div class="flex justify-between text-[10px] text-on-surface-variant mt-1"><span>1 Kurang</span><span>2 Cukup</span><span>3 Baik</span><span>4 Sangat Baik</span></div>
        <p class="text-xs text-primary mt-2 deskripsi-nilai">${k.deskripsi[2]}</p>
        <input type="text" placeholder="Komentar (wajib jika skor ≤ 2)" data-komentar="${esc(k.nama)}" class="komentar-input w-full mt-2 px-3 py-2 text-xs rounded-lg bg-surface-container-high border border-outline-variant" />
      </div>`).join("")}
    <div class="p-3 rounded-xl bg-primary-container/40 border border-primary/30">
      <p class="text-xs text-on-surface-variant">Preview</p>
      <p class="font-headline font-bold text-2xl text-primary" id="nl-preview">80.00</p>
    </div>`;

  const updatePreview = () => {
    let total = 0, totBob = 0;
    form.querySelectorAll(".slider-nilai").forEach((s) => {
      const skor = parseInt(s.value);
      const bob = parseInt(s.dataset.bobot);
      total += skorKeNilai(skor) * bob; totBob += bob;
      const k = kriteria.find((x) => x.nama === s.dataset.kriteria);
      if (k) {
        const desc = s.closest(".p-3")?.querySelector(".deskripsi-nilai");
        if (desc) desc.textContent = k.deskripsi[skor - 1];
      }
    });
    const prev = form.querySelector("#nl-preview");
    if (prev) prev.textContent = (totBob ? total / totBob : 0).toFixed(2);
  };

  form.querySelectorAll(".slider-nilai").forEach((s) => s.addEventListener("input", updatePreview));
  updatePreview();
  openModal("modal-nilai");
}

async function simpanNilai(status) {
  const form = document.getElementById("nilai-form");
  if (!form || !NILAI_TARGET) return;
  const tahap = document.getElementById("nl-tahap").value;
  const nilai = [];
  let valid = true;
  form.querySelectorAll(".slider-nilai").forEach((s) => {
    const skor = parseInt(s.value);
    const komentar = form.querySelector(`[data-komentar="${s.dataset.kriteria}"]`)?.value.trim() || "";
    if (skor <= 2 && !komentar) { valid = false; showToast(`Komentar wajib untuk "${s.dataset.kriteria}"`, "warning"); return; }
    nilai.push({ kriteria: s.dataset.kriteria, skor, komentar });
  });
  if (!valid) return;

  try {
    const existing = await getDocs(query(collection(db, "penilaian"),
      where("penilaiUid", "==", ME.uid), where("targetUid", "==", NILAI_TARGET.uid), where("tahapan", "==", tahap)));
    if (!existing.empty) {
      await updateDoc(doc(db, "penilaian", existing.docs[0].id), {
        nilai, status, updatedAt: serverTimestamp(),
        versi: (existing.docs[0].data().versi || 1) + 1,
      });
    } else {
      await addDoc(collection(db, "penilaian"), {
        penilaiUid: ME.uid, targetUid: NILAI_TARGET.uid, tahapan: tahap,
        jenisPenilai: "ketua", status, anonim: false, nilai,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await kirimNotifikasi({
      penerimaUid: NILAI_TARGET.uid, jenis: "Info",
      judul: status === "final" ? "Nilai Baru dari Sutradara" : "Draft Nilai",
      pesan: `Sutradara memberi ${status === "final" ? "nilai final" : "draft"} di tahap ${tahap}.`,
      dari: ME.profile.nama, link: "nilai.html",
    });
    await logActivity(ME.uid, `nilai_pemain_${status}`, NILAI_TARGET.uid);
    showToast(status === "final" ? "Nilai difinalisasi!" : "Draft disimpan!", "success");
    closeModal("modal-nilai");
    renderPenilaian();
  } catch (e) { console.error(e); showToast("Gagal simpan nilai.", "error"); }
}

async function renderCallSheet() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  c.innerHTML = `<div class="glass rounded-2xl p-5">${skeleton(4)}</div>`;
  let list = [];
  try {
    const snap = await getDocs(query(collection(db, "jadwal"), where("jenis", "in", ["Latihan", "Gladi", "Pementasan"]), limit(20)));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  } catch (_) {}

  c.innerHTML = `
  <div class="glass rounded-2xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-headline font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-secondary">call</span> Call Sheet</h3>
      <button id="btn-print-call" class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-medium">Cetak</button>
    </div>
    <div class="space-y-3">
      ${list.length ? list.map((j) => `
        <div class="p-4 rounded-xl bg-surface-container border-l-4 border-secondary">
          <p class="font-medium text-sm">${esc(j.judul)}</p>
          <p class="text-xs text-on-surface-variant mt-1">${formatTanggal(j.tanggal)} · ${esc(j.jamMulai || "")}-${esc(j.jamSelesai || "")}</p>
          <p class="text-xs text-on-surface-variant">📍 ${esc(j.lokasi || "")}</p>
        </div>`).join("") : `<p class="text-center text-sm text-on-surface-variant py-6">Belum ada jadwal</p>`}
    </div>
  </div>`;

  document.getElementById("btn-print-call")?.addEventListener("click", () => window.print());
}

(async function init() {
  try {
    const { uid, profile } = await protectPage();
    ME = { uid, profile };

    const menu = [
      { icon: "dashboard", label: "Dashboard", href: "dashboard.html" },
      { icon: "movie", label: "Panel Sutradara", href: "sutradara.html" },
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
      { icon: "fact_check", label: "Absensi", href: "absensi.html" },
      { icon: "checklist", label: "Checklist", href: "checklist.html" },
      { icon: "campaign", label: "Broadcast", href: "broadcast.html" },
      { icon: "groups", label: "Struktur", href: "struktur.html" },
      { icon: "folder", label: "Arsip", href: "arsip.html" },
      { icon: "description", label: "Rapor", href: "rapor.html" },
    ];
    const nav = document.getElementById("sidebar-nav");
    if (nav) nav.innerHTML = menu.map((m) => `
      <a href="${m.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm ${m.href === "sutradara.html" ? "bg-primary-container text-primary font-medium" : "text-on-surface-variant hover:bg-surface-container"}">
        <span class="material-symbols-outlined text-xl">${m.icon}</span>${m.label}
      </a>`).join("");

    const av = document.getElementById("header-avatar");
    if (av) av.textContent = inisial(profile.nama);
    const badge = document.getElementById("badge-role");
    if (badge) { badge.className = `hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${warnaPeran(profile.peran)}`; badge.textContent = profile.peran; }
    const bn = document.getElementById("bottom-nav");
    if (bn) bn.innerHTML = [
      { icon: "dashboard", label: "Home", href: "dashboard.html" },
      { icon: "grade", label: "Nilai", href: "nilai.html" },
      { icon: "calendar_month", label: "Jadwal", href: "jadwal.html" },
      { icon: "checklist", label: "Tugas", href: "checklist.html" },
      { icon: "groups", label: "Kerabat", href: "struktur.html" },
    ].map((i) => `<a href="${i.href}" class="flex flex-col items-center justify-center py-2 text-[10px] gap-0.5 ${i.href === "sutradara.html" ? "text-primary" : "text-on-surface-variant"}"><span class="material-symbols-outlined text-xl">${i.icon}</span>${i.label}</a>`).join("");

    const html = document.documentElement;
    if (localStorage.getItem("theme") === "light") html.classList.remove("dark");
    const btnT = document.getElementById("btn-theme"), iconT = document.getElementById("theme-icon");
    const setIcon = () => { if (iconT) iconT.textContent = html.classList.contains("dark") ? "light_mode" : "dark_mode"; };
    setIcon();
    btnT?.addEventListener("click", () => { html.classList.toggle("dark"); localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light"); setIcon(); });
    document.getElementById("btn-logout")?.addEventListener("click", async () => { if (!confirm("Keluar?")) return; await logActivity(ME.uid, "logout"); await signOut(auth); window.location.replace("index.html"); });
    document.getElementById("btn-menu")?.addEventListener("click", () => { const sb = document.getElementById("sidebar"); if (!sb) return; sb.classList.toggle("hidden"); sb.classList.toggle("flex"); });

    initNotifikasi(uid, profile);
    document.getElementById("btn-notif")?.addEventListener("click", bukaPanelNotif);

    document.getElementById("form-visi")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const data = {
          kelas: ME.profile.kelas || "",
          judul: document.getElementById("v-judul").value.trim(),
          tema: document.getElementById("v-tema").value.trim(),
          gaya: document.getElementById("v-gaya").value,
          scene: document.getElementById("v-scene").value.trim(),
          moodboard: document.getElementById("v-moodboard").value.trim(),
          promptbook: document.getElementById("v-promptbook").value.trim(),
          sutradaraUid: ME.uid, updatedAt: serverTimestamp(),
        };
        if (VISI) await updateDoc(doc(db, "visiArtistik", VISI.id), data);
        else { data.createdAt = serverTimestamp(); await addDoc(collection(db, "visiArtistik"), data); }
        await logActivity(ME.uid, "publish_visi");
        showToast("Visi tersimpan!", "success");
        closeModal("modal-visi");
        renderVisi();
      } catch (err) { showToast("Gagal simpan visi.", "error"); }
    });

    document.getElementById("form-casting")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pemainUid = document.getElementById("c-pemain").value;
      const pemainNama = document.getElementById("c-pemain").selectedOptions[0]?.dataset.nama || "";
      try {
        await addDoc(collection(db, "casting"), {
          kelas: ME.profile.kelas || "",
          tokoh: document.getElementById("c-tokoh").value.trim(),
          deskripsi: document.getElementById("c-desk").value.trim(),
          pemainUid, pemainNama,
          status: document.getElementById("c-status").value,
          sutradaraUid: ME.uid, createdAt: serverTimestamp(),
        });
        if (pemainUid) await kirimNotifikasi({ penerimaUid: pemainUid, jenis: "Info", judul: "Casting Diumumkan", pesan: `Anda dipilih sebagai ${document.getElementById("c-tokoh").value}`, dari: ME.profile.nama, link: "dashboard.html" });
        await logActivity(ME.uid, "tambah_casting");
        showToast("Casting disimpan!", "success");
        closeModal("modal-casting");
        e.target.reset();
        renderCasting();
      } catch (err) { showToast("Gagal simpan.", "error"); }
    });

    document.getElementById("form-catatan")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sel = document.getElementById("ch-tag");
      const tagged = Array.from(sel?.selectedOptions || []).map((o) => ({ uid: o.value, nama: o.dataset.nama }));
      try {
        await addDoc(collection(db, "catatanHarian"), {
          kelas: ME.profile.kelas || "",
          tanggal: document.getElementById("ch-tanggal").value,
          adegan: document.getElementById("ch-adegan").value.trim(),
          status: document.getElementById("ch-status").value,
          catatan: document.getElementById("ch-catatan").value.trim(),
          taggedUids: tagged.map((t) => t.uid),
          taggedNama: tagged.map((t) => t.nama),
          sutradaraUid: ME.uid, createdAt: serverTimestamp(),
        });
        if (tagged.length) await kirimNotifikasiBanyak({ penerimaUids: tagged.map((t) => t.uid), jenis: "Feedback", judul: `Catatan: ${document.getElementById("ch-adegan").value}`, pesan: document.getElementById("ch-catatan").value.slice(0, 100), dari: ME.profile.nama, link: "sutradara.html" });
        await logActivity(ME.uid, "tambah_catatan");
        showToast("Catatan tersimpan!", "success");
        closeModal("modal-catatan");
        e.target.reset();
        renderCatatan();
      } catch (err) { showToast("Gagal simpan.", "error"); }
    });

    document.getElementById("btn-nilai-draft")?.addEventListener("click", () => simpanNilai("draft"));
    document.getElementById("btn-nilai-final")?.addEventListener("click", () => { if (confirm("Finalisasi nilai?")) simpanNilai("final"); });

    document.querySelectorAll("#tabs-bar .tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    switchTab("visi");
  } catch (e) {
    console.error("[Sutradara] Fatal:", e);
    const c = document.getElementById("tab-content");
    if (c) c.innerHTML = `<div class="glass rounded-2xl p-8 text-center"><p class="text-sm text-error">${esc(e.message || "Gagal memuat")}</p><button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm">Muat Ulang</button></div>`;
  }
})();