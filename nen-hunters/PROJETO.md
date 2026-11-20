# Nen Hunters — documento do projeto

RPG online de mundo aberto com combate em tempo real, tema Hunter x Hunter (Nen). Personagens, nomes de habilidades e textos são **originais**, inspirados no universo. Sem dinheiro real: toda a economia é a moeda do jogo (Jenny), ganha jogando.

> Este arquivo é o ponto de partida para continuar o projeto em outra conta ou modelo. Atualize a seção "Estado" a cada etapa.

## Como rodar (local)
```
cd server
npm install
npm start          # abre http://localhost:3000 (o servidor entrega o jogo)
npm test           # teste de fumaça do servidor
```
Requer Node 18+. Dados dos jogadores ficam em `server/data/players.json`.

## Como publicar (um único serviço)
1. Suba a pasta do projeto para um repositório no GitHub.
2. No Render, crie um *Web Service* a partir do repositório (o `render.yaml` já está pronto: raiz `server`, build `npm install`, start `npm start`).
3. Abra a URL pública do serviço: o jogo e o servidor ficam juntos (`wss://` automático).
4. Opcional: variável `ALLOWED_ORIGINS` (separadas por vírgula) para aceitar só seus domínios; `MAX_PLAYERS` (padrão 100).

Atenção: no plano gratuito o Render "dorme" o serviço e apaga arquivos a cada deploy. Configure o Supabase (seção abaixo) para não perder o progresso. No Render, escolha a região Virginia (mais perto do Brasil).

Para hospedar o cliente separado (Vercel/Netlify), abra com `?server=wss://SEU-SERVIDOR` ou defina `window.NEN_SERVER`.

## Estrutura
```
client/index.html     jogo completo (canvas, HUD, joystick, painéis, arte em código)
client/assets/        imagens opcionais (lobo.png, urso.png, golem.png, guardiao.png)
server/src/index.js   HTTP + WebSocket, limite de mensagens, login por token
server/src/game.js    mundo autoritativo: movimento, combate, Nen, spin, snapshots 20x/s
server/src/data.js    TODO o balanceamento (categorias, chances, preços, mobs, zonas)
server/src/store.js   persistência: Supabase (se configurado) ou arquivo JSON
server/test/           smoke.js (rede), store.test.js (Supabase simulado), game.test.js e v3.test.js (regras)
```

## Protocolo (JSON via WebSocket)
Cliente → servidor: `join{name,token}`, `input{dx,dy}`, `attack{ax,ay}`, `hatsu{ax,ay}`, `nen{mode:ten|zetsu|ren}`, `vow{id}`, `spin`, `buySpin`, `buyGear{slot:wp|ar}`, `buyItem{id}`, `use{id}`, `home`, `rank`, `hname{text}`, `chat{text}`.
Servidor → cliente: `welcome` (mundo, categorias, chances, juramentos, mobs, equipamentos, itens, provas do exame), `s` (snapshot: `me`, `p` jogadores, `m` monstros, `j` projéteis, `e` eventos), `toast`, `chat`, `rank{list}`, `spinResult{cat}`.
O servidor decide tudo; o cliente só envia intenções.

## Decisões de design fechadas
- **Categorias**: Intensificação, Emissão, Transformação, Materialização, Manipulação, Especialização (multiplicadores em `data.js`).
- **Spin**: sorteado no servidor (`crypto.randomInt`). Chances: 21/21/20/18/18 e **2% Especialização**. Todo jogador novo começa com 1 spin grátis; girar **substitui** a categoria. Spin extra custa 500 J e ×1,35 a cada compra (teto 25.000 J).
- **Nen**: Ten (padrão, defesa leve, regenera aura), Zetsu (aura some, monstros veem a 30%, não ataca nem usa Hatsu), Ren (+40% de dano, gasta aura, recebe mais dano).
- **Hatsu**: custo 35 de aura, recarga 6 s, um efeito por categoria.
- **Juramentos**: Sem juramento (x1), Só com Ren ativo (x1,5), Paga 15% da vida (x1,6), Recarga dobrada (x1,5).
- **Mundo**: 3200x3200, zonas por distância do centro: Vila (segura), Floresta Sombria (lobos), Pântano Úmido (ursos), Ruínas do Norte (golens).
- **Morte**: volta à vila após 4 s e perde 5% dos Jenny.
- **Segurança já presente**: tudo validado no servidor, limite de 40 msgs/s por conexão, mensagens até 2 KB, token por jogador, filtro de origem opcional.

