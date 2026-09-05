import { useRef } from 'react';

/**
 * Cria um valor uma única vez, na primeira renderização, e o mantém pela vida do
 * componente. Serve para objetos que vivem fora do ciclo de render — o
 * transporte, o tocador de áudio — e que não devem ser recriados a cada quadro.
 */
export function useConstant<T>(create: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = create();
  return ref.current;
}
