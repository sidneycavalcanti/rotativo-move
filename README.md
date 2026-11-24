# Painel Rotativo

Tela de NOC para TVs e monitores. A tela é dividida em até 4 áreas, e cada área reveza sozinha entre links cadastrados (Zabbix, Grafana, GLPI...). Cada link tem o seu próprio tempo de exibição.

- **Sem dependências:** o servidor usa só o módulo `http` do Node, e o front-end é um único `public/index.html`.
- **Privado por navegador:** links, configuração (`localStorage`) e imagens/vídeos (IndexedDB) ficam só no navegador de quem cadastrou. O servidor só entrega a página e não guarda nada: outra pessoa, ou outro navegador, abre o painel vazio. Uma instância pública pode ser usada por várias pessoas sem que uma veja os dados da outra.
- **Levar para a TV:** use **Importar / Exportar** (arquivo YAML ou JSON). Imagens e vídeos não vão no arquivo: envie de novo no navegador da TV.
- **Retomada automática:** se a última tela foi a de exibição, ao reabrir naquele navegador os links já estão rodando.
- **Limpar os dados do navegador** (ou janela anônima) apaga a configuração: guarde um backup pelo **Importar / Exportar**.

## Subir em outro local

Precisa só de Docker com o plugin `compose`.

```sh
git clone https://github.com/sidneycavalcanti/rotativo-move.git
cd rotativo-move
cp .env.example .env        # opcional: troque PORTA se a 8080 estiver ocupada
docker compose up -d --build
```

Abra `http://IP_DO_SERVIDOR:8080`, ou a porta definida no `.env`.

**Usando a imagem pronta (sem compilar no servidor):** a cada push na `main`, o GitHub Actions roda o teste e publica `ghcr.io/sidneycavalcanti/rotativo-move:latest` para amd64 e arm64, o que inclui o Raspberry Pi.

```sh
docker compose pull && docker compose up -d
```

Se o `pull` pedir login (`unauthorized`), o pacote ainda está privado. Para torná-lo público, vá em GitHub → seu perfil → Packages → `rotativo-move` → Package settings → Change visibility → Public. Outra opção é fazer `docker login ghcr.io` com um token que tenha `read:packages`.

**Sem docker compose:**

```sh
docker build -t painel-rotativo .
docker run -d --name painel-rotativo --restart unless-stopped -p 8080:3000 painel-rotativo
```

## Operação

| Tarefa | Comando |
|---|---|
| Atualizar | `git pull && docker compose up -d --build` |
| Ver logs | `docker compose logs -f` |
| Saúde | `curl http://localhost:8080/health` responde `{"ok":true}` (o container também tem `HEALTHCHECK`) |
| Backup | botão **Importar / Exportar** → Baixar arquivo, em cada navegador |
| Restaurar | **Importar / Exportar** → Abrir arquivo → Aplicar |
| Testar o servidor | `node test.js` (Node 18 ou mais) |

**Atrás de proxy (nginx, Traefik, NPM):** funciona também num subcaminho, como `location /painel/ { proxy_pass http://painel:3000/; }`, porque a página usa caminhos relativos.

**udocker / podman rootless:** não precisa de volume nem de permissão de gravação. Exemplo com udocker:

```sh
udocker pull ghcr.io/sidneycavalcanti/rotativo-move:latest
udocker create --name=rotativo ghcr.io/sidneycavalcanti/rotativo-move:latest
nohup udocker run -e PORT=8080 rotativo > rotativo.log 2>&1 &
```

O udocker não mapeia portas: o servidor escuta direto na porta do `PORT`.

## Uso

1. **Configuração:**
   - escolha o layout: 1 área, 2 lado a lado, 1 grande + 2 empilhadas, ou 2×2;
   - em cada área, adicione links com nome (opcional), URL e tempo na tela (mínimo 5 s; aceita `30s`, `5m`, `1h30m` ou `1:30`), e reordene com ↑ ↓;
   - **Salvar** grava neste navegador;
   - **Iniciar exibição** grava e abre o modo kiosk.
2. **Exibição:** mova o mouse para ver, em cada área, o nome, a URL e o progresso até a troca, além dos botões de tela cheia (tecla **F**) e de configuração (tecla **Esc**). Com o mouse parado, tudo some e o cursor também.

## Enquadramento (dashboards inteiros em 2, 3 ou 4 áreas)

Numa área pequena, um dashboard responsivo se reorganiza, aperta e corta. Para evitar isso, o painel desenha cada página numa **tela virtual do tamanho de uma TV inteira** e reduz para caber na área. É como ter 4 TVs em tela cheia lado a lado.

