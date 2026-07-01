/**
 * Robo de feed CanalPro (VrSync) - Caminho 1 (feed externo)
 * --------------------------------------------------------------------------
 * 1. Le os imoveis publicos do site (API do WordPress/Listivo).
 * 2. Aplica o limite de NOVOS anuncios por dia (CONFIG.LIMITE_NOVOS_POR_DIA).
 * 3. Marca os anuncios com a sigla "LE" (no codigo e no fim do titulo).
 * 4. Gera o arquivo feed-grupozap.xml no padrao oficial do Grupo OLX.
 * 5. Guarda o estado em estado.json (quais imoveis ja foram liberados e quando).
 *
 * Rode com:  node gerar-feed.js
 * (No GitHub Actions isso roda sozinho todo dia - veja .github/workflows/feed.yml)
 */

import fs from 'fs';

/* ===================== CONFIG (ajuste aqui) ============================== */
const CONFIG = {
  API: 'https://casaimobiliariaes.com.br/wp-json/wp/v2/listings',
  SIGLA: 'LE',
  LIMITE_NOVOS_POR_DIA: 20,
  // Ordem de liberacao dos novos: 'recentes' (mais novos primeiro) ou 'antigos'
  ORDEM_LIBERACAO: 'recentes',

  // Dados da imobiliaria (vao no Header e ContactInfo)
  PROVIDER: 'Casa Imobiliaria ES',
  EMAIL: 'contato@casaimobiliariaes.com.br',
  TELEFONE: '(27) 3070-4717',
  WEBSITE: 'https://casaimobiliariaes.com.br',

  // Localizacao padrao (o padrao VrSync exige CEP e Estado)
  ESTADO_NOME: 'Espirito Santo',
  ESTADO_SIGLA: 'ES',
  CIDADE_PADRAO: 'Serra',
  CEP_POR_CIDADE: {
    'Serra': '29160-000', 'Vitoria': '29000-000',
    'Vila Velha': '29100-000', 'Cariacica': '29140-000',
  },
  CEP_PADRAO: '29160-000',

  // IDs dos campos do Listivo (confirmados via API)
  F_PRECO: 'listivo_130', F_QUARTOS: 'listivo_338', F_BANHEIROS: 'listivo_339',
  F_AREA: 'listivo_340', F_VAGAS: 'listivo_8985', F_FOTOS: 'listivo_145',
  TAX_TIPO: 'listivo_14', TAX_TRANSACAO: 'listivo_9031',
  TAX_CIDADE: 'listivo_9239', TAX_BAIRRO: 'listivo_9238',

  ARQUIVO_FEED: 'feed-grupozap.xml',
  ARQUIVO_ESTADO: 'estado.json',
};

/* ===================== Helpers ========================================== */
const hoje = () => new Date().toISOString().slice(0, 10);
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const primeiro = (v) => (arr(v)[0] ?? '').toString().trim();
const inteiro = (v) => {
  const s = primeiro(v).replace(/,.*/, '').replace(/\D/g, '');
  return s === '' ? '' : s;
};
const cdata = (s) => `<![CDATA[${s}]]>`;
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripHtml = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

function propertyType(tipos) {
  const t = tipos.join(' ').toLowerCase();
  if (t.includes('condomin') && t.includes('casa')) return 'Residential / Condo';
  if (t.includes('geminada')) return 'Residential / Village House';
  if (t.includes('sobrado')) return 'Residential / Sobrado';
  if (t.includes('cobertura')) return 'Residential / Penthouse';
  if (t.includes('kitnet')) return 'Residential / Kitnet';
  if (t.includes('flat')) return 'Residential / Flat';
  if (t.includes('terreno') || t.includes('lote')) return 'Residential / Land Lot';
  if (t.includes('casa')) return 'Residential / Home';
  if (t.includes('apart')) return 'Residential / Apartment';
  return 'Residential / Apartment';
}

/* ===================== Leitura do site (paginada) ======================= */
async function buscarImoveis() {
  // Modo teste offline: se existir amostra.json e TESTE=1, usa o arquivo local
  if (process.env.TESTE === '1' && fs.existsSync('amostra.json')) {
    console.log('[TESTE] lendo amostra.json em vez da internet');
    return JSON.parse(fs.readFileSync('amostra.json', 'utf-8'));
  }
  // Cabecalhos de navegador (o site tem protecao anti-bot que bloqueia requisicoes "cruas")
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  };
  // Busca uma pagina com ate 3 tentativas (para driblar bloqueios passageiros do site)
  async function buscarPagina(page) {
    const url = `${CONFIG.API}?per_page=100&page=${page}&orderby=date&order=desc`;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (r.ok) return await r.json();
        if (r.status === 400) return []; // provavelmente passou da ultima pagina
        console.log(`  (pagina ${page}: HTTP ${r.status}, tentativa ${tentativa}/3)`);
      } catch (e) {
        console.log(`  (pagina ${page}: erro de rede, tentativa ${tentativa}/3)`);
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
    return null; // falhou apos as tentativas
  }

  const todos = [];
  for (let page = 1; page <= 100; page++) {
    const lote = await buscarPagina(page);
    if (lote === null) { console.error(`Falha ao ler a pagina ${page} apos 3 tentativas.`); break; }
    if (!Array.isArray(lote) || lote.length === 0) break;
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  return todos;
}

