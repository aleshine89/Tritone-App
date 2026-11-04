const CHIAVE = "tritone-chiara";

export function temaChiaro(): boolean {
  try {
    return localStorage.getItem(CHIAVE) === "1";
  } catch {
    return false;
  }
}

export function impostaTemaChiaro(acceso: boolean) {
  try {
    localStorage.setItem(CHIAVE, acceso ? "1" : "0");
  } catch {
    /* il telefono può bloccare la memoria locale */
  }
  document.documentElement.classList.toggle("chiara", acceso);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", acceso ? "#f4f7f5" : "#050d12");
}
