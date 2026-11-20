// Script clásico: aplica el tema antes del primer pintado.
try { document.documentElement.dataset.tema = localStorage.getItem("horautp:tema") || "sistema"; } catch { /* modo privado */ }