/* ===================== Estado (limite diario) =========================== */
function carregarEstado() {
  try { return JSON.parse(fs.readFileSync(CONFIG.ARQUIVO_ESTADO, 'utf-8')); }
  catch { return { liberados: {} }; }
}

/* ===================== Montagem de 1 <Listing> ========================== */
function montarListing(im) {
  const id = im.id;
  const transacao = arr(im[CONFIG.TAX_TRANSACAO]).join(' ').toLowerCase();
  const isAluguel = transacao.includes('alug');
  const isVenda = transacao.includes('venda');
  const tt = isVenda && isAluguel ? 'Sale/Rent' : isAluguel ? 'For Rent' : 'For Sale';
  const preco = inteiro(im[CONFIG.F_PRECO]);

  let cidade = primeiro(im[CONFIG.TAX_CIDADE]) || CONFIG.CIDADE_PADRAO;
  let bairro = primeiro(im[CONFIG.TAX_BAIRRO]) || cidade;
  const cep = CONFIG.CEP_POR_CIDADE[cidade] || CONFIG.CEP_PADRAO;

  const tipo = propertyType(arr(im[CONFIG.TAX_TIPO]).map(String));
  const quartos = inteiro(im[CONFIG.F_QUARTOS]);
  const banheiros = inteiro(im[CONFIG.F_BANHEIROS]);
  const area = inteiro(im[CONFIG.F_AREA]);
  const vagas = inteiro(im[CONFIG.F_VAGAS]);

  // Titulo com a sigla LE no fim (limite de 100 caracteres do padrao)
  let titulo = stripHtml(im.title?.rendered || '');
  const sufixo = ` - ${CONFIG.SIGLA}`;
  if (titulo.length > 100 - sufixo.length) titulo = titulo.slice(0, 100 - sufixo.length).trim();
  titulo = titulo + sufixo;
  if (titulo.length < 10) titulo = `Imovel ${id}${sufixo}`;

  let desc = stripHtml(im.content?.rendered || '');
  if (desc.length < 50) desc = titulo + '. Entre em contato e agende sua visita.';
  if (desc.length > 3000) desc = desc.slice(0, 3000);

  const fotos = arr(im[CONFIG.F_FOTOS]).map(String).filter(Boolean);
  if (fotos.length === 0) return null; // padrao exige >= 1 foto

  const listingId = `${CONFIG.SIGLA}-${id}`;
  let x = '';
  x += '    <Listing>\n';
  x += `      <ListingID>${escXml(listingId)}</ListingID>\n`;
  x += `      <Title>${cdata(titulo)}</Title>\n`;
  x += `      <TransactionType>${tt}</TransactionType>\n`;
  x += '      <PublicationType>STANDARD</PublicationType>\n';
  x += `      <DetailViewUrl>${escXml(im.link || '')}</DetailViewUrl>\n`;
  x += '      <Media>\n';
  fotos.forEach((url, i) => {
    x += `        <Item medium="image" caption="img${i + 1}"${i === 0 ? ' primary="true"' : ''}>${escXml(url)}</Item>\n`;
  });
  x += '      </Media>\n';
  x += '      <Details>\n';
  x += '        <UsageType>Residential</UsageType>\n';
  x += `        <PropertyType>${tipo}</PropertyType>\n`;
  x += `        <Description>${cdata(desc)}</Description>\n`;
  if (preco !== '') x += `        <${tt === 'For Rent' ? 'RentalPrice currency="BRL" period="Monthly"' : 'ListPrice currency="BRL"'}>${preco}</${tt === 'For Rent' ? 'RentalPrice' : 'ListPrice'}>\n`;
  if (area !== '') x += `        <LivingArea unit="square metres">${area}</LivingArea>\n`;
  if (quartos !== '') x += `        <Bedrooms>${quartos}</Bedrooms>\n`;
  if (banheiros !== '') x += `        <Bathrooms>${banheiros}</Bathrooms>\n`;
  if (vagas !== '') x += `        <Garage type="Parking Space">${vagas}</Garage>\n`;
  x += '      </Details>\n';
  x += '      <Location displayAddress="Neighborhood">\n';
  x += '        <Country abbreviation="BR">Brasil</Country>\n';
  x += `        <State abbreviation="${escAttr(CONFIG.ESTADO_SIGLA)}">${cdata(CONFIG.ESTADO_NOME)}</State>\n`;
  x += `        <City>${cdata(cidade)}</City>\n`;
  x += `        <Neighborhood>${cdata(bairro)}</Neighborhood>\n`;
  x += `        <PostalCode>${escXml(cep)}</PostalCode>\n`;
  x += '      </Location>\n';
  x += '      <ContactInfo>\n';
  x += `        <Name>${escXml(CONFIG.PROVIDER)}</Name>\n`;
  x += `        <Email>${escXml(CONFIG.EMAIL)}</Email>\n`;
  x += `        <Website>${escXml(CONFIG.WEBSITE)}</Website>\n`;
  x += `        <Telephone>${escXml(CONFIG.TELEFONE)}</Telephone>\n`;
  x += '      </ContactInfo>\n';
  x += '    </Listing>\n';
  return x;
}

