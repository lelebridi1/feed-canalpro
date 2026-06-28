# Robô de Feed CanalPro (Caminho 1 — feed externo)

Este robô lê os imóveis publicados no site **casaimobiliariaes.com.br** (leitura pública, **sem precisar da Indutiva**), gera o arquivo no padrão oficial do Grupo OLX e o publica num link fixo. O **CanalPro lê esse link sozinho** e mantém os anúncios no ar, renovados todos os dias.

```
Site (leitura pública) → robô (GitHub) → feed-grupozap.xml → CanalPro → OLX/ZAP/Viva Real
```

**Regras já configuradas:**

- **Limite de 20 novos imóveis por dia** — o robô libera no máximo 20 imóveis novos por dia. Os que já entraram continuam no feed; o limite só segura a entrada de novos.
- **Sigla "LE"** — cada anúncio recebe o código `LE-<número>` e a sigla " - LE" no fim do título, para vocês identificarem facilmente o que é de vocês (já que várias pessoas publicam no mesmo CanalPro).

---

## Como funciona o limite (importante)

O feed sempre contém **todos** os imóveis já liberados, para o CanalPro mantê-los. O robô guarda num arquivo `estado.json` quais imóveis já entraram e em que dia. A cada dia, ele inclui os que já estavam + até **20 novos**. Assim o inventário entra de forma controlada, sem despejar tudo de uma vez.

---

## Passo a passo para colocar no ar (GitHub — grátis)

Você não precisa saber programar. São ~15 minutos, uma vez só.

### 1. Criar conta e repositório

1. Crie uma conta em https://github.com (se já tiver, use a sua).
2. Clique em **New repository** → dê um nome (ex.: `feed-canalpro`) → marque **Private** → **Create repository**.

### 2. Enviar os arquivos

1. No repositório novo, clique em **uploading an existing file**.
2. Arraste **todos** os arquivos desta pasta (incluindo a pasta `.github`) e confirme (**Commit changes**).

### 3. Ligar o robô e rodar a primeira vez

1. Abra a aba **Actions** → se pedir, clique em **I understand my workflows, enable them**.
2. Clique no workflow **"Gerar feed CanalPro"** → botão **Run workflow** → **Run workflow**.
3. Espere ~1 minuto. Vai aparecer um ✓ verde. Isso cria o arquivo `feed-grupozap.xml` no repositório.

### 4. Publicar o link (GitHub Pages)

1. Vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**, selecione a branch **main** e pasta **/(root)** → **Save**.
3. Aguarde 1–2 min. O GitHub mostra o endereço do site. Seu feed ficará em:

```
https://SEU-USUARIO.github.io/feed-canalpro/feed-grupozap.xml
```

(troque `SEU-USUARIO` e `feed-canalpro` pelos seus). Abra esse link no navegador para conferir que o XML aparece.

### 5. Conectar no CanalPro (uma vez só)

No CanalPro: **Configurações → Integrações → aba Imóveis → campo "URL XML imóveis"**, cole o link do passo 4 e confirme. Pronto — o CanalPro passa a importar sozinho.

### 6. Validar (recomendado)

Antes ou depois de conectar, cole o link no validador oficial para conferir se está tudo certo:
https://developers.grupozap.com/feeds/xml_validator/

---

## Daqui pra frente

- O robô roda **sozinho todo dia às 03:00 (horário de Brasília)**. Não precisa deixar computador ligado.
- Para rodar na hora, use **Actions → Run workflow**.
- Para **mudar o limite diário** ou outros dados, edite o topo do arquivo `gerar-feed.js` (bloco `CONFIG`): `LIMITE_NOVOS_POR_DIA`, `SIGLA`, telefone, etc.

---

## ⚠️ Pontos de atenção

1. **CEP e Estado:** o padrão exige CEP. O site (na amostra) traz só cidade e bairro, então o robô usa um **CEP aproximado por cidade** e o estado fixo (ES). Funciona, mas o ideal é o site passar a guardar o CEP real de cada imóvel.
2. **Mapeamento de campos:** foi confirmado num apartamento. Depois do primeiro feed, confira no validador (ou no próprio XML) se **casas** e **aluguéis** saíram corretos. Tudo é ajustável no `CONFIG`.
3. **Conta compartilhada / duplicados:** como várias pessoas publicam no mesmo CanalPro, a sigla **LE** serve para vocês acharem os seus. Atenção: ao ligar a integração por feed, alinhe com a equipe para evitar que o mesmo imóvel exista publicado na mão por outra pessoa **e** pelo feed (duplicidade). O ideal é combinar quem cuida de quê.
4. **Fotos:** imóvel sem nenhuma foto é pulado (o padrão exige ao menos 1).

---

## Arquivos

- `gerar-feed.js` — o robô (toda a configuração fica no topo, no bloco CONFIG).
- `.github/workflows/feed.yml` — o agendamento diário no GitHub.
- `package.json` — dados do projeto.
- `estado.json` — criado automaticamente; guarda o controle do limite diário (não apague).
- `feed-grupozap.xml` — criado automaticamente; é o arquivo que o CanalPro lê.
