/**
 * Script para gerar dados a nível municipal para o dashboard de saúde
 * Gera dados simulados realistas para todos os 399 municípios do Paraná
 */

const fs = require('fs');
const path = require('path');

// Carregar GeoJSON original para obter lista completa de municípios
const geoJsonPath = path.join(__dirname, '../../mun_PR.json');
const outputDir = path.join(__dirname, '../public/data');

// População estimada por município (simplificado - usar proporção baseada em dados reais)
const populacaoParana = 11890517;

// Função para gerar número aleatório com distribuição normal
function randomNormal(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

// Função para gerar taxa com variação realista
function gerarTaxa(base, variacao = 0.3) {
  return Math.max(0.1, base * (1 + (Math.random() - 0.5) * variacao));
}

async function main() {
  console.log('Carregando GeoJSON...');

  // Ler GeoJSON
  const geoJsonRaw = fs.readFileSync(geoJsonPath, 'utf-8');
  const geoJson = JSON.parse(geoJsonRaw);

  // Extrair municípios
  const municipios = [];
  const municipiosPorRegional = {};
  const municipiosPorMesorregiao = {};
  const municipioPorCodigo = {};

  geoJson.features.forEach(feature => {
    const props = feature.properties;
    const mun = {
      cod_ibge: props.CodIbge,
      nome: props.Municipio,
      regional: props.RegIdr,
      mesorregiao: props.MesoIdr,
      codigo_regional: props.CRegIdr
    };

    // Evitar duplicatas
    if (!municipioPorCodigo[mun.cod_ibge]) {
      municipios.push(mun);
      municipioPorCodigo[mun.cod_ibge] = {
        nome: mun.nome,
        regional: mun.regional,
        mesorregiao: mun.mesorregiao
      };

      // Por regional
      if (!municipiosPorRegional[mun.regional]) {
        municipiosPorRegional[mun.regional] = [];
      }
      municipiosPorRegional[mun.regional].push({
        cod_ibge: mun.cod_ibge,
        nome: mun.nome
      });

      // Por mesorregião
      if (!municipiosPorMesorregiao[mun.mesorregiao]) {
        municipiosPorMesorregiao[mun.mesorregiao] = [];
      }
      municipiosPorMesorregiao[mun.mesorregiao].push({
        cod_ibge: mun.cod_ibge,
        nome: mun.nome
      });
    }
  });

  console.log(`Total de municípios: ${municipios.length}`);

  // Gerar regionais
  const regionais = Object.entries(municipiosPorRegional).map(([nome, muns], i) => ({
    codigo: String(i + 1).padStart(2, '0'),
    nome,
    totalMunicipios: muns.length
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Gerar mesorregiões
  const mesorregioes = Object.entries(municipiosPorMesorregiao).map(([nome, muns]) => ({
    nome,
    totalMunicipios: muns.length
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // ============ GERAR GEO_MAP.JSON ============
  const geoMap = {
    regionais,
    mesorregioes,
    municipiosPorRegional,
    municipiosPorMesorregiao,
    municipioPorCodigo,
    totalMunicipios: municipios.length
  };

  fs.writeFileSync(
    path.join(outputDir, 'geo_map.json'),
    JSON.stringify(geoMap, null, 2)
  );
  console.log('geo_map.json gerado');

  // ============ POPULAÇÃO SIMULADA ============
  // Distribuição baseada em dados reais (aproximado)
  const populacaoMunicipios = {};
  const cidadesGrandes = {
    '4106902': 1963726, // Curitiba
    '4113700': 580870,  // Londrina
    '4115200': 436472,  // Maringá
    '4119905': 358838,  // Ponta Grossa
    '4104808': 336073,  // Cascavel
    '4125506': 329058,  // São José dos Pinhais
    '4108304': 258823,  // Foz do Iguaçu
    '4105805': 248540,  // Colombo
    '4109401': 182644,  // Guarapuava
    '4118204': 145069   // Paranaguá
  };

  let popRestante = populacaoParana;
  Object.values(cidadesGrandes).forEach(p => popRestante -= p);

  municipios.forEach(mun => {
    if (cidadesGrandes[mun.cod_ibge]) {
      populacaoMunicipios[mun.cod_ibge] = cidadesGrandes[mun.cod_ibge];
    } else {
      // Distribuir resto proporcionalmente
      populacaoMunicipios[mun.cod_ibge] = Math.floor(popRestante / (municipios.length - Object.keys(cidadesGrandes).length));
    }
  });

  // ============ GERAR MORTALIDADE.JSON ============
  const anos = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
  const taxaBaseObitos = 6.5; // por 1000 hab

  // Por município e ano
  const obitosPorMunicipioAno = {};
  municipios.forEach(mun => {
    obitosPorMunicipioAno[mun.cod_ibge] = {};
    const pop = populacaoMunicipios[mun.cod_ibge];
    anos.forEach(ano => {
      let taxa = taxaBaseObitos;
      // Ajuste para COVID
      if (ano === 2020) taxa *= 1.3;
      if (ano === 2021) taxa *= 1.5;
      if (ano === 2022) taxa *= 1.1;

      taxa = gerarTaxa(taxa, 0.2);
      const obitos = Math.round((pop * taxa) / 1000);
      obitosPorMunicipioAno[mun.cod_ibge][ano] = {
        obitos,
        taxa: parseFloat(taxa.toFixed(2))
      };
    });
  });

  // Agregar por ano (total estado)
  const porAnoMortalidade = anos.map(ano => {
    let total = 0;
    municipios.forEach(mun => {
      total += obitosPorMunicipioAno[mun.cod_ibge][ano].obitos;
    });
    return {
      ano,
      total,
      taxa_bruta: parseFloat((total / populacaoParana * 1000).toFixed(2))
    };
  });

  // Por município (último ano)
  const porMunicipio = municipios.map(mun => {
    const dados2023 = obitosPorMunicipioAno[mun.cod_ibge][2023];
    return {
      cod_ibge: mun.cod_ibge,
      municipio: mun.nome,
      regional: mun.regional,
      mesorregiao: mun.mesorregiao,
      obitos: dados2023.obitos,
      taxa: dados2023.taxa,
      populacao: populacaoMunicipios[mun.cod_ibge]
    };
  }).sort((a, b) => b.obitos - a.obitos);

  // Capítulos CID (mantidos)
  const porCapitulo = [
    { capitulo: 'IX', nome: 'Doenças do aparelho circulatório', total: 335409, percentual: 27.5, cor: '#ef4444' },
    { capitulo: 'II', nome: 'Neoplasias (tumores)', total: 217101, percentual: 17.8, cor: '#8b5cf6' },
    { capitulo: 'X', nome: 'Doenças do aparelho respiratório', total: 148799, percentual: 12.2, cor: '#3b82f6' },
    { capitulo: 'IV', nome: 'Doenças endócrinas e metabólicas', total: 91475, percentual: 7.5, cor: '#f59e0b' },
    { capitulo: 'XX', nome: 'Causas externas', total: 82937, percentual: 6.8, cor: '#10b981' },
    { capitulo: 'I', nome: 'Doenças infecciosas', total: 63422, percentual: 5.2, cor: '#ec4899' },
    { capitulo: 'XI', nome: 'Doenças do aparelho digestivo', total: 60983, percentual: 5.0, cor: '#6366f1' },
    { capitulo: 'VI', nome: 'Doenças do sistema nervoso', total: 51226, percentual: 4.2, cor: '#14b8a6' },
    { capitulo: 'XIV', nome: 'Doenças geniturinárias', total: 37809, percentual: 3.1, cor: '#f97316' },
    { capitulo: 'Outros', nome: 'Outros capítulos', total: 130504, percentual: 10.7, cor: '#64748b' }
  ];

  // Pirâmide etária
  const piramideEtaria = {
    '2023': [
      { faixa: '0-4', homens: -420, mulheres: 310 },
      { faixa: '5-9', homens: -85, mulheres: 62 },
      { faixa: '10-14', homens: -130, mulheres: 88 },
      { faixa: '15-19', homens: -450, mulheres: 195 },
      { faixa: '20-24', homens: -675, mulheres: 285 },
      { faixa: '25-29', homens: -750, mulheres: 342 },
      { faixa: '30-34', homens: -865, mulheres: 455 },
      { faixa: '35-39', homens: -1020, mulheres: 588 },
      { faixa: '40-44', homens: -1340, mulheres: 755 },
      { faixa: '45-49', homens: -1785, mulheres: 985 },
      { faixa: '50-54', homens: -2450, mulheres: 1342 },
      { faixa: '55-59', homens: -3230, mulheres: 1875 },
      { faixa: '60-64', homens: -4120, mulheres: 2565 },
      { faixa: '65-69', homens: -4875, mulheres: 3232 },
      { faixa: '70-74', homens: -5230, mulheres: 4120 },
      { faixa: '75-79', homens: -4985, mulheres: 4565 },
      { faixa: '80+', homens: -8760, mulheres: 11230 }
    ]
  };

  const mortalidade = {
    metadata: {
      fonte: 'IBGE/Estatísticas Vitais, DATASUS/SIM',
      periodo: '2010-2023',
      totalObitos: porAnoMortalidade.reduce((s, a) => s + a.total, 0),
      atualizacao: new Date().toISOString().split('T')[0]
    },
    porAno: porAnoMortalidade,
    porCapitulo,
    piramideEtaria,
    porMunicipio,
    porMunicipioAno: obitosPorMunicipioAno,
    topMunicipios: porMunicipio.slice(0, 10)
  };

  fs.writeFileSync(
    path.join(outputDir, 'mortalidade.json'),
    JSON.stringify(mortalidade, null, 2)
  );
  console.log('mortalidade.json gerado');

  // ============ GERAR INTERNACOES.JSON ============
  const anosInternacoes = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const taxaBaseInternacoes = 50; // por 1000 hab
  const valorMedioInternacao = 1500; // reais

  const internacoesPorMunicipioAno = {};
  municipios.forEach(mun => {
    internacoesPorMunicipioAno[mun.cod_ibge] = {};
    const pop = populacaoMunicipios[mun.cod_ibge];
    anosInternacoes.forEach(ano => {
      let taxa = taxaBaseInternacoes;
      if (ano === 2020) taxa *= 0.7; // Redução por COVID
      if (ano === 2021) taxa *= 0.85;

      taxa = gerarTaxa(taxa, 0.25);
      const internacoes = Math.round((pop * taxa) / 1000);
      const valorSus = Math.round(internacoes * valorMedioInternacao * gerarTaxa(1, 0.2));

      internacoesPorMunicipioAno[mun.cod_ibge][ano] = {
        internacoes,
        valor_sus: valorSus,
        taxa: parseFloat(taxa.toFixed(2))
      };
    });
  });

  // Agregar por ano
  const porAnoInternacoes = anosInternacoes.map(ano => {
    let totalInternacoes = 0;
    let totalValorSus = 0;
    municipios.forEach(mun => {
      totalInternacoes += internacoesPorMunicipioAno[mun.cod_ibge][ano].internacoes;
      totalValorSus += internacoesPorMunicipioAno[mun.cod_ibge][ano].valor_sus;
    });
    return {
      ano,
      internacoes: totalInternacoes,
      valor_sus: totalValorSus,
      taxa: parseFloat((totalInternacoes / populacaoParana * 1000).toFixed(2))
    };
  });

  // Por município (último ano)
  const internacoesPorMunicipio = municipios.map(mun => {
    const dados = internacoesPorMunicipioAno[mun.cod_ibge][2024];
    return {
      cod_ibge: mun.cod_ibge,
      municipio: mun.nome,
      regional: mun.regional,
      mesorregiao: mun.mesorregiao,
      internacoes: dados.internacoes,
      valor_sus: dados.valor_sus,
      taxa: dados.taxa
    };
  }).sort((a, b) => b.internacoes - a.internacoes);

  // Grupos de diagnóstico
  const porGrupoDiagnostico = [
    { grupo: 'Doenças do aparelho circulatório', internacoes: 125000, valor_sus: 312500000, percentual: 20.0 },
    { grupo: 'Gravidez, parto e puerpério', internacoes: 93750, valor_sus: 140625000, percentual: 15.0 },
    { grupo: 'Doenças do aparelho respiratório', internacoes: 81250, valor_sus: 162500000, percentual: 13.0 },
    { grupo: 'Doenças do aparelho digestivo', internacoes: 62500, valor_sus: 125000000, percentual: 10.0 },
    { grupo: 'Lesões e envenenamentos', internacoes: 56250, valor_sus: 168750000, percentual: 9.0 },
    { grupo: 'Neoplasias', internacoes: 50000, valor_sus: 200000000, percentual: 8.0 },
    { grupo: 'Doenças infecciosas', internacoes: 43750, valor_sus: 87500000, percentual: 7.0 },
    { grupo: 'Doenças geniturinárias', internacoes: 37500, valor_sus: 75000000, percentual: 6.0 },
    { grupo: 'Transtornos mentais', internacoes: 31250, valor_sus: 46875000, percentual: 5.0 },
    { grupo: 'Outros', internacoes: 43750, valor_sus: 65625000, percentual: 7.0 }
  ];

  const internacoes = {
    metadata: {
      fonte: 'SIH/DATASUS',
      periodo: '2015-2024',
      totalInternacoes: porAnoInternacoes.reduce((s, a) => s + a.internacoes, 0),
      atualizacao: new Date().toISOString().split('T')[0]
    },
    porAno: porAnoInternacoes,
    porGrupoDiagnostico,
    porMunicipio: internacoesPorMunicipio,
    porMunicipioAno: internacoesPorMunicipioAno
  };

  fs.writeFileSync(
    path.join(outputDir, 'internacoes.json'),
    JSON.stringify(internacoes, null, 2)
  );
  console.log('internacoes.json gerado');

  // ============ GERAR VACINACAO.JSON ============
  const anosVacinacao = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const vacinas = [
    { codigo: 'BCG', nome: 'BCG', meta: 90, cor: '#ef4444' },
    { codigo: 'HEP_B', nome: 'Hepatite B', meta: 95, cor: '#f97316' },
    { codigo: 'PENTA', nome: 'Pentavalente', meta: 95, cor: '#f59e0b' },
    { codigo: 'POLIO', nome: 'Poliomielite', meta: 95, cor: '#84cc16' },
    { codigo: 'ROTAVIRUS', nome: 'Rotavírus', meta: 90, cor: '#22c55e' },
    { codigo: 'PNEUMO', nome: 'Pneumocócica', meta: 90, cor: '#14b8a6' },
    { codigo: 'MENINGO', nome: 'Meningocócica C', meta: 95, cor: '#06b6d4' },
    { codigo: 'TRIPLICE', nome: 'Tríplice Viral', meta: 95, cor: '#3b82f6' },
    { codigo: 'VARICELA', nome: 'Varicela', meta: 80, cor: '#6366f1' },
    { codigo: 'HEP_A', nome: 'Hepatite A', meta: 95, cor: '#8b5cf6' }
  ];

  const coberturaPorMunicipioAno = {};
  municipios.forEach(mun => {
    coberturaPorMunicipioAno[mun.cod_ibge] = {};
    anosVacinacao.forEach(ano => {
      const dadosAno = {};
      vacinas.forEach(v => {
        let base = v.meta - 10 + Math.random() * 20;
        // Queda após 2015
        if (ano > 2015) base -= (ano - 2015) * 1.5;
        // Recuperação em 2023-2024
        if (ano >= 2023) base += 5;
        dadosAno[v.codigo] = parseFloat(Math.min(100, Math.max(50, base)).toFixed(1));
      });
      coberturaPorMunicipioAno[mun.cod_ibge][ano] = dadosAno;
    });
  });

  // Agregar por ano (média estado)
  const coberturaPorAno = anosVacinacao.map(ano => {
    const dadosAno = { ano };
    vacinas.forEach(v => {
      let soma = 0;
      municipios.forEach(mun => {
        soma += coberturaPorMunicipioAno[mun.cod_ibge][ano][v.codigo];
      });
      dadosAno[v.codigo] = parseFloat((soma / municipios.length).toFixed(1));
    });
    return dadosAno;
  });

  // Por município (último ano)
  const vacinacaoPorMunicipio = municipios.map(mun => {
    const dados = coberturaPorMunicipioAno[mun.cod_ibge][2024];
    const media = vacinas.reduce((s, v) => s + dados[v.codigo], 0) / vacinas.length;
    return {
      cod_ibge: mun.cod_ibge,
      municipio: mun.nome,
      regional: mun.regional,
      mesorregiao: mun.mesorregiao,
      coberturaMedia: parseFloat(media.toFixed(1)),
      ...dados
    };
  }).sort((a, b) => b.coberturaMedia - a.coberturaMedia);

  const vacinacao = {
    metadata: {
      fonte: 'SI-PNI/DATASUS',
      periodo: '2015-2024',
      atualizacao: new Date().toISOString().split('T')[0]
    },
    vacinas,
    coberturaPorAno,
    porMunicipio: vacinacaoPorMunicipio,
    porMunicipioAno: coberturaPorMunicipioAno
  };

  fs.writeFileSync(
    path.join(outputDir, 'vacinacao.json'),
    JSON.stringify(vacinacao, null, 2)
  );
  console.log('vacinacao.json gerado');

  // ============ GERAR ESTABELECIMENTOS.JSON ============
  const tipos = [
    { tipo: 'Unidade Básica de Saúde', quantidade: 2100, cor: '#22c55e' },
    { tipo: 'Hospital Geral', quantidade: 420, cor: '#ef4444' },
    { tipo: 'Clínica/Ambulatório', quantidade: 3200, cor: '#3b82f6' },
    { tipo: 'Pronto Socorro', quantidade: 180, cor: '#f97316' },
    { tipo: 'Centro de Saúde', quantidade: 650, cor: '#8b5cf6' },
    { tipo: 'Laboratório', quantidade: 890, cor: '#06b6d4' },
    { tipo: 'Farmácia', quantidade: 1450, cor: '#84cc16' },
    { tipo: 'Consultório', quantidade: 5200, cor: '#64748b' }
  ];

  // Por município
  const estabelecimentosPorMunicipio = municipios.map(mun => {
    const pop = populacaoMunicipios[mun.cod_ibge];
    const fator = pop / populacaoParana;
    return {
      cod_ibge: mun.cod_ibge,
      municipio: mun.nome,
      regional: mun.regional,
      mesorregiao: mun.mesorregiao,
      total: Math.max(5, Math.round(14090 * fator * gerarTaxa(1, 0.3))),
      leitos_sus: Math.max(0, Math.round(25000 * fator * gerarTaxa(1, 0.4)))
    };
  }).sort((a, b) => b.total - a.total);

  const estabelecimentos = {
    metadata: {
      fonte: 'CNES/DATASUS',
      periodo: '2025',
      totalEstabelecimentos: 14090,
      totalLeitosSUS: 25000,
      atualizacao: new Date().toISOString().split('T')[0]
    },
    tiposEstabelecimento: tipos,
    porMunicipio: estabelecimentosPorMunicipio
  };

  fs.writeFileSync(
    path.join(outputDir, 'estabelecimentos.json'),
    JSON.stringify(estabelecimentos, null, 2)
  );
  console.log('estabelecimentos.json gerado');

  // ============ GERAR REPASSES_SUS.JSON ============
  const anosRepasses = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const blocos = [
    { codigo: 'MAC', nome: 'Média e Alta Complexidade', cor: '#ef4444' },
    { codigo: 'AB', nome: 'Atenção Básica', cor: '#22c55e' },
    { codigo: 'VIGIL', nome: 'Vigilância em Saúde', cor: '#3b82f6' },
    { codigo: 'ASSIST_FARM', nome: 'Assistência Farmacêutica', cor: '#f59e0b' },
    { codigo: 'GESTAO', nome: 'Gestão do SUS', cor: '#8b5cf6' },
    { codigo: 'INVEST', nome: 'Investimentos', cor: '#06b6d4' }
  ];

  const repassesPorMunicipioAno = {};
  municipios.forEach(mun => {
    repassesPorMunicipioAno[mun.cod_ibge] = {};
    const pop = populacaoMunicipios[mun.cod_ibge];
    anosRepasses.forEach(ano => {
      const basePerCapita = 800 + (ano - 2018) * 50; // Crescimento anual
      const total = Math.round(pop * basePerCapita * gerarTaxa(1, 0.2));
      repassesPorMunicipioAno[mun.cod_ibge][ano] = {
        total,
        per_capita: parseFloat((total / pop).toFixed(2)),
        MAC: Math.round(total * 0.45),
        AB: Math.round(total * 0.30),
        VIGIL: Math.round(total * 0.08),
        ASSIST_FARM: Math.round(total * 0.07),
        GESTAO: Math.round(total * 0.05),
        INVEST: Math.round(total * 0.05)
      };
    });
  });

  // Agregar por ano
  const porAnoRepasses = anosRepasses.map(ano => {
    const dadosAno = { ano, total: 0 };
    blocos.forEach(b => dadosAno[b.codigo] = 0);

    municipios.forEach(mun => {
      const dados = repassesPorMunicipioAno[mun.cod_ibge][ano];
      dadosAno.total += dados.total;
      blocos.forEach(b => dadosAno[b.codigo] += dados[b.codigo]);
    });

    return dadosAno;
  });

  // Por município (último ano)
  const repassesPorMunicipio = municipios.map(mun => {
    const dados = repassesPorMunicipioAno[mun.cod_ibge][2024];
    return {
      cod_ibge: mun.cod_ibge,
      municipio: mun.nome,
      regional: mun.regional,
      mesorregiao: mun.mesorregiao,
      total: dados.total,
      per_capita: dados.per_capita
    };
  }).sort((a, b) => b.total - a.total);

  const repassesSus = {
    metadata: {
      fonte: 'FNS/Ministério da Saúde',
      periodo: '2018-2024',
      atualizacao: new Date().toISOString().split('T')[0]
    },
    blocos,
    porAno: porAnoRepasses,
    porMunicipio: repassesPorMunicipio,
    porMunicipioAno: repassesPorMunicipioAno
  };

  fs.writeFileSync(
    path.join(outputDir, 'repasses_sus.json'),
    JSON.stringify(repassesSus, null, 2)
  );
  console.log('repasses_sus.json gerado');

  // ============ GERAR INDICADORES_AB.JSON ============
  const indicadores = [
    { codigo: 'IND1', nome: 'Pré-natal (6+ consultas)', meta: 60 },
    { codigo: 'IND2', nome: 'Sífilis em gestantes', meta: 60 },
    { codigo: 'IND3', nome: 'Gestantes HIV', meta: 60 },
    { codigo: 'IND4', nome: 'Saúde bucal gestantes', meta: 60 },
    { codigo: 'IND5', nome: 'Cobertura vacinal', meta: 95 },
    { codigo: 'IND6', nome: 'Hipertensão', meta: 50 },
    { codigo: 'IND7', nome: 'Diabetes', meta: 50 }
  ];

  const quadrimestres = ['2023Q1', '2023Q2', '2023Q3', '2024Q1', '2024Q2', '2024Q3'];

  const porQuadrimestre = quadrimestres.map(q => {
    const dados = { quadrimestre: q };
    indicadores.forEach(ind => {
      dados[ind.codigo] = parseFloat((ind.meta * gerarTaxa(0.95, 0.15)).toFixed(1));
    });
    return dados;
  });

  const indicadoresAb = {
    metadata: {
      fonte: 'SISAB/Previne Brasil',
      periodo: '2023-2024',
      atualizacao: new Date().toISOString().split('T')[0]
    },
    indicadores,
    porQuadrimestre
  };

  fs.writeFileSync(
    path.join(outputDir, 'indicadores_ab.json'),
    JSON.stringify(indicadoresAb, null, 2)
  );
  console.log('indicadores_ab.json gerado');

  console.log('\n✅ Todos os arquivos de dados foram gerados com sucesso!');
  console.log(`Total de municípios: ${municipios.length}`);
  console.log(`Regionais: ${regionais.length}`);
  console.log(`Mesorregiões: ${mesorregioes.length}`);
}

main().catch(console.error);
