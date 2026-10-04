// Tambah null-safe helper:
function safeVal(id) { return document.getElementById(id)?.value?.trim() || ""; }
function safeEl(id) { return document.getElementById(id); }

// MediaRecorder — sudah bagus, tapi tambah guard browser:
if (!navigator.mediaDevices?.getUserMedia) {
  document.getElementById("btn-rekam-start").disabled = true;
  document.getElementById("rekam-status").textContent = "Browser tidak mendukung perekaman audio";
}

// Ganti semua:
//   document.getElementById("x").addEventListener(...)
// menjadi:
//   document.getElementById("x")?.addEventListener(...)

// Ganti semua:
//   document.getElementById("x").value
// menjadi:
//   document.getElementById("x")?.value || ""

// Untuk LANGKAH_LATIHAN, gunakan event delegation (lebih aman):
c.addEventListener("click", (e) => {
  const btn = e.target.closest(".chk-langkah");
  if (!btn) return;
  // ... handle
});

// Bungkus IIFE init dengan try/catch.