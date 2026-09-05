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
| `.krn` (Humdrum) | ✅ | ✅ | — |
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
- **Modo espera**: a reprodução para em cada nota e só continua quando você a toca no
  teclado MIDI. As teclas que faltam pulsam em âmbar, as certas acendem em verde e as
  erradas em vermelho — errar não bloqueia nem reinicia, só marca.
- **Você toca**: escolha ambas as mãos, só a direita ou só a esquerda. O app exige apenas a
  sua parte, toca o resto sozinho e silencia o que é seu.
- **Alcance do teclado** (49/61/76/88 teclas): notas fora do alcance do seu instrumento
  contam como já tocadas, então uma peça que desça abaixo dele não trava a reprodução.
- **Toque junto** pelo teclado do computador: fileira de baixo são as brancas, a de cima as
  pretas; `Z` e `X` mudam de oitava. O que você toca acende em verde.
- **Catálogo**: busca em repositórios públicos direto no app, com download para uma
  biblioteca local que sobrevive a fechar o navegador.
- **Funciona offline**: instalável como app, e depois de aquecido abre e toca sem internet.
- **Reiniciar** volta ao começo sem interromper: se estava tocando, continua tocando. Com um
  loop marcado, volta ao início do loop e não ao da peça.
- `Espaço` toca e pausa, `Home` reinicia, `Esc` limpa o loop, `→` pula o portão em que
  estiver travado.

## Rodando

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção em dist/ (estático, hospedável em qualquer lugar)
npm test         # testes
```

```bash
npm run catalog              # regenera o índice do catálogo
npm run catalog -- --refresh # relista os repositórios (gasta cota da API do GitHub)
```

Arquivos de exemplo para experimentar estão em `test-fixtures/`.

## Catálogo de partituras

A busca cobre duas fontes, e ambas foram escolhidas por uma razão técnica dura: **o app é
estático e sem backend, então só pode baixar de servidores que liberem CORS**.

| Fonte | Conteúdo |
|---|---|
| Coleções Humdrum de [Craig Sapp](https://github.com/craigsapp) | 779 peças: Beethoven (103 movimentos), Bach (370 corais), Chopin (76), Mozart (69), Scarlatti (65), Joplin (47), Hummel (24), Haydn (25). Edições acadêmicas de ciclos completos, com as mãos em pautas separadas |
| [musetrainer/library](https://github.com/musetrainer/library) | 69 peças populares em MusicXML: Für Elise, Clair de Lune, Canon in D, Gymnopédie, La Campanella, Nocturnes — incluindo arranjos fáceis |
| [thesession.org](https://thesession.org) | ~50 mil melodias tradicionais irlandesas em ABC |

As duas primeiras se complementam: as coleções Humdrum são edições acadêmicas de ciclos
inteiros, e o MuseTrainer traz o repertório que as pessoas de fato procuram para aprender.

**IMSLP e MuseScore ficaram de fora.** O IMSLP tem API mas não envia cabeçalho CORS, e o
MuseScore não tem API pública. Incluí-los exigiria um proxy — ou seja, um servidor. Vale
notar que o IMSLP é quase todo PDF escaneado de qualquer forma, que este app não saberia
tocar sem reconhecimento óptico.

A busca nas coleções hospedadas no GitHub é **local**, sobre índices gerados por
`scripts/build-catalog.mts`. Não é preguiça: a API do GitHub limita a 60 requisições por
hora por IP, o que inviabiliza busca ao vivo. Em troca, a busca fica instantânea e funciona
sem rede. O download em si vai ao `raw.githubusercontent.com`, que não tem esse limite.

Os metadados vêm de dentro dos próprios arquivos: os registros `!!!COM`/`!!!OTL` do Humdrum
e os campos `<work-title>`/`<creator>` do MusicXML. Nos dois casos há sujeira a limpar — o
Humdrum traz HTML e entidades nos campos, e quem envia ao MuseScore costuma pôr o crédito de
arranjo no campo de compositor.

### Licenças e procedência

As edições Humdrum são **CC BY-NC-SA 4.0**, de Craig Stuart Sapp. Por isso a atribuição
aparece junto de cada peça, e os arquivos **não são versionados neste repositório** — são
buscados em tempo de execução. Isso também evita um conflito de licenças: a cláusula
não-comercial é incompatível com a GPL-3.0 usada aqui.

O `musetrainer/library` **não tem arquivo de licença**: a alegação de domínio público está
apenas no README dele, e o conteúdo são envios da comunidade do MuseScore sobre obras
majoritariamente em domínio público. A atribuição exibida diz de onde veio e de quem é a
alegação, em vez de afirmar uma licença que ninguém verificou. Para estudo pessoal isso é
suficiente; para redistribuir, confira peça a peça.

## Biblioteca e uso offline

O que você baixa fica no IndexedDB do navegador e abre sem rede. Arquivos abertos do seu
computador entram na mesma lista, identificados por um hash do conteúdo — abrir o mesmo
arquivo duas vezes, ainda que renomeado, não cria duas entradas.

O app é um PWA instalável. O que vai em cada camada de cache importa:

- **Precache** (~750KB): só o app. O chunk do Verovio tem ~14MB, e baixá-lo na instalação do
  service worker arruinaria o primeiro carregamento de quem só quer abrir um `.mid`.
- **Cache sob demanda** (~26MB depois de aquecido): o motor do Verovio, os samples de piano
  e o índice do catálogo, cada um na primeira vez que é usado.

A atualização **pergunta antes** de recarregar: um `autoUpdate` no meio de um estudo perderia
a sessão — velocidade, loop e a posição na peça.

## Como funciona

```
.mid            → @tonejs/midi ─┐
.musicxml/.krn  → Verovio (WASM)┼→ Score { notes[], measures[], tempoMap, engraving? }
.abc            → abcjs ────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
         Transport                  Renderers              NoteInputSource
    (cursor sobre eventos,     piano roll + teclado     teclado do computador
     lookahead + portões)      + painel de partitura    e teclado MIDI (USB)
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
do rAF. É essa forma que permite o modo espera segurar o cursor indefinidamente: um portão é
só mais uma fronteira de agendamento, a mesma que faz o loop parar na emenda.