/* ===================== Principal ======================================== */
async function main() {
  const imoveis = await buscarImoveis();
  console.log(`Imoveis lidos do site: ${imoveis.length}`);

  // PROTECAO: se leu 0 imoveis (site pode ter bloqueado o acesso), aborta SEM
  // sobrescrever o feed nem o estado. Assim o ultimo feed bom continua no ar.
  if (imoveis.length === 0) {
    console.error('ABORTANDO: 0 imoveis lidos do site (possivel bloqueio). Feed atual mantido, nada foi sobrescrito.');
    process.exit(1);
  }

  const estado = carregarEstado();
  const liberados = estado.liberados || {};
  const idsNoSite = new Set(imoveis.map((i) => String(i.id)));

  // limpa do estado os imoveis que sairam do site
  for (const id of Object.keys(liberados)) if (!idsNoSite.has(id)) delete liberados[id];

  // novos candidatos = imoveis do site que ainda nao foram liberados
  let novos = imoveis.filter((i) => !liberados[String(i.id)]);
  if (CONFIG.ORDEM_LIBERACAO === 'antigos') novos = novos.reverse();

  // quantos ja liberei HOJE (respeita o limite mesmo se rodar varias vezes)
  const liberadosHoje = Object.values(liberados).filter((d) => d === hoje()).length;
  const vagasHoje = Math.max(0, CONFIG.LIMITE_NOVOS_POR_DIA - liberadosHoje);
  const aLiberar = novos.slice(0, vagasHoje);
  for (const im of aLiberar) liberados[String(im.id)] = hoje();
  console.log(`Novos liberados hoje: ${aLiberar.length} (limite ${CONFIG.LIMITE_NOVOS_POR_DIA}, ja liberados hoje: ${liberadosHoje})`);

  // o feed contem TODOS os imoveis ja liberados (que ainda existem no site)
  const noFeed = imoveis.filter((i) => liberados[String(i.id)]);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"\n';
  xml += '                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
  xml += '                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">\n';
  xml += '  <Header>\n';
  xml += `    <Provider>${escXml(CONFIG.PROVIDER)}</Provider>\n`;
  xml += `    <Email>${escXml(CONFIG.EMAIL)}</Email>\n`;
  xml += `    <ContactName>${escXml(CONFIG.PROVIDER)}</ContactName>\n`;
  xml += `    <PublishDate>${new Date().toISOString().slice(0, 19)}</PublishDate>\n`;
  xml += `    <Telephone>${escXml(CONFIG.TELEFONE)}</Telephone>\n`;
  xml += '  </Header>\n  <Listings>\n';

  let incluidos = 0, semFoto = 0;
  for (const im of noFeed) {
    const bloco = montarListing(im);
    if (bloco) { xml += bloco; incluidos++; } else { semFoto++; }
  }
  xml += '  </Listings>\n</ListingDataFeed>\n';

  fs.writeFileSync(CONFIG.ARQUIVO_FEED, xml);
  fs.writeFileSync(CONFIG.ARQUIVO_ESTADO, JSON.stringify({ atualizado: new Date().toISOString(), liberados }, null, 2));

  console.log(`Feed gerado: ${CONFIG.ARQUIVO_FEED}`);
  console.log(`  Anuncios no feed: ${incluidos}` + (semFoto ? ` (pulei ${semFoto} sem foto)` : ''));
  console.log(`  Total ja liberado (acumulado): ${Object.keys(liberados).length}`);
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