## Salvar progresso no Supabase (recomendado)
Sem isto, o progresso fica em arquivo e o Render gratuito apaga o arquivo a cada deploy.
1. Crie um projeto grátis em supabase.com. Em **SQL Editor**, rode:
```sql
create table if not exists players (
  token_hash text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table players enable row level security;
```
2. Em **Project Settings → API**, copie a **Project URL** e a chave **service_role** (ela é secreta: só no servidor, nunca no jogo nem no GitHub).
3. No Render, em **Environment**, crie `SUPABASE_URL` (a Project URL) e `SUPABASE_KEY` (a service_role). Salve: o serviço reinicia sozinho.
4. No log deve aparecer `(save: supabase)`.

Limites do plano gratuito (conferidos em 2026): 500 MB de banco por projeto e **pausa automática após 7 dias sem uso**. Cada jogador ocupa cerca de 1 KB, então o espaço não é problema. A pausa é: se ninguém jogar por uma semana, abra o painel do Supabase e clique em restaurar o projeto. Enquanto o banco estiver pausado ou fora do ar, o servidor **recusa novas entradas** (mensagem "Banco de dados indisponível") em vez de criar um personagem novo por cima do antigo; quem já está jogando continua, e os saves pendentes são tentados de novo a cada 20 s.

## Atualizar o jogo
O Render refaz o deploy sozinho a cada commit no GitHub (Auto-Deploy). Para enviar uma versão nova, arraste a pasta `nen-hunters` do zip para a página **Add file → Upload files** da raiz do repositório e faça o commit. Os arquivos de mesmo caminho são substituídos. Durante o deploy os jogadores são desconectados por alguns instantes.

## Arte (v0.4)
- **Monstros**: sprites pixel art gerados no ForgeGUI (lobo, urso, golem, Guardião). O cliente recorta o sprite automaticamente (e remove fundo liso, se houver) e, se a imagem não carregar, desenha círculos como antes. Para testar sem arte: abra o jogo com `?art=off`.
- **Hospedagem das imagens**: por padrão o jogo usa os links públicos do ForgeGUI (ficam no código do jogo, que é público). Para não depender deles, baixe e salve em `client/assets/` como `lobo.png`, `urso.png`, `golem.png`, `guardiao.png`; o servidor entrega a pasta em `/assets/` e o jogo prefere esses arquivos.
  Links (prefixo `https://azyjlkhpdgafuobyxoax.supabase.co/storage/v1/object/public/asset-images/68b5eea6-2896-4c60-9209-92a0f4b43ca7/mcp/`):
  lobo `4bc45d29-c08e-42bf-b178-37754e9da866/u1-e1-0.png`, urso `2c858d29-dbee-46a7-8577-05f53a138941/u1-e1-0.png`, golem `19a93869-f4ac-43f4-be1f-5dac312c84fa/u1-e1-0.png`, guardião `54f2f891-1ce6-4612-b2a0-9eae03e2b853/u1-e1-0.png`.
