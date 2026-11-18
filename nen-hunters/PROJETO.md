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

Atenção: no plano gratuito o Render "dorme" o serviço e apaga arquivos a cada deploy. Até a Etapa 6 (Supabase), o progresso dos jogadores pode ser perdido em redeploys.

Para hospedar o cliente separado (Vercel/Netlify), abra com `?server=wss://SEU-SERVIDOR` ou defina `window.NEN_SERVER`.

## Estrutura
```
client/index.html     jogo completo (canvas, HUD, joystick, painel de spin/juramento)
server/src/index.js   HTTP + WebSocket, limite de mensagens, login por token
server/src/game.js    mundo autoritativo: movimento, combate, Nen, spin, snapshots 20x/s
server/src/data.js    TODO o balanceamento (categorias, chances, preços, mobs, zonas)
server/src/store.js   persistência em JSON (trocar por Supabase na Etapa 6)
server/test/smoke.js  teste de fumaça
```

## Protocolo (JSON via WebSocket)
Cliente → servidor: `join{name,token}`, `input{dx,dy}`, `attack{ax,ay}`, `hatsu{ax,ay}`, `nen{mode:ten|zetsu|ren}`, `vow{id}`, `spin`, `buySpin`, `chat{text}`.
Servidor → cliente: `welcome` (mundo, categorias, chances, juramentos, mobs), `s` (snapshot: `me`, `p` jogadores, `m` monstros, `j` projéteis, `e` eventos), `toast`, `chat`, `spinResult{cat}`.
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

## Estado
- [x] Etapa 1 — design base (acima)
- [x] Etapa 2 — servidor base (salas únicas, tick 20 Hz, interesse por distância)
- [x] Etapa 3 — cliente (PC e celular)
- [x] Etapa 4 — combate em tempo real contra monstros, Nen e Hatsu
- [x] Etapa 5 — spin e economia
- [ ] Etapa 6 — contas e save reais (Supabase; hoje: token no navegador + JSON)
- [ ] Etapa 7 — conteúdo: missões, cidades, Exame Hunter, chefes, itens e inventário
- [ ] Etapa 8 — social: PvP e Torre Celestial, grupos, ranking, trocas
- [ ] Etapa 9 — anti-cheat avançado e testes de carga
- [ ] Etapa 10 — publicação e testes com vários jogadores

Testado: servidor (`npm test`) e cliente no navegador (entrar, girar, juramento, mover, Ren, Hatsu) sem erros. **Ainda não testado**: vários jogadores simultâneos e deploy real.

## Ideias já pensadas (não feitas)
Habilidade Hatsu personalizada (criador com condições), inventário e equipamentos, PvP com zonas seguras, mapa-mini, sons, sprites no lugar dos círculos.
