/**
 * SP-PPT — Utility Helpers
 * Fungsi umum: toast, modal, skeleton, format tanggal, log, esc, dll.
 */

import { db } from "./firebase-init.js";
import {
  collection, addDoc, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================================================
 * TOAST
 * ========================================================= */
export function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "fixed top-4 right-4 z-[100] space-y-2";
    document.body.appendChild(container);
  }
  const colors = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    warning: "bg-yellow-500 text-black",
    info: "bg-blue-600 text-white",
  };
  const icons = {
    success: "check_circle", error: "error", warning: "warning", info: "info",
  };
  const toast = document.createElement("div");
  toast.className = `${colors[type]} px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[240px] max-w-sm animate-slide-in`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-lg">${icons[type]}</span>
    <span class="text-sm font-medium flex-1">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* =========================================================
 * MODAL
 * ========================================================= */
export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("hidden");
  m.classList.add("flex");
  document.body.style.overflow = "hidden";
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("hidden");
  m.classList.remove("flex");
  document.body.style.overflow = "";
}

// Auto-bind: [data-close-modal] menutup modal terdekat
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close-modal]");
  if (!btn) return;
  const modal = btn.closest(".fixed.inset-0");
  if (modal) closeModal(modal.id);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".fixed.inset-0:not(.hidden)").forEach((m) => {
    if (m.id) closeModal(m.id);
  });
});

/* =========================================================
 * SKELETON
 * ========================================================= */
export function skeleton(lines = 3) {
  return Array.from({ length: lines })
    .map(() => `<div class="h-4 bg-surface-container-high rounded animate-pulse mb-2" style="width:${60 + Math.random() * 40}%"></div>`)
    .join("");
}