**A satisfação de um portão é "houve um ataque desde que ele abriu"**, não "a tecla está
pressionada" (`src/core/gates.ts`, `Transport.notePressed`). Sem essa distinção, uma nota
repetida se auto-satisfaria enquanto o usuário ainda segura a anterior. As notas de um
acorde são agrupadas com tolerância de 0,05 semínima, porque MIDI humanizado as espalha por
alguns ticks e agrupar por igualdade exata partiria o acorde em vários portões.

### Custo de carregamento

O motor de gravação do Verovio tem ~14MB (WASM embutido) e o abcjs ~500KB. Os dois são
carregados por `import()` dinâmico: quem abre apenas arquivos `.mid` nunca paga esse custo.
Os samples de piano são baixados sob demanda no primeiro play.

Usamos a variante `verovio/wasm-hum` em vez da padrão porque só ela lê Humdrum kern, o
formato das coleções de piano do catálogo. O módulo padrão devolve `0` em `loadData` num
`.krn`. Custa ~5MB a mais, pagos apenas por quem abre uma partitura gravada.

## Teclado MIDI

Conecte o instrumento por USB e permita o acesso quando o navegador pedir. Funciona em
Chrome, Edge e Firefox; o Safari não implementa a Web MIDI API.

A resposta ao toque passa por uma curva antes de virar volume (`src/input/midiMessage.ts`).
Isso não é enfeite: medindo um Casio CTK-3500, 13 de 32 notas de uma execução normal saíram
com velocidade MIDI abaixo de 16. Num mapeamento linear, boa parte do que se toca sairia
inaudível e o instrumento pareceria quebrado. A curva levanta o piso preservando a ordem
entre as dinâmicas.

## Limitações conhecidas

- Cerca de metade das peças do MuseTrainer não traz compositor: quem exportou deixou o
  campo vazio. O título costuma dizer ("Bach Minuet in G"), então a busca ainda funciona.
- Uns poucos títulos do catálogo repetem o número de catálogo (4 em 779). Vem de dados
  contraditórios na fonte: as sonatas de Scarlatti misturam as numerações Longo e
  Kirkpatrick, com o mesmo número sob prefixos diferentes.
- Pedal de sustentação (CC 64) é ignorado.
- O alcance do teclado é configuração, não detecção: o MIDI não informa quantas teclas o
  instrumento tem.
- A separação de mãos em arquivos MIDI de track única usa uma heurística de altura
  (`src/core/hands.ts`) e erra em passagens de mãos cruzadas.
- ABC realça a nota corrente, mas não desenha a faixa de compasso que o MusicXML desenha.

## Licença e procedência

O projeto é distribuído sob a **GPL-3.0** (ver `LICENSE`).

Dependências de runtime: Verovio é LGPL-3.0-or-later; abcjs, smplr, `@tonejs/midi` e React
são MIT. Todas compatíveis com a GPL-3.0.

As partituras do catálogo **não** vivem neste repositório; são buscadas em tempo de
execução, com a atribuição exibida na tela. Os arquivos de `test-fixtures/` são obras de
domínio público, usadas como exemplos e como base dos testes de integração:

- `book1-prelude01.mid`, `cpe-bach-solfeggietto.mid`, `Notebook2-16-March.mid` — de
  [mfiles.co.uk](https://www.mfiles.co.uk/classical-midi.htm)
- `MuzioClementi_...xml`, `JohannSebastianBach_...xml`, `Beethoven_...xml` — da suíte de
  testes do [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)
- `clementi.mxl` — o Clementi acima, compactado, para exercitar o caminho `.mxl`
- `fingering-sample.musicxml` e `exemplo.abc` — escritos para este projeto
