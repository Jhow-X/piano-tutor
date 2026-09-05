/**
 * Painel de partitura para ABC, desenhado pelo abcjs.
 *
 * O abcjs traz um `TimingCallbacks` com relógio próprio, que não é usado aqui:
 * apenas `noteTimings` é lido, e o realce é dirigido pelo nosso transporte. Ter
 * dois relógios comandando a mesma reprodução é justamente o que se quer evitar.
 */

import type { EngravingView } from './types';

export async function createAbcView(container: HTMLElement, source: string): Promise<EngravingView> {
  const { default: abcjs } = await import('abcjs');

  let timings: { ms: number; elements: HTMLElement[] }[] = [];
  let activeIndex = -1;
  let activeElements: HTMLElement[] = [];

  const render = () => {
    const [visual] = abcjs.renderAbc(container, source, { responsive: 'resize' });
    if (!visual) return;
    const callbacks = new abcjs.TimingCallbacks(visual, {});
    timings = callbacks.noteTimings
      .filter((event) => event.type === 'event' && event.elements)
      .map((event) => ({
        ms: event.milliseconds,
        elements: (event.elements ?? []).flat(),
      }))
      .sort((a, b) => a.ms - b.ms);
    activeIndex = -1;
    activeElements = [];
  };

  render();
  const observer = new ResizeObserver(() => render());
  observer.observe(container);

  return {
    highlight(seconds: number) {
      const index = lastIndexAtOrBefore(timings, seconds * 1000);
      if (index === activeIndex) return;
      for (const el of activeElements) el.classList.remove('is-playing');
      activeElements = timings[index]?.elements ?? [];
      for (const el of activeElements) el.classList.add('is-playing');
      activeIndex = index;
      activeElements[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    dispose() {
      observer.disconnect();
      container.replaceChildren();
    },
  };
}

/** Busca binária: o último evento cujo instante já passou. */
function lastIndexAtOrBefore(timings: { ms: number }[], ms: number): number {
  let low = 0;
  let high = timings.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timings[mid]!.ms <= ms) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
