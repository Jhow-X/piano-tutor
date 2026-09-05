# Piano Roll de Estudo

Web app que abre uma partitura de teclado e mostra as notas caindo sobre um teclado de
88 teclas, no estilo dos vídeos de piano do YouTube — mas com os controles de quem está
**estudando** a peça, não de quem está produzindo vídeo.

Roda inteiramente no navegador: não há backend, e nenhum arquivo sai da sua máquina.

## Formatos aceitos

| Formato | Notas | Partitura tradicional | Dedilhado |
|---|---|---|---|
| `.mid`, `.midi` | ✅ | — | — |
| `.musicxml`, `.xml`, `.mxl` | ✅ | ✅ | ✅ quando o arquivo traz |
| `.abc` | ✅ | ✅ | — |

PDF e imagem escaneada estão fora de escopo: exigiriam reconhecimento óptico de música,
que precisa de backend e é impreciso demais para servir de base de estudo.

**Um `.mid` não tem partitura tradicional.** Arquivos MIDI não carregam grafia — não há
enarmonia (Dó♯ e Ré♭ são a mesma tecla), armadura de clave confiável nem divisão visual de
compasso. Dá para quantizar e gravar automaticamente, mas o resultado é frequentemente
errado, e uma leitura errada é pior do que nenhuma. O painel de partitura simplesmente não
aparece nesse caso.

## Funcionalidades

- **Velocidade** de 25% a 150%, sem alterar a afinação.
- **Loop de trecho**: arraste na régua de compassos para marcar; a seleção encaixa em
  compassos inteiros. `Esc` limpa.
- **Mãos separadas**: cores distintas, e cada mão pode ser silenciada ou ocultada
  independentemente.
- **Partitura tradicional** ao lado, com o compasso corrente realçado e rolagem automática.
- **Nomes das notas** (C D E ou Dó Ré Mi) e **dedilhado** escritos dentro das notas.
- **Toque junto** pelo teclado do computador: fileira de baixo são as brancas, a de cima as
  pretas; `Z` e `X` mudam de oitava. O que você toca acende em verde.
- `Espaço` toca e pausa.

## Rodando

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção em dist/ (estático, hospedável em qualquer lugar)
npm test         # testes
```

Arquivos de exemplo para experimentar estão em `test-fixtures/`.

## Como funciona

```
.mid       → @tonejs/midi ──────┐
.musicxml  → Verovio (WASM) ────┼→ Score { notes[], measures[], tempoMap, engraving? }
.abc       → abcjs ─────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
         Transport                  Renderers              NoteInputSource
    (cursor sobre eventos,     piano roll + teclado     teclado do computador
     lookahead scheduler)      + painel de partitura    (Web MIDI: futuro)
                                        │
                                    AudioPlayer
                                  (samples de piano)
```

Três decisões carregam o resto do desenho:

**Um importador, não três.** O Verovio e o abcjs sabem exportar MIDI com as repetições já
desenroladas, então MusicXML e ABC são convertidos a MIDI internamente e passam pelo mesmo
extrator de notas do `.mid` (`src/core/importers/midi.ts`). O que a exportação MIDI perde é
recuperado num segundo passe: para MusicXML, o dedilhado sai do `<fing>` do MEI, casado com
as notas por (semínima, altura) — as duas fontes descrevem a mesma linha do tempo
desenrolada, então a chave é exata.

**Tempo canônico em semínimas, não em segundos.** Segundos são derivados do `tempoMap` na
hora de agendar, o que faz a velocidade variável virar um multiplicador em vez de uma
reescrita da linha do tempo.

**O transporte é um cursor sobre eventos**, não uma linha do tempo presa ao relógio
(`src/core/transport.ts`). O agendamento usa o padrão de lookahead: um `setInterval` curto
agenda no relógio do `AudioContext` tudo que cai nos próximos ~120ms, e o
`requestAnimationFrame` apenas *lê* a posição para desenhar. Áudio nunca é agendado a partir
do rAF. Essa forma é o que permitirá acrescentar o modo "espera você tocar a nota certa"
(com teclado MIDI) sem refatorar o núcleo.

### Custo de carregamento

O motor de gravação do Verovio tem ~8MB (WASM embutido) e o abcjs ~500KB. Os dois são
carregados por `import()` dinâmico: quem abre apenas arquivos `.mid` nunca paga esse custo.
Os samples de piano são baixados sob demanda no primeiro play.

## Limitações conhecidas

- O teclado MIDI físico (Web MIDI) ainda não está implementado; a interface
  `NoteInputSource` já existe para recebê-lo.
- A separação de mãos em arquivos MIDI de track única usa uma heurística de altura
  (`src/core/hands.ts`) e erra em passagens de mãos cruzadas.
- ABC realça a nota corrente, mas não desenha a faixa de compasso que o MusicXML desenha.

## Licença e procedência

O projeto é distribuído sob a **GPL-3.0** (ver `LICENSE`).

Dependências de runtime: Verovio é LGPL-3.0-or-later; abcjs, smplr, `@tonejs/midi` e React
são MIT. Todas compatíveis com a GPL-3.0.

Os arquivos de `test-fixtures/` são obras de domínio público, usadas como exemplos e como
base dos testes de integração:

- `book1-prelude01.mid`, `cpe-bach-solfeggietto.mid`, `Notebook2-16-March.mid` — de
  [mfiles.co.uk](https://www.mfiles.co.uk/classical-midi.htm)
- `MuzioClementi_...xml`, `JohannSebastianBach_...xml`, `Beethoven_...xml` — da suíte de
  testes do [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)
- `clementi.mxl` — o Clementi acima, compactado, para exercitar o caminho `.mxl`
- `fingering-sample.musicxml` e `exemplo.abc` — escritos para este projeto