/* =========================================================
 * FORMAT TANGGAL & WAKTU
 * ========================================================= */
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function toDate(date) {
  if (!date) return null;
  if (date.toDate) return date.toDate();
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

export function formatTanggal(date) {
  const d = toDate(date);
  if (!d) return "-";
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTanggalSingkat(date) {
  const d = toDate(date);
  if (!d) return "-";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatWaktu(date) {
  const d = toDate(date);
  if (!d) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function waktuRelatif(date) {
  const d = toDate(date);
  if (!d) return "-";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return formatTanggal(d);
}

export function countdown(targetDate) {
  const target = toDate(targetDate);
  if (!target) return "-";
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return "Terlewat";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

/* =========================================================
 * NILAI & PREDIKAT
 * ========================================================= */
export function predikat(nilai) {
  if (nilai >= 90) return { huruf: "A", label: "Mahir, teladan", warna: "text-yellow-400", bg: "bg-yellow-500/20" };
  if (nilai >= 80) return { huruf: "B", label: "Kompeten, andal", warna: "text-blue-400", bg: "bg-blue-500/20" };
  if (nilai >= 70) return { huruf: "C", label: "Memenuhi standar", warna: "text-green-400", bg: "bg-green-500/20" };
  if (nilai >= 60) return { huruf: "D", label: "Perlu perbaikan", warna: "text-orange-400", bg: "bg-orange-500/20" };
  return { huruf: "E", label: "Tidak memenuhi", warna: "text-red-400", bg: "bg-red-500/20" };
}

/* =========================================================
 * WARNA PERAN
 * ========================================================= */
export function warnaPeran(peran) {
  if (!peran) return "bg-surface-container-highest text-on-surface-variant border-outline-variant";
  if (["Pimpinan Produksi", "Sutradara"].includes(peran))
    return "bg-secondary/20 text-secondary border-secondary/40";
  if (peran.startsWith("Koordinator"))
    return "bg-tertiary/20 text-tertiary border-tertiary/40";
  return "bg-surface-container-highest text-on-surface-variant border-outline-variant";
}

/* =========================================================
 * INISIAL
 * ========================================================= */
export function inisial(nama = "") {
  return String(nama)
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

/* =========================================================
 * ESCAPE HTML
 * ========================================================= */
export function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
 * LOG AKTIVITAS
 * ========================================================= */
export async function logActivity(uid, aksi, target = "") {
  try {
    await addDoc(collection(db, "logs"), {
      uid: uid || "anonim",
      aksi,
      target,
      waktu: serverTimestamp(),
      perangkat: navigator.userAgent,
    });
  } catch (e) {
    console.warn("[Log] gagal:", e);
  }
}

/* =========================================================
 * DEBOUNCE
 * ========================================================= */
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* =========================================================
 * LOGOUT HELPER (tanpa Firebase Auth)
 * ========================================================= */
export function doLogout() {
  localStorage.removeItem("sppt_session");
  window.location.replace("index.html?logout=1");
}

export async function signOut() {
  doLogout();
}

/* =========================================================
 * HASH PASSWORD — SHA-256 + salt (uid)
 * ========================================================= */
export async function hashPassword(password, salt = "") {
  try {
    const enc = new TextEncoder();
    const data = enc.encode(String(password) + "::" + String(salt));
    const buf = await crypto.subtle.digest("SHA-256", data);
    const bytes = Array.from(new Uint8Array(buf));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    console.error("[Hash] gagal:", e);
    return "";
  }
}

/* =========================================================
 * NORMALISASI NOMOR WHATSAPP
 * ========================================================= */
export function normalisasiWA(wa) {
  if (!wa) return "";
  let d = String(wa).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

/* =========================================================
 * AMBIL SEMUA SISWA (users + classes.students)
 * Source of truth = koleksi `users`.
 * Fallback baca `classes.students` untuk kompatibilitas data lama.
 * ========================================================= */
export async function getAllStudents() {
  const hasil = [];
  const seen = new Set();

  // 1. users
  try {
    const uSnap = await getDocs(collection(db, "users"));
    uSnap.docs.forEach((d) => {
      const u = d.data();
      if (u.role !== "siswa") return;
      const email = String(u.email || "").toLowerCase().trim();
      if (email && seen.has(email)) return;
      if (email) seen.add(email);
      hasil.push({
        uid: d.id,
        role: "siswa",
        nama: u.nama || u.name || "Siswa",
        nis: u.nis || "",
        email,
        whatsapp: u.whatsapp || u.phone || "",
        kelas: u.kelas || "",
        kelasId: u.kelasId || "",
        peran: u.peran || "Pemain",
        divisi: u.divisi || "Pemeran",
        fotoUrl: u.fotoUrl || "",
        _sumber: "users",
      });
    });
  } catch (e) {
    console.warn("[getAllStudents] users gagal:", e);
  }

  // 2. classes.students (fallback)
  try {
    const cSnap = await getDocs(collection(db, "classes"));
    cSnap.docs.forEach((cDoc) => {
      const k = cDoc.data();
      (k.students || []).forEach((s) => {
        if (!s.email) return;
        const email = String(s.email).toLowerCase().trim();
        if (seen.has(email)) return;
        seen.add(email);
        hasil.push({
          uid: `student_${email}`,
          role: "siswa",
          nama: s.name || "Siswa",
          nis: s.nis || "",
          email,
          whatsapp: s.phone || "",
          kelas: k.name || "",
          kelasId: cDoc.id,
          peran: s.peran || "Pemain",
          divisi: s.divisi || "Pemeran",
          fotoUrl: s.fotoUrl || "",
          _sumber: "classes",
        });
      });
    });
  } catch (e) {
    console.warn("[getAllStudents] classes gagal:", e);
  }

  return hasil;
}

/* =========================================================
 * AMBIL SEMUA GURU (users + teachers)
 * ========================================================= */
export async function getAllTeachers() {
  const hasil = [];
  const seen = new Set();

  // 1. users dengan role guru/admin
  try {
    const uSnap = await getDocs(collection(db, "users"));
    uSnap.docs.forEach((d) => {
      const u = d.data();
      if (!["guru", "admin"].includes(u.role)) return;
      const email = String(u.email || "").toLowerCase().trim();
      if (!email || seen.has(email)) return;
      seen.add(email);
      hasil.push({
        uid: d.id,
        role: u.role,
        peran: u.peran || "Guru Pembina",
        nama: u.nama || u.name || "Guru",
        email,
        whatsapp: u.whatsapp || u.phone || "",
        kelas: "",
        divisi: "Guru",
        _sumber: "users",
      });
    });
  } catch (e) {
    console.warn("[getAllTeachers] users gagal:", e);
  }

  // 2. teachers (fallback)
  try {
    const tSnap = await getDocs(collection(db, "teachers"));
    tSnap.docs.forEach((d) => {
      const t = d.data();
      const email = String(t.email || "").toLowerCase().trim();
      if (!email || seen.has(email)) return;
      seen.add(email);
      hasil.push({
        uid: `teacher_${email}`,
        role: "guru",
        peran: "Guru Pembina",
        nama: t.name || "Guru",
        email,
        whatsapp: t.phone || "",
        kelas: "",
        divisi: "Guru",
        _sumber: "teachers",
      });
    });
  } catch (e) {
    console.warn("[getAllTeachers] teachers gagal:", e);
  }

  return hasil;
}
