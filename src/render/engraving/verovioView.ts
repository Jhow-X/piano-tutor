/** Painel de partitura para MusicXML, desenhado pelo Verovio. */

import type { VerovioToolkit } from 'verovio/esm';
import { ENGRAVING_OPTIONS, getVerovioToolkit } from '../../core/verovio';
import type { EngravingView } from './types';

const SCALE = 38;
/** Página única e alta: o painel rola continuamente em vez de paginar. */
const PAGE_HEIGHT = 60000;

export async function createVerovioView(container: HTMLElement): Promise<EngravingView> {
  const toolkit = await getVerovioToolkit();
  renderInto(container, toolkit);

  let activeMeasure: Element | null = null;
  let activeNotes: Element[] = [];

  const observer = new ResizeObserver(() => {
    renderInto(container, toolkit);
    activeMeasure = null;
    activeNotes = [];
  });
  observer.observe(container);

  return {
    highlight(seconds: number) {
      const elements = toolkit.getElementsAtTime(Math.max(0, seconds) * 1000);
      const notes = elements.notes
        .map((id) => container.querySelector(`[id="${CSS.escape(id)}"]`))
        .filter((el): el is Element => el !== null);

      for (const el of activeNotes) el.classList.remove('is-playing');
      for (const el of notes) el.classList.add('is-playing');
      activeNotes = notes;

      const measure = notes[0]?.closest('.measure') ?? null;
      if (measure === activeMeasure) return;
      activeMeasure = measure;
      paintMeasureBand(measure);
      // `nearest` evita que a partitura pule a cada compasso: ela só rola
      // quando o compasso corrente sai da área visível.
      measure?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    dispose() {
      observer.disconnect();
      // Sem limpar o container: ele pertence ao React, que o remove ao
      // desmontar. Limpar aqui criava uma corrida — no StrictMode o efeito
      // monta duas vezes, e o `dispose` da primeira apagava o que a segunda
      // já havia desenhado, deixando o painel em branco sem erro nenhum.
    },
  };
}

const BAND_ID = 'current-measure-band';
const BAND_PADDING = 60; // em unidades do viewBox do Verovio

/**
 * Faixa por trás do compasso corrente. O SVG do Verovio não traz nenhum
 * retângulo aproveitável, então ele é criado a partir da caixa do próprio grupo
 * do compasso e inserido como primeiro filho, para pintar atrás das notas.
 */
function paintMeasureBand(measure: Element | null): void {
  document.getElementById(BAND_ID)?.remove();
  if (!(measure instanceof SVGGraphicsElement)) return;

  let box: DOMRect;
  try {
    box = measure.getBBox();
  } catch {
    return; // getBBox lança se o elemento ainda não tem layout
  }
  if (box.width === 0 || box.height === 0) return;

  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  band.setAttribute('id', BAND_ID);
  band.setAttribute('x', String(box.x - BAND_PADDING));
  band.setAttribute('y', String(box.y - BAND_PADDING));
  band.setAttribute('width', String(box.width + BAND_PADDING * 2));
  band.setAttribute('height', String(box.height + BAND_PADDING * 2));
  band.setAttribute('fill', 'rgba(77, 157, 224, 0.14)');
  measure.insertBefore(band, measure.firstChild);
}

function renderInto(container: HTMLElement, toolkit: VerovioToolkit): void {
  const width = container.clientWidth;
  if (width === 0) return;
  toolkit.setOptions({
    ...ENGRAVING_OPTIONS,
    scale: SCALE,
    pageWidth: Math.round((width * 100) / SCALE),
    pageHeight: PAGE_HEIGHT,
  });
  toolkit.redoLayout();

  const pages: string[] = [];
  for (let page = 1; page <= toolkit.getPageCount(); page++) {
    pages.push(toolkit.renderToSVG(page));
  }
  container.innerHTML = pages.join('');
}
