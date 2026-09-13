/**
 * Gera dashboard/public/data/geo_map.json a partir da malha municipal IDR
 * (mun_PR.json na raiz do repositório, não versionada).
 *
 * Somente estrutura territorial real: regionais IDR, mesorregiões e a lista
 * de municípios com código IBGE. Nenhum indicador é gerado aqui; os dados
 * de saúde vêm exclusivamente de scripts/download_data.py + preprocess_data.py.
 *
 * Uso: node dashboard/scripts/generate_geo_map.cjs
 */

const fs = require('fs');
const path = require('path');

const GEOJSON_PATH = path.join(__dirname, '../../mun_PR.json');
const OUTPUT_PATH = path.join(__dirname, '../public/data/geo_map.json');

function agruparPor(municipios, chave) {
  return municipios.reduce((acc, mun) => {
    const grupo = acc[mun[chave]] || [];
    return { ...acc, [mun[chave]]: [...grupo, { cod_ibge: mun.cod_ibge, nome: mun.nome }] };
  }, {});
}

function extrairMunicipios(geoJson) {
  const vistos = new Set();
  return geoJson.features
    .map(({ properties: p }) => ({
      cod_ibge: p.CodIbge,
      nome: p.Municipio,
      regional: p.RegIdr,
      mesorregiao: p.MesoIdr,
      codigo_regional: p.CRegIdr
    }))
    .filter((mun) => {
      if (vistos.has(mun.cod_ibge)) return false;
      vistos.add(mun.cod_ibge);
      return true;
    });
}

function main() {
  if (!fs.existsSync(GEOJSON_PATH)) {
    throw new Error(`Malha não encontrada: ${GEOJSON_PATH}`);
  }
  const geoJson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8'));
  const municipios = extrairMunicipios(geoJson);

  const municipiosPorRegional = agruparPor(municipios, 'regional');
  const municipiosPorMesorregiao = agruparPor(municipios, 'mesorregiao');

  const regionais = Object.entries(municipiosPorRegional)
    .map(([nome, muns], i) => ({
      codigo: String(i + 1).padStart(2, '0'),
      nome,
      totalMunicipios: muns.length
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const mesorregioes = Object.entries(municipiosPorMesorregiao)
    .map(([nome, muns]) => ({ nome, totalMunicipios: muns.length }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const municipioPorCodigo = Object.fromEntries(
    municipios.map((m) => [m.cod_ibge, { nome: m.nome, regional: m.regional, mesorregiao: m.mesorregiao }])
  );

  const geoMap = {
    regionais,
    mesorregioes,
    municipiosPorRegional,
    municipiosPorMesorregiao,
    municipioPorCodigo,
    totalMunicipios: municipios.length
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geoMap, null, 2));
  console.log(`geo_map.json gerado: ${municipios.length} municípios, ${regionais.length} regionais, ${mesorregioes.length} mesorregiões`);
}

main();
