# Painel Rotativo

Tela de NOC para TVs e monitores. A tela é dividida em até 4 áreas, e cada área reveza sozinha entre links cadastrados (Zabbix, Grafana, GLPI...). Cada link tem o seu próprio tempo de exibição.

- **Sem dependências:** o servidor usa só o módulo `http` do Node, e o front-end é um único `public/index.html`.
- **Estado no servidor:** fica em `data/config.json`. Qualquer TV ou navegador que abra o IP recebe a mesma configuração.
- **Retomada automática:** se a última tela foi a de exibição, quem abrir o endereço já encontra os links rodando.

## Subir em outro local

Precisa só de Docker com o plugin `compose`.

```sh
git clone https://github.com/sidneycavalcanti/painel-rotativo.git
cd painel-rotativo
cp .env.example .env        # opcional: troque PORTA se a 8080 estiver ocupada
docker compose up -d --build
```

Abra `http://IP_DO_SERVIDOR:8080`, ou a porta definida no `.env`.

**Usando a imagem pronta do GitHub (sem compilar):** a cada push na `main`, o GitHub Actions publica `ghcr.io/sidneycavalcanti/painel-rotativo` para amd64 e arm64, o que inclui o Raspberry Pi. O repositório é privado, então o servidor precisa fazer login uma vez com um token que tenha `read:packages`:

```sh
echo "$TOKEN" | docker login ghcr.io -u sidneycavalcanti --password-stdin
docker compose pull && docker compose up -d
```

**Sem docker compose:**

```sh
docker build -t painel-rotativo .
docker run -d --name painel-rotativo --restart unless-stopped -p 8080:3000 -v "$PWD/data:/data" painel-rotativo
```

## Operação

| Tarefa | Comando |
|---|---|
| Atualizar | `git pull && docker compose up -d --build` |
| Ver logs | `docker compose logs -f` |
| Saúde | `curl http://localhost:8080/health` responde `{"ok":true}` (o container também tem `HEALTHCHECK`) |
| Backup | copie `data/config.json`, ou use o botão **Importar / Exportar** na tela |
| Restaurar | cole o JSON em **Importar / Exportar** → Aplicar, ou coloque o arquivo em `data/` |
| Testar o servidor | `node test.js` (Node 18 ou mais) |

Se a pasta `data/` for criada com outro dono, o container (usuário `node`, uid 1000) precisa conseguir gravar nela: `sudo chown 1000:1000 data`.

## Uso

1. **Configuração:**
   - escolha o layout: 1 área, 2 lado a lado, 1 grande + 2 empilhadas, ou 2×2;
   - em cada área, adicione links com nome (opcional), URL e duração (mínimo 5 s), e reordene com ↑ ↓;
   - **Salvar** grava no servidor;
   - **Iniciar exibição** grava e abre o modo kiosk.
2. **Exibição:** mova o mouse para ver, em cada área, o nome, a URL e o progresso até a troca, além dos botões de tela cheia (tecla **F**) e de configuração (tecla **Esc**). Com o mouse parado, tudo some e o cursor também.

## API

| Rota | O que faz |
|---|---|
| `GET /api/config` | devolve `data/config.json`, ou o padrão: layout 4, `mode: "settings"`, 4 áreas vazias |
| `POST /api/config` | valida e grava (máximo de 1 MB, gravação atômica). Devolve o que foi gravado |
| `GET /health` | `{"ok": true}` |

```json
{
  "layout": 3,
  "mode": "display",
  "quadrants": [
    {"links": [{"title": "Zabbix", "url": "http://10.0.0.5/zabbix", "duration": 30}]},
    {"links": []}, {"links": []}, {"links": []}
  ]
}
```

O servidor sempre guarda 4 áreas, e o `layout` diz quantas aparecem. Campos desconhecidos são descartados, e a duração fica entre 5 s e 24 h.

## Sites que aparecem em branco

Sites que mandam `X-Frame-Options` ou a CSP `frame-ancestors` não abrem dentro de outra página. O painel não consegue contornar isso; a liberação é feita no próprio sistema.

| Sistema | Como liberar |
|---|---|
| Grafana | `GF_SECURITY_ALLOW_EMBEDDING=true`. Para dispensar o login, use um usuário só leitura para a TV ou dashboards públicos |
| Zabbix | Administração → Geral → Outros → "Usar X-Frame-Options": coloque a origem do painel ou desligue |
| GLPI e outros | cabeçalho `X-Frame-Options` / `Content-Security-Policy` no servidor web (nginx/Apache) |

Para conferir um site: `curl -sI http://site | grep -i -E "x-frame|frame-ancestors"`.

## Segurança

O painel não tem login, então qualquer pessoa da rede pode mudar os links. Use-o só em rede interna e não o exponha na internet sem um proxy com autenticação na frente.
