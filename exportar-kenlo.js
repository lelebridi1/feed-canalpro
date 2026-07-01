/**
 * Exportacao COMPLETA dos imoveis do site para migracao no Kenlo.
 * --------------------------------------------------------------------------
 * Diferente do feed diario (gerar-feed.js), este script:
 *   - exporta TODOS os imoveis do site (sem limite de 20/dia);
 *   - NAO adiciona a sigla "LE" (dados limpos para o CRM);
 *   - gera o arquivo "imoveis-kenlo.xml" no padrao VRSync.
 *
 * Rode com:  node exportar-kenlo.js
 * (ou pelo workflow .github/workflows/exportar.yml no GitHub)
 */

import fs from 'fs';

const CONFIG = {
  API: 'https://casaimobiliariaes.com.br/wp-json/wp/v2/listings',
  PROVIDER: 'Casa Imobiliaria ES',
  EMAIL: 'contato@casaimobiliariaes.com.br',
  TELEFONE: '(27) 3070-4717',
  WEBSITE: 'https://casaimobiliariaes.com.br',
  ESTADO_NOME: 'Espirito Santo',
  ESTADO_SIGLA: 'ES',
  CIDADE_PADRAO: 'Serra',
  CEP_POR_CIDADE: { 'Serra': '29160-000', 'Vitoria': '29000-000', 'Vila Velha': '29100-000', 'Cariacica': '29140-000' },
  CEP_PADRAO: '29160-000',
  F_PRECO: 'listivo_130', F_QUARTOS: 'listivo_338', F_BANHEIROS: 'listivo_339',
  F_AREA: 'listivo_340', F_VAGAS: 'listivo_8985', F_FOTOS: 'listivo_145',
  TAX_TIPO: 'listivo_14', TAX_TRANSACAO: 'listivo_9031',
  TAX_CIDADE: 'listivo_9239', TAX_BAIRRO: 'listivo_9238',
  ARQUIVO: 'imoveis-kenlo.xml',
};

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const primeiro = (v) => (arr(v)[0] ?? '').toString().trim();
const inteiro = (v) => { const s = primeiro(v).replace(/,.*/, '').replace(/\D/g, ''); return s === '' ? '' : s; };
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

async function buscarImoveis() {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  };
  const todos = [];
  for (let page = 1; page <= 100; page++) {
    const url = `${CONFIG.API}?per_page=100&page=${page}&orderby=date&order=desc`;
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 400) break;
    if (!r.ok) throw new Error(`Erro HTTP ${r.status} ao ler ${url}`);
    const lote = await r.json();
    if (!Array.isArray(lote) || lote.length === 0) break;
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  return todos;
}

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

  let titulo = stripHtml(im.title?.rendered || '');
  if (titulo.length > 100) titulo = titulo.slice(0, 100);
  if (titulo.length < 10) titulo = `Imovel ${id}`;
  let desc = stripHtml(im.content?.rendered || '');
  if (desc.length < 50) desc = titulo + '. Entre em contato e agende sua visita.';
  if (desc.length > 3000) desc = desc.slice(0, 3000);
  const fotos = arr(im[CONFIG.F_FOTOS]).map(String).filter(Boolean);

  let x = '    <Listing>\n';
  x += `      <ListingID>${escXml(id)}</ListingID>\n`;
  x += `      <Title>${cdata(titulo)}</Title>\n`;
  x += `      <TransactionType>${tt}</TransactionType>\n`;
  x += '      <PublicationType>STANDARD</PublicationType>\n';
  x += `      <DetailViewUrl>${escXml(im.link || '')}</DetailViewUrl>\n`;
  x += '      <Media>\n';
  fotos.forEach((url, i) => {
    x += `        <Item medium="image" caption="img${i + 1}"${i === 0 ? ' primary="true"' : ''}>${escXml(url)}</Item>\n`;
  });
  x += '      </Media>\n';
  x += '      <Details>\n        <UsageType>Residential</UsageType>\n';
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
  x += '      </ContactInfo>\n    </Listing>\n';
  return x;
}

const imoveis = await buscarImoveis();
console.log(`Imoveis lidos do site: ${imoveis.length}`);

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
let n = 0;
for (const im of imoveis) { xml += montarListing(im); n++; }
xml += '  </Listings>\n</ListingDataFeed>\n';

fs.writeFileSync(CONFIG.ARQUIVO, xml);
console.log(`Exportacao gerada: ${CONFIG.ARQUIVO} com ${n} imoveis.`);
