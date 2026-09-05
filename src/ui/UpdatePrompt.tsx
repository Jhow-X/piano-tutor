/**
 * Aviso de nova versão.
 *
 * O service worker é registrado em modo `prompt`, e não `autoUpdate`, porque
 * recarregar a página sozinho no meio de um estudo perderia a sessão inteira —
 * velocidade, loop e a posição na peça. Quem decide a hora é o usuário.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh: () => setNeedsRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
    });
    setUpdate(() => () => updateSW(true));
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(timer);
  }, [offlineReady]);

  if (!needsRefresh && !offlineReady) return null;

  return (
    <div className="toast">
      {needsRefresh ? (
        <>
          <span>Nova versão disponível.</span>
          <button className="primary" onClick={() => void update?.()}>Atualizar</button>
          <button onClick={() => setNeedsRefresh(false)}>Depois</button>
        </>
      ) : (
        <span>Pronto para usar sem internet.</span>
      )}
    </div>
  );
}