| Opção (tela de configuração → Enquadramento) | Efeito |
|---|---|
| **Tela da TV** (padrão) | a tela virtual tem o tamanho da própria TV ou janela. Numa grade 2×2, cada dashboard aparece exatamente como em tela cheia, em 50% |
| **HD / Full HD / QHD / 4K** | força 1280×720, 1920×1080, 2560×1440 ou 3840×2160. Com 4K o dashboard mostra mais conteúdo, com letra menor. Use Full HD para os dashboards ficarem iguais em TVs diferentes |
| **Conter** | mantém a proporção, sem cortar. Pode sobrar uma faixa preta (ex.: área alta do layout de 3) |
| **Esticar** | preenche a área toda, com uma pequena distorção quando a proporção é diferente |

## Zoom e digitação (login) dentro das áreas

- **Zoom fixo por item:** o campo **Zoom** de cada item (25% a 400%) aumenta ou diminui só aquela página, imagem ou vídeo, e fica salvo, então a TV já abre assim. Na página, 125% equivale ao Ctrl + do navegador, só que apenas naquela área.
- **Zoom na hora:** clique dentro da área e use **Ctrl +**, **Ctrl −** ou **Ctrl 0**. É o zoom do próprio navegador e não fica salvo.
- **Digitar, por exemplo para fazer login:** clique dentro da área e digite normalmente.
  - Enquanto o foco estiver nela, a área **pausa a rotação**, mostra a faixa "Em uso: rotação pausada" e ganha borda âmbar, para a página não trocar no meio do login. As outras áreas continuam girando.
  - Clicar fora da área retoma a rotação. Depois de 5 min parada, ela retoma sozinha.

## Imagens e vídeos

Clique em **Mídia** no topo, ou no botão ao lado do link de um item, e arraste os arquivos, ou use **Escolher arquivos**. Os arquivos não saem da máquina: ficam guardados no navegador.

- **Formatos:** PNG, JPG, GIF, WEBP, SVG e AVIF; vídeos MP4, WEBM, OGV e MOV (o MOV depende do codec).
- **Armazenamento:** IndexedDB do navegador. O limite é o espaço livre do disco que o navegador libera (normalmente vários GB); o painel pede ao navegador para não apagar esses arquivos sozinho.
- **Ao escolher um vídeo**, o "Tempo na tela" vira a duração dele. Vídeos tocam sem som, em loop e do começo a cada vez.
- **Links diretos:** um link para uma imagem ou vídeo (`https://…/banner.png`) também funciona.
- **Apagar:** o ícone de lixeira, com dois cliques, apaga do navegador. Mídia em uso por algum item aparece marcada como "em uso".

## Importar e exportar (YAML ou JSON)

Em **Importar / Exportar**, escolha **YAML** ou **JSON**:
- **Baixar arquivo** gera um backup `painel-rotativo-AAAA-MM-DD.yml`.
- **Abrir arquivo…** carrega um `.yml` ou `.json`.
- **Aplicar e salvar** grava a configuração.

O YAML pode ser editado à mão, inclusive com comentários `#`:

```yaml
layout: 4
tela:
  resolucao: 1920x1080   # auto, 1280x720, 1920x1080, 2560x1440, 3840x2160
  ajuste: conter         # conter | esticar
quadrants:
  - links:
      - title: Grafana NOC
        url: http://grafana.local:3000/d/abc?kiosk
        duration: 60
      - title: Aviso da recepção
        url: midia/1795465579643-aviso.png   # arquivo enviado pela tela Mídia
        duration: 20
  - links: []
```

A configuração não carrega os arquivos de mídia. No outro navegador, envie as imagens e vídeos de novo e escolha-os nos itens.

## YouTube

O link pode ser colado como aparece no navegador. O painel converte sozinho para o player de embed, porque a página `watch` do YouTube bloqueia iframe.

| Link colado | Vira |
|---|---|
| `youtube.com/watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/live/ID` | vídeo em loop |
| `youtube.com/playlist?list=PL…` ou `watch?v=ID&list=PL…` | playlist |
| `youtube.com/channel/UC…/live` | a transmissão ao vivo do canal |
| `&t=90s` | começa no segundo 90 |

