/**
 * Acesso ao Verovio (WASM).
 *
 * O módulo tem ~7MB com o WASM embutido em base64, então é carregado por
 * `import()` dinâmico: quem só abre `.mid` nunca paga esse custo. O toolkit é
 * um singleton porque só existe uma peça carregada por vez, e ele é
 * compartilhado entre o importador e o painel de partitura — os ids de elemento
 * que um produz são os que o outro consulta.
 */

import type { VerovioToolkit } from 'verovio/esm';

let toolkitPromise: Promise<VerovioToolkit> | null = null;

export async function getVerovioToolkit(): Promise<VerovioToolkit> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const [{ default: createVerovioModule }, { VerovioToolkit: Toolkit }] = await Promise.all([
        import('verovio/wasm'),
        import('verovio/esm'),
      ]);
      const module = await createVerovioModule();
      return new Toolkit(module);
    })();
  }
  return toolkitPromise;
}

/** Opções de gravação usadas tanto na importação quanto no painel de partitura. */
export const ENGRAVING_OPTIONS = {
  breaks: 'auto',
  adjustPageHeight: true,
  footer: 'none',
  header: 'none',
  pageMarginLeft: 30,
  pageMarginRight: 30,
  pageMarginTop: 20,
  pageMarginBottom: 20,
  spacingStaff: 4,
  svgViewBox: true,
} as const;