- **Feito em código** (sem créditos): personagem caçador (aura e cachecol na cor da categoria, olha para onde anda), chão com textura por zona, pinheiros, árvores secas, pilares, vila com fonte e cabanas (cabana "Loja"), ícones de poção e cristal, tela de título animada.
- **Pendente com créditos do ForgeGUI**: sprite do caçador, ícones de itens, texturas de chão e fundo do título em pixel art. O ForgeGUI cobra 1.600 créditos por imagem pixel; os créditos da conta acabaram e a resposta dela indicou renovação em 13/12/2026. O Higgsfield conectado aqui só consulta modelos e histórico, não gera imagens.

## Estado
- [x] Etapa 1 — design base (acima)
- [x] Etapa 2 — servidor base (sala única, tick 20 Hz, interesse por distância)
- [x] Etapa 3 — cliente (PC e celular), com predição de movimento para reduzir o atraso
- [x] Etapa 4 — combate em tempo real contra monstros, Nen e Hatsu
- [x] Etapa 5 — spin e economia
- [x] Etapa 6 — save no Supabase (opcional por variáveis de ambiente; fallback em arquivo)
- [ ] Etapa 6b — login real (hoje: token guardado no navegador; trocar por Supabase Auth)
- [~] Etapa 7 — conteúdo. Feito: loja de armas e armadura, missões de caça, chefe Guardião, minimapa, botão Vila (v0.2); inventário com poções e cristais, drops, **Exame Hunter** (4 provas + Licença Hunter), ranking online, nome do Hatsu, recompensa coletiva do chefe (v0.3). Falta: cidades, mais chefes, mais itens (equipamentos dropáveis), criador de Hatsu com efeitos escolhidos.
- [ ] Etapa 8 — social: PvP e Torre Celestial, grupos, ranking, trocas
- [ ] Etapa 9 — anti-cheat avançado e testes de carga
- [ ] Etapa 10 — testes com vários jogadores no servidor publicado

Testes: `npm test` roda quatro suítes (fumaça do servidor, Supabase simulado, regras do jogo v0.2 e v0.3). O cliente foi testado em navegador sem erros. **Ainda não testado**: Supabase real, muitos jogadores ao mesmo tempo.

## Regras novas da v0.2
- **Loja** (vila): Arma +15% de dano por nível; Armadura -6% de dano recebido por nível. Preço do próximo nível: 250 × 2,1^nível (de 250 J até ~10.500 J).
- **Missões**: matar N monstros do tipo sorteado (só tipos liberados pelo nível); recompensa = N × Jenny médio × 1,5 + XP. Ao concluir, sorteia outra.
- **Chefe**: Guardião das Ruínas (2200 de vida), anuncia no chat global quando cai. **Todo mundo que causou dano** recebe Jenny, XP, progresso de missão/exame e drops. 30% de chance de deixar cair 1 spin.

## Regras novas da v0.3
- **Itens** (comprados na vila ou dropados): Poção de Cura (60 J, 12% de drop, +40% de vida) e Cristal de Aura (80 J, 8% de drop, +60% de aura). Limite 99 de cada. Atalhos Q e F; botões no celular. Chefe sempre dropa 3 de cada.
- **Exame Hunter**: Prova 1 (12 lobos, Nv 3), Prova 2 (8 ursos, Nv 10), Prova 3 (6 golens, Nv 18), Prova Final (o Guardião, Nv 25). A prova só conta se o jogador estiver no nível mínimo. Concluir tudo dá a **Licença Hunter**: estrela ★ no nome, +10% de Jenny e XP e +2 spins.
- **Ranking**: top 10 dos jogadores online por nível (não é um ranking global salvo).
- **Nome do Hatsu**: texto livre filtrado (letras, números, espaço, `_`, `-`, `'`, até 20), aparece ao usar o Hatsu.
- **Segurança**: nomes como `__proto__` ou `constructor` em compras, itens e juramentos são ignorados (teste em `v3.test.js`).

## Ideias já pensadas (não feitas)
Habilidade Hatsu personalizada (criador com condições), inventário e equipamentos, PvP com zonas seguras, mapa-mini, sons, sprites no lugar dos círculos.
