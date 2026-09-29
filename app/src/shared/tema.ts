export type Tema = "light" | "dark";

export const TEMA_STORAGE_KEY = "tema";

/**
 * Script que corre en <head> antes de pintar: aplica el tema guardado o, si
 * no hay, el del sistema operativo. Evita el parpadeo claro->oscuro que
 * produciria esperar a que React hidrate. Va como string porque se inyecta
 * con dangerouslySetInnerHTML.
 */
export const temaInitScript = `(function(){try{var t=localStorage.getItem("${TEMA_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, tema);
  } catch {
    // Almacenamiento bloqueado (modo privado): el tema vale solo para esta pestana.
  }
}