- **Sem som:** o vídeo toca automático e mudo, porque os navegadores bloqueiam autoplay com som. Numa TV dedicada, rode o Chrome com `--autoplay-policy=no-user-gesture-required` para liberar o som; depois é só ajustar no player.
- **Mix e Rádio (`list=RD…`):** o embed não aceita essas listas. O painel toca só o vídeo, em loop.
- **"Este vídeo não está disponível":** o dono do canal desativou a reprodução fora do YouTube, o que é comum em clipes de gravadora. Não tem como contornar; use outro vídeo.
- **Tempo:** coloque no campo **Tempo na tela** a duração do vídeo (ex.: `3:45`) para trocar no fim, ou um tempo menor para mostrar só um trecho.

## Sites com login

O painel não guarda senhas. O navegador também não deixa uma página preencher o login de outro site dentro de um iframe, por segurança. O caminho é dar à TV um acesso próprio, só de leitura, em cada sistema:

| Sistema | Como fazer a TV entrar sozinha |
|---|---|
| Grafana | **Acesso anônimo** só leitura (`GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`) + `GF_SECURITY_ALLOW_EMBEDDING=true`, ou **dashboard público** (Share → Public dashboard), que já gera um link sem login. Use `?kiosk` no fim do link |
| Zabbix | Usuário **guest** habilitado num grupo só leitura (Usuários → Grupos → "Guests": ativar, dar permissão de leitura aos hosts). Depois libere o iframe (Administração → Geral → Outros → X-Frame-Options) |
| GLPI e outros | Faça login **uma vez** na própria TV, dentro do painel. O cookie fica salvo naquele navegador. Se o site está em outro domínio, o Chrome pode bloquear o cookie no iframe: libere "cookies de terceiros" para esse site nas configurações da TV |

Sistemas na mesma rede e com HTTPS próprio costumam manter o login feito uma vez na TV. Sistemas com cookie `SameSite=Lax`, como o padrão do Grafana, não mantêm login dentro de iframe; para eles use o acesso anônimo ou o link público.

## API

| Rota | O que faz |
|---|---|
| `GET /api/info` | `{"cafe": "...", "pix": "..."}`: botão "Me pague um café" (vem do `.env`) |
| `GET /health` | `{"ok": true}` |

Não há API de configuração nem de mídia: o servidor não recebe nem guarda dados de quem usa.

## Sites que aparecem em branco

Sites que mandam `X-Frame-Options` ou a CSP `frame-ancestors` não abrem dentro de outra página. O painel não consegue contornar isso; a liberação é feita no próprio sistema.

| Sistema | Como liberar |
|---|---|
| Grafana | `GF_SECURITY_ALLOW_EMBEDDING=true`. Para dispensar o login, use um usuário só leitura para a TV ou dashboards públicos |
| Zabbix | Administração → Geral → Outros → "Usar X-Frame-Options": coloque a origem do painel ou desligue |
| GLPI e outros | cabeçalho `X-Frame-Options` / `Content-Security-Policy` no servidor web (nginx/Apache) |

Para conferir um site: `curl -sI http://site | grep -i -E "x-frame|frame-ancestors"`.

## Segurança

O servidor não guarda nada de quem usa: cada navegador tem os seus próprios links, imagens e vídeos, e ninguém vê os dados de outra pessoa. Por isso o painel pode ficar aberto na internet sem login. Quem tem acesso ao computador/TV vê o que está cadastrado nele.

## Exibição: tamanho das áreas, login e atualizar

- **Tamanho das áreas:** com o mouse em movimento aparecem as divisórias entre as áreas; arraste para aumentar ou diminuir (fica salvo). Duplo clique volta ao padrão.
- **Barra e progresso:** só aparecem com o mouse em movimento; a troca acontece sozinha no tempo definido, sem aviso na tela.
- **Navegar / fazer login num painel:** clique dentro da área e use normalmente; a rotação daquela área pausa enquanto você usa (volta ao clicar fora ou após 5 min).
- **Botões de cada área** (na barra de baixo): ↻ atualiza a área; ↗ abre o link numa aba nova. Use a aba nova para fazer login quando o sistema não deixa entrar dentro do iframe; depois de logado, atualize a área.
- Login dentro do iframe depende do sistema: Grafana precisa de `allow_embedding = true` (e `cookie_samesite = none` + HTTPS se o painel estiver em outro domínio); Zabbix precisa liberar o X-Frame-Options em *Administração → Geral → Outros*.

## Me pague um café

`CAFE_URL` (Buy Me a Coffee, Ko-fi...) e `PIX_CHAVE` no `.env`. Com Pix, o botão abre uma janela com as duas formas e o botão de copiar a chave.
