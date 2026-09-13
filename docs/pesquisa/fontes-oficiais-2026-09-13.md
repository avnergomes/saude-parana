# Fontes oficiais de dados de saúde para o Paraná: verificação de endpoints (2026-09-13)

Contexto: dashboard estático "Saúde Paraná" (React + GitHub Pages), dados gerados por scripts Python em GitHub Actions (ubuntu, 30 min, sem secrets além do GITHUB_TOKEN), granularidade = 399 municípios (IBGE 7 dígitos) agrupados em 23 regionais IDR. Fontes atuais: SIDRA 2654, 2609, 6579.

Método: cada endpoint foi de fato chamado hoje (WebFetch, curl.exe, FTP via curl, Python local). Os códigos HTTP, tamanhos e tempos abaixo são os observados em 2026-09-13. Sites DATASUS mudam com frequência; os itens "verificado" foram testados com resposta real, os itens "não verificado" são inferências e estão marcados.

Legenda de veredito: **Adotar agora** (funciona hoje, cabe no job, sem secrets) / **Adotar depois** (funciona mas exige mudança de infra, ou instável) / **Rejeitar** (não scriptável, morto, ou desproporcional).

---

## Resumo executivo

| # | Fonte | Veredito | Acesso | Granularidade | Cadência |
|---|-------|----------|--------|---------------|----------|
| A1 | CNES bulk CSV (Portal Dados Abertos SUS, S3) | **Adotar agora** | HTTPS zip 56 MB | CNES + CO_IBGE (6 díg.) + lat/long | diária |
| A2 | CNES API DEMAS `/cnes/estabelecimentos` | Adotar depois | REST JSON, 20/pág. | CNES + município + lat/long | diária |
| A3 | Hospitais e Leitos (S3 `Leitos_csv_2026.zip`) | **Adotar agora** | HTTPS zip 3,6 MB | CNES/município, leitos SUS/não SUS | mensal |
| A4 | CNES FTP DBC (ST/LT/PF/EQ) | Adotar depois | FTP DBC | CNES/município | mensal |
| A5 | `BASE_DE_DADOS_CNES_AAAAMM.ZIP` (735 MB) | Rejeitar | FTP zip | tudo | mensal |
| B1 | SIM DBC `DOPR*.dbc` (FTP) | **Adotar agora** | FTP DBC 7-8 MB/ano | microdado: mun. residência + CID-10 | anual + prelim. mensal |
| B2 | SIM/SINASC CSV nacional (S3) | Adotar depois | HTTPS zip 56-98 MB | microdado nacional | anual |
| B3 | TabNet SIM (POST `tabcgi.exe`) | **Adotar agora** | HTTP POST -> CSV | município x cap. CID-10 | anual (2026 prelim.) |
| B4 | SINASC DBC `DNPR*.dbc` (FTP) | **Adotar agora** | FTP DBC 6-7 MB/ano | microdado: mun. residência mãe | anual + prelim. |
| B5 | pysus 2.11.2 | Adotar depois | pip, FTP/S3 mirror | idem | - |
| C1 | SIH TabNet `sih/cnv/nrpr.def` (POST) | **Adotar agora** | HTTP POST -> CSV | mun. residência x cap. CID-10 | mensal (Jul/2026) |
| C2 | SIH DBC `RDPR2607.dbc` | Adotar depois | FTP DBC 7,3 MB/mês | microdado AIH | mensal |
| D1 | PNI TabNet legado 1994-2022 (POST `webtabx.exe`) | Adotar agora (histórico) | HTTP POST | município x imunobiológico | encerrado em 2022 |
| D2 | API `/vacinacao/doses-aplicadas-pni-2026` | Rejeitar | REST, 1000/pág. | registro individual (pseudonimizado) | diária |
| D3 | CSV mensal doses PNI (S3, 2,16 GB) | Rejeitar | HTTPS zip | registro individual | mensal |
| D4 | Painel Cobertura Vacinal RNDS (infoms, Qlik) | Rejeitar (por ora) | Qlik Sense mashup | município | contínua |
| E1 | relatorioaps-prd `/cobertura/aps` (backend do e-Gestor) | **Adotar agora** | REST JSON não documentado | município, competência mensal | mensal |
| E2 | SISAB indicadores | Rejeitar (hoje) | HTTP 500 | - | - |
| F1 | SIOPS TabNet `mIndicadores.def` | **Adotar agora** | HTTP POST | município x indicador | anual (2025) |
| F2 | SIOPS API `siops-consulta-publica-api` | Rejeitar | 404 | - | - |
| F3 | FNS (consultafns / dados.gov.br) | Adotar depois | dados.gov.br exige API key | município | - |
| G1 | dados.pr.gov.br (novo portal PR) | Rejeitar | página institucional, sem CKAN | - | - |
| G2 | IPARDES BDEweb | Adotar depois | sem resposta hoje | município | - |
| G3 | SESA-PR boletins dengue | Rejeitar (automação) | PDF semanal | município (em PDF) | semanal |
| H1 | InfoDengue `alertcity` | **Adotar agora** | REST JSON/CSV | município x semana epid. | semanal |
| H2 | API `/arboviroses/dengue` + `DENGBR26.csv.zip` | Adotar depois | REST/CSV, microdado | notificação individual | contínua |
| I1 | SIDRA 4714 (Censo 2022, N6) | **Adotar agora** | REST JSON | município | 2022 |
| I2 | SIDRA 202 (Censos 1970-2010, N6) | **Adotar agora** | REST JSON | município | 2010 |
| I3 | SIDRA 9514 (Censo 2022 sexo x idade) | Adotar depois | REST JSON | município | 2022 |
| J1 | ANS `pda-047-taxa_cobertura.csv` | **Adotar agora** | HTTPS CSV 20 MB | município x sexo x faixa | anual/mensal |
| J2 | ANS `pda-024-icb-PR-2026_07.zip` | Adotar depois | HTTPS zip 26 MB | município (PR) | mensal |
| K | Base dos Dados (BigQuery) | Adotar depois | BigQuery, exige credencial GCP | município | variável |
| X1 | DEMAS `/macrorregiao-e-regiao-de-saude/municipio` | **Adotar agora** | REST JSON (860/pág.) | município -> RS/macro | estática |
| X2 | SRAG/SIVEP-Gripe parquet (S3) | Adotar depois | HTTPS parquet 2,8 MB | notificação individual | semanal |
| X3 | TabNet SESA-PR (`tabnet.sesa.pr.gov.br`) | Rejeitar | sem resposta | - | - |

---

## A. CNES

### A1. Bulk CSV do Portal de Dados Abertos do SUS (S3): ADOTAR AGORA
- Owner: Ministério da Saúde / DATASUS (dataset "CNES - Cadastro Nacional de Estabelecimentos de Saúde").
- Página: https://dadosabertos.saude.gov.br/dataset/cnes-cadastro-nacional-de-estabelecimentos-de-saude (atualização "diária", último update 12/09/2026, licença CC BY-ND 3.0).
- Endpoint: `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip` (também `_json.zip` 67,8 MB e `_xml.zip`).
- Verificado hoje: HTTP 200, 56,2 MB (zip) contendo `cnes_estabelecimentos.csv` de 230 MB; download em 42 s; 635.786 linhas nacionais; **43.725 linhas com CO_UF=41; 40.673 delas com NU_LATITUDE preenchida**. Separador `;`, UTF-8, `Last-Modified: 12 Sep 2026`.
- Colunas (36): `CO_CNES; CO_UNIDADE; CO_UF; CO_IBGE (6 dígitos, ex. 412770); NU_CNPJ_MANTENEDORA; NO_RAZAO_SOCIAL; NO_FANTASIA; CO/DS_NATUREZA_ORGANIZACAO; TP_GESTAO; CO/DS_NIVEL_HIERARQUIA; CO/DS_ESFERA_ADMINISTRATIVA; CO_ATIVIDADE; TP_UNIDADE; CO_CEP; NO_LOGRADOURO; NU_ENDERECO; NO_BAIRRO; NU_TELEFONE; NU_LATITUDE; NU_LONGITUDE; CO/DS_TURNO_ATENDIMENTO; NU_CNPJ; NO_EMAIL; CO_NATUREZA_JUR; ST_CENTRO_CIRURGICO; ST_CENTRO_OBSTETRICO; ST_CENTRO_NEONATAL; ST_ATEND_HOSPITALAR; ST_SERVICO_APOIO; ST_ATEND_AMBULATORIAL; CO_MOTIVO_DESAB; CO_AMBULATORIAL_SUS`.
- Granularidade: estabelecimento (CNES) com município (6 dígitos IBGE, converter para 7 com dígito verificador) e lat/long. Inclui estabelecimentos desativados (`CO_MOTIVO_DESAB` preenchido), filtrar.
- LGPD: cadastro de pessoa jurídica, mas consultórios individuais trazem nome do profissional como razão social + e-mail/telefone pessoais (ex.: registro "RENATO DA SILVA FREITAS", gmail). Descartar `NO_EMAIL`, `NU_TELEFONE` e não publicar razão social de pessoa física; publicar agregados por município/tipo de unidade e, no mapa, apenas estabelecimentos públicos/SUS.
- Feasibility: 45 s de download + ~20 s de parsing em pandas. Cabe folgado.
- Veredito: **Adotar agora**, substitui 2.000+ chamadas da API paginada.

### A2. API DEMAS `/cnes/estabelecimentos`: ADOTAR DEPOIS (fallback)
- Owner: MS/SEIDIGI/DEMAS. Docs Swagger: https://apidadosabertos.saude.gov.br/v1/ carrega `https://apidadosabertos.saude.gov.br/static/swagger.json` (versão 1.8.32, licença MIT, sem esquema de auth).
- Endpoint verificado: `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_uf=41&limit=20&offset=0` -> HTTP 200 em 0,4-0,5 s. Parâmetros: `codigo_tipo_unidade, codigo_uf, codigo_municipio, status (0|1), estabelecimento_possui_centro_cirurgico, estabelecimento_possui_centro_obstetrico, data_atualizacao, limit (máx. 20), offset`.
- Campos: inclui `latitude_estabelecimento_decimo_grau`, `longitude_estabelecimento_decimo_grau`, `codigo_municipio` (6 dígitos), `codigo_tipo_unidade`, `estabelecimento_faz_atendimento_ambulatorial_sus`, `codigo_motivo_desabilitacao_estabelecimento`, `data_atualizacao`.
- Limites: `limit=100` devolve silenciosamente 20. Sem campo de total. Sondagem por offset: 40.000 ainda devolve registros, 50.000 devolve `[]` -> 40-50 mil registros para o PR (≈2.000-2.500 páginas ≈ 15-20 min). `status=1` em offset 30.000 ainda retorna dados.
- Endpoints inexistentes (404): `/cnes/leitos`, `/cnes/equipes`, `/cnes/profissionais`. Só existem `/cnes/tipounidades`, `/cnes/estabelecimentos`, `/cnes/estabelecimentos/{codigo_cnes}`.
- `/assistencia-a-saude/hospitais-e-leitos?uf=PR` -> **HTTP 500** hoje.
- Veredito: Adotar depois, só como consulta pontual por CNES ou fallback se o zip S3 falhar.

### A3. Hospitais e Leitos (S3): ADOTAR AGORA
- Página: https://dadosabertos.saude.gov.br/dataset/hospitais-e-leitos (CGHID/MS; atualização mensal; 2007-2026; último update 20/08/2026; CC BY-ND 3.0; dicionário PDF `Leitos_SUS/Dicionário_Leito_hospitalar.pdf`).
- Endpoint verificado: `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/Leitos_SUS/Leitos_csv_2026.zip` -> HTTP 200, 3,6 MB. Padrão por ano: `Leitos_csv_2025.zip`, JSON em `Leitos_SUS/json/Leitos_json_2026.zip`.
- Colunas não inspecionadas hoje (dicionário disponível); a descrição oficial cobre "leitos gerais e complementares" por estabelecimento com UF/município.
- Veredito: **Adotar agora** para leitos SUS/não SUS por município.

### A4. CNES FTP DBC: ADOTAR DEPOIS
- `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/ST/STPR2607.dbc` (1,58 MB), `LT/LTPR2607.dbc` (39 KB, leitos), `PF/PFPR2607.dbc` (19,9 MB, profissionais, contém CNS, dado pessoal), `EQ/EQPR2607.dbc` (0,66 MB, equipes). Último mês publicado: 2607 (Jul/2026). Listagem FTP respondeu em <1 s hoje.
- ST não traz lat/long. Útil para série histórica mensal de leitos (LT) e equipes (EQ).

### A5. `BASE_DE_DADOS_CNES_202607.ZIP`: REJEITAR
- `ftp://ftp.datasus.gov.br/cnes/BASE_DE_DADOS_CNES_202607.ZIP` -> 734,8 MB. Desproporcional para o job. A página https://cnes.datasus.gov.br/pages/downloads/arquivosBaseDados.jsp é template Angular (lista gerada em JS), não scriptável por HTML.

---

## B. SIM e SINASC

### Portal
- `https://opendatasus.saude.gov.br/dataset/sim` -> **302** para `https://dadosabertos.saude.gov.br/` (portal novo). Os caminhos CKAN `/api/3/action/package_search` e `/api/action/package_search` respondem **404**; os links de download são S3 públicos e podem ser raspados da página do dataset (regex `https://s3[^"]+`).
- Dataset SIM: https://dadosabertos.saude.gov.br/dataset/sim, 146 recursos, 1979-2026, CC BY-ND 3.0, atualizado 31/08/2026; dicionário `SIM/Dicionario_SIM_2025.pdf`.

### B1. SIM DBC por UF (FTP): ADOTAR AGORA
- `ftp://ftp.datasus.gov.br/dissemin/publicos/SIM/CID10/DORES/DOPR2024.dbc` (7,9 MB, final), `DOPR2023.dbc` (7,4 MB); preliminares em `SIM/PRELIM/DORES/DOPR2025.dbc` (7,4 MB) e `DOPR2026.dbc` (2,3 MB). Listagem verificada hoje.
- Granularidade: microdado por óbito com `CODMUNRES` (residência, 6 dígitos), `CODMUNOCOR`, `CAUSABAS` (CID-10 4 dígitos), `DTOBITO`, `IDADE`, `SEXO`, `RACACOR`, `ESC`, `OCUP`, `LOCOCOR`. Permite capítulo CID, óbitos infantis, causas evitáveis, etc.
- Decodificação: `pyreaddbc 2.0.4` (26/05/2026, wheels manylinux cp311-cp313, depende só de `dbfread`) ou `datasus-dbc 0.1.3` (wheels manylinux). Sem compilador.
- LGPD: sem identificadores diretos, mas quase-identificadores (data, idade, município pequeno) -> manter microdado só no runner; publicar agregados com supressão de células pequenas (<5).
- Feasibility: 3 arquivos x 8 MB; FTP passivo funciona do runner Ubuntu (usar `urllib`/`ftplib` com retry; o FTP DATASUS oscila).
- Veredito: **Adotar agora** (com fallback B3).

### B2. CSV nacional (S3): ADOTAR DEPOIS
- `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SIM/csv/DO24OPEN_csv.zip` (93,5 MB), `SIM/csv/Mortalidade_Geral_2025_csv.zip` (55,9 MB, preliminar), `Mortalidade_Geral_2026_csv.zip` (prévia); SINASC: `SINASC/csv/SINASC_2025_csv.zip` (97,7 MB), `SINASC_2026_csv.zip`, históricos `DNBR2001_csv.zip`...
- Vantagem: HTTPS estável (S3), sem DBC. Desvantagem: nacional (10x maior que o DBC do PR).

### B3. TabNet SIM (POST): ADOTAR AGORA
- Form: `http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/obt10pr.def` (HTTP 200; **HTTPS recusa conexão**, usar http). Selects: `Linha`, `Coluna`, `Incremento` (`Óbitos_p/Residênc` | `Óbitos_p/Ocorrênc`), `Arquivos` (`obtpr96.dbf`...`obtpr26.dbf`), filtros `SMunicípio`, `SRegião_de_Saúde_(CIR)`, `SMacrorregião_de_Saúde`.
- POST verificado: `POST http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sim/cnv/obt10pr.def` com body ISO-8859-1 `Linha=Munic%EDpio&Coluna=Cap%EDtulo_CID-10&Incremento=%D3bitos_p%2FResid%EAnc&Arquivos=obtpr24.dbf&formato=table&mostre=Mostra` -> HTTP 200 em 0,45 s, tabela com **399 municípios** e link `HREF=/csv/sim_cnv_obt10pr...csv` (baixar em seguida).
- Colunas disponíveis: Capítulo CID-10, Causa mal definidas, Ano/Mês do óbito, Faixa etária (várias), Sexo, Cor/raça, Escolaridade, Local ocorrência.
- Veredito: **Adotar agora** como caminho principal para agregados prontos (mais leve que DBC) e fallback do FTP.

### B4. SINASC DBC (FTP): ADOTAR AGORA
- `ftp://ftp.datasus.gov.br/dissemin/publicos/SINASC/1996_/Dados/DNRES/DNPR2024.dbc` (6,6 MB); preliminares `SINASC/PRELIM/DNRES/DNPR2025.dbc` (6,95 MB), `DNPR2026.dbc` (2,65 MB). Campos: `CODMUNRES`, `PESO`, `GESTACAO`, `CONSULTAS`, `PARTO`, `IDADEMAE`, `APGAR5`. Permite baixo peso, prematuridade, pré-natal adequado, cesáreas.

### B5. pysus: ADOTAR DEPOIS
- PyPI: 2.11.2 (01/09/2026), Python >=3.11,<3.14 (https://pypi.org/project/pysus/). README/docs (https://pysus.readthedocs.io/en/latest/databases/data-sources.html): quatro origens, FTP DATASUS, dados.gov.br, dadosabertos.saude.gov.br e um **mirror S3/DuckLake em Parquet usado por padrão** (`source="catalog"`; `source="origin"` força o servidor original); retry com backoff e resume por HTTP Range. Sem credenciais.
- Risco: 3 releases em 01/09/2026 e API que mudou de nome de módulos (2.11.0 "split the sources in modules") -> pinar versão. Para o job, baixar o DBC direto + `pyreaddbc` é mais previsível.

---

## C. SIH/SUS

### C1. TabNet SIH (POST): ADOTAR AGORA
- Form: `http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sih/cnv/nrpr.def` ("Morbidade Hospitalar do SUS - por local de residência - Paraná"), HTTP 200. Arquivos mensais `nrpr0801.dbf` (Jan/2008) até `nrpr2607.dbf` (Jul/2026). Linha: Município, Região de Saúde, Capítulo CID-10, Lista Morb CID-10, Faixa etária, Sexo, Estabelecimento, Caráter/Regime. Incremento: Internações, Valor total, Óbitos (e outros).
- POST verificado: `POST http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sih/cnv/nrpr.def` body `Linha=Munic%EDpio&Coluna=Cap%EDtulo_CID-10&Incremento=Interna%E7%F5es&Arquivos=nrpr2607.dbf&formato=table&mostre=Mostra` -> HTTP 200 em 0,41 s, 399 municípios; CSV `http://tabnet.datasus.gov.br/csv/sih_cnv_nrpr...csv` baixado (cabeçalho: `"Município";"Cap 01";...;"Cap 21";"Total"`, ISO-8859-1, `;`).
- Feasibility: 12 POSTs/ano x 3 incrementos ≈ 40 s. **Adotar agora.**

### C2. SIH DBC: ADOTAR DEPOIS
- `ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS/200801_/Dados/RDPR2607.dbc` (7,3 MB); último `RDPR2607`. Campos `MUNIC_RES`, `DIAG_PRINC`, `VAL_TOT`, `DIAS_PERM`, `MORTE`, `IDADE`. ~85 MB/ano. Só se precisar de cortes não disponíveis no TabNet (ex.: CID 3 dígitos x faixa etária x município).

---

## D. Imunização

### D1. TabNet PNI legado (1994-2022): ADOTAR AGORA para histórico
- Form: `http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def` (tabulador "dhdat", nacional; `cpnipr.def` não existe -> filtra-se por UF). Anos: 1994-2022 (último `2022|2022|4`). Filtro `SUnidade da Federação` = `Paraná|41|2`.
- POST verificado: `POST http://tabnet.datasus.gov.br/cgi/webtabx.exe?bd_pni/cpnibr.def` com `Linha=<valor SQL da opção Município>&Coluna=--Não-Ativa--&Incremento=<valor da opção Poliomielite>&PAno=2022|2022|4&SUnidade da Federação=Paraná|41|2&formato=table&mostre=Mostra` (URL-encode ISO-8859-1) -> HTTP 200 em 1,5 s, **399 municípios**. Os `value` das opções são fragmentos SQL longos: copiar do HTML do form em tempo de execução.
- FTP: `PNI/DADOS/CPNIPR94..19.dbf` e `DPNIPR94..19.dbf` (cobertura e doses, DBF, até 2019).
- Quebra metodológica: a partir de 2020 a fonte oficial é a RNDS (registros nominais) com denominadores/regras novos; a série 1994-2022 do TabNet não é comparável à do painel novo. Documentar no dashboard.

### D2/D3. Doses aplicadas PNI 2020-2026 (API e CSV): REJEITAR
- API: `https://apidadosabertos.saude.gov.br/vacinacao/doses-aplicadas-pni-2026?uf_paciente=PR&limit=2` -> HTTP 200 em 0,36 s, mas **registro individual** (`codigo_paciente` hash, `numero_cep_paciente` 5 dígitos, idade, raça, `codigo_municipio_paciente`, vacina, lote, CNES). Limite 1000/página; o PR aplica >1 M doses/mês -> milhares de páginas/mês.
- CSV: `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/PNI/csv/vacinacao_jul_2026_csv.zip` -> **2.161,8 MB** (um mês, nacional).
- LGPD: microdado pseudonimizado de saúde (dado sensível, art. 5º II). Não baixar no runner.
- Não há dataset agregado de cobertura vacinal no portal (busca "vacina"/"ripsa cobertura": só doses-aplicadas, ESAVI, COVID e RIPSA de outras dimensões).

### D4. Painel Cobertura Vacinal (RNDS, infoms): REJEITAR por ora
- URL: https://infoms.saude.gov.br/extensions/SEIDIGI_DEMAS_VACINACAO_CALENDARIO_NACIONAL_COBERTURA_RESIDENCIA/SEIDIGI_DEMAS_VACINACAO_CALENDARIO_NACIONAL_COBERTURA_RESIDENCIA.html (mashup Qlik Sense; nota metodológica em https://infoms.saude.gov.br/content/Default/NOTA_INFORMATIVA_SOBRE_CV_CALEND%C3%81RIO_NACIONAL.pdf). Exige engine Qlik/WebSocket; não scriptável sem browser headless. Resposta HTTP não capturada hoje.

---

## E. Atenção Primária

### E1. e-Gestor/Relatórios APS: backend `relatorioaps-prd`: ADOTAR AGORA
- `https://egestorab.saude.gov.br/paginas/acessoPublico/relatorios/relCoberturaAPSCadastro.xhtml` -> **302** para `https://relatorioaps.saude.gov.br/` (SPA Angular). No bundle `main.7c96ab61a0fe37c2.js`: `apiUrl="https://relatorioaps-prd.saude.gov.br"` e serviços `/cobertura/aps`, `/cobertura/ab`, `/adesao/...`, `/arquivo/...`. Filtro convertido em `unidadeGeografica, coRegiao, coUf, coMunicipio, coRegiaoSaude, nuCompInicio, nuCompFim`.
- Endpoint verificado: `GET https://relatorioaps-prd.saude.gov.br/cobertura/aps?unidadeGeografica=MUNICIPIO&coUf=41&nuCompInicio=202607&nuCompFim=202607` -> HTTP 200, **398 registros** (231 KB, 6,7 s na 1ª chamada). Campos: `nuComp ("07/2026"), coUfIbge, coMunicipioIbge (6 díg.), noMunicipioAcentuado, coClassificacaoTipologia, nuAnoReferencia, tpOrigemBasePopulacao, qtPopulacao, qtEsf, qtEap30, qtEap20, qtEsfr, qtEcr, qtEapp20/30, qtCadastro*, qtCapacidadeEquipe, qtCobertura` (cobertura potencial da APS, %; título no SPA: "Cobertura Potencial da APS (2021 - atual)", nota técnica SEI 0047071175 NT 02/2025).
- Faixas: `nuCompInicio=202501&nuCompFim=202607` -> 7.570 registros (4,4 MB, 3,4 s); `202401-202412` -> 4.787 registros. Um município ausente em 07/2026 (398 vs 399), checar qual.
- `/cobertura/ab` (série antiga 2007-2020) devolve `[]` para competências 2026 e 500 sem `unidadeGeografica=MUNICIPIO`; não testado com competências <=2020.
- Risco: API não documentada, sem contrato de estabilidade; sem auth/CORS relevante para servidor. Empacotar com fallback e alerta.
- Veredito: **Adotar agora** (indicador de cobertura APS mensal por município).

### E2. SISAB: REJEITAR hoje
- `https://sisab.saude.gov.br/paginas/acessoPublico/relatorio/indicadores/indicadorPainel.xhtml` -> **HTTP 500**. Relatórios SISAB são JSF com ViewState (sessão), não amigáveis a scripts. A página SESA-PR "Indicadores da APS" (https://www.saude.pr.gov.br/Pagina/Indicadores-da-APS) apenas linka e-Gestor e diz que os indicadores de capitação/desempenho por município são de acesso restrito.

---

## F. Financiamento

### F1. SIOPS TabNet: ADOTAR AGORA
- Form: `http://siops-asp.datasus.gov.br/CGI/deftohtm.exe?SIOPS/serhist/municipio/mIndicadores.def` -> HTTP 200; `FORM ACTION="/CGI/tabcgi.exe?SIOPS/serhist/municipio/mIndicadores.def" METHOD=POST`. Arquivos `indmun25.dbf` (2025) ... `indmun20.dbf` e anteriores; Linha `Munic-BR`; filtro `SUF=21` (Paraná).
- Incrementos: `2.1_D.Total_Saúde/Hab`, `3.2_%R.Próprios_em_Saúde-EC_29`, `1.5_%Transf._da_União_p/_(SUS)`, `R.Transf.SUS/Hab`, `D.Pessoal`, subfunções (Atenção Básica, Assist. Hosp. e Ambulat., Vigilância...), `População`.
- POST não executado hoje, mas o engine é o mesmo TabNet (`tabcgi.exe`) verificado em B3/C1. Encoding ISO-8859-1.
- Veredito: **Adotar agora** (despesa per capita e % aplicado em saúde por município, anual).

### F2. SIOPS API: REJEITAR
- `https://siops-consulta-publica-api.saude.gov.br/swagger-ui/`, `/swagger-ui/index.html`, `/v2/api-docs`, `/v3/api-docs` -> 404 (Spring "Not Found"). `https://siops.datasus.gov.br/` -> corpo vazio.

### F3. FNS: ADOTAR DEPOIS
- `https://consultafns.saude.gov.br/` -> 200, app AngularJS/JBoss ("Aguarde", `{{appConfig}}`), sem endpoint público documentado (`/api/`, `/config.json` -> 404). https://portalfns.saude.gov.br/consultas/ é o hub humano.
- dados.gov.br tem "Indicadores sobre Transferências do FNS para municípios" (https://dados.gov.br/dados/conjuntos-dados/transferencias-do-fundo-nacional-de-saude-para-municipios), mas a API (`/api/3/action/package_show` e `/dados/api/publico/...`) responde **401**: exige chave (cadastro gratuito) -> secret no Actions.
- Alternativa sem secret: `R.Transf.SUS` e `%Transf. da União p/ SUS` do SIOPS (F1) cobrem o essencial das transferências federais.

---

## G. Paraná (SESA, dados abertos, IPARDES)

- `www.dadosabertos.pr.gov.br` e `dadosabertos.pr.gov.br` -> **ENOTFOUND** (domínio extinto). O portal atual é https://www.dados.pr.gov.br/ (HTTP 200): página institucional sem CKAN, sem `/dataset`, que delega ao BDEweb do IPARDES. **Rejeitar** como fonte de arquivos.
- IPARDES BDEweb: `https://www.ipardes.pr.gov.br/imp/` -> 404 (página não encontrada); `http://www.ipardes.gov.br/imp/imp.php` e `.../imp/index.php` -> sem resposta (timeout, HTTP 000) hoje. Página descritiva: https://www.ipardes.pr.gov.br/Pagina/Base-de-Dados-do-Estado-BDEweb. **Adotar depois** (revalidar; é o único lugar com Regionais IDR/áreas administrativas estaduais e séries longas).
- SESA-PR dengue: https://www.saude.pr.gov.br/Pagina/Dengue (200) redireciona para https://www.dengue.pr.gov.br/Pagina/Boletins-da-Dengue: Informes Epidemiológicos semanais/quinzenais em **PDF** (nº 26 em 01/09/2026, nº 25 em 18/08, nº 24 em 04/08) com anexos "casos por município" também em PDF, hospedados em `https://www.documentador.pr.gov.br/documentador/pub.do?action=d&uuid=@gtf-escriba-sesa@<UUID>`. Sem CSV/XLS, sem Power BI público na página. **Rejeitar** para automação (parsing de PDF frágil); usar H1.
- `tabnet.sesa.pr.gov.br` (http/https) -> sem resposta. Rejeitar.

---

## H. Arboviroses

### H1. InfoDengue: ADOTAR AGORA
- Owner: Fiocruz (PROCC) + FGV/EMAp, com apoio do MS; fonte SINAN + clima (Mosqlimate/ERA5) + população IBGE; atualização semanal (https://info.dengue.mat.br/informacoes/). Docs: https://info.dengue.mat.br/services/api/doc. Sem licença explícita; pede citação Codeço et al. 2018 (Rev Epidemiol Sante Publique).
- Endpoint verificado: `https://info.dengue.mat.br/api/alertcity?geocode=4106902&disease=dengue&format=json&ew_start=1&ew_end=36&ey_start=2026&ey_end=2026` -> 200, 40 registros semanais; campos `data_iniSE, SE, casos_est, casos_est_min/max, casos, p_rt1, p_inc100k, nivel (1-4), Rt, pop, tempmin/med/max, umid*, receptivo, transmissao, nivel_inc, casprov, casconf, notif_accum_year`. `disease` = dengue | chikungunya | zika; `format=csv` disponível. Geocode = IBGE 7 dígitos.
- Feasibility: 399 chamadas x ~0,5 s ≈ 3-4 min por doença; cachear e buscar só as últimas 8 semanas mensalmente.
- LGPD: agregado semanal por município. Sem risco.

### H2. SINAN dengue (API DEMAS e CSV): ADOTAR DEPOIS
- `https://apidadosabertos.saude.gov.br/arboviroses/dengue?nu_ano=2026&id_municip=410690&limit=2` -> 200 em 1,1 s; **notificação individual** (dt_notific, sem_not, nu_idade_n, cs_sexo, cs_raca, id_mn_resi, classi_fin, evolucao, hospitaliz...), `limit` máx. 1000. CSV nacional por ano: `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SINAN/Dengue/csv/DENGBR26.csv.zip` (2025, 2024, 2023 idem; tamanho não medido). Útil para casos confirmados x prováveis, hospitalizações e óbitos por município; LGPD: agregar no runner.

---

## I. IBGE

- **2654** (`https://servicodados.ibge.gov.br/api/v3/agregados/2654/metadados`): "Óbitos, ocorridos no ano, por mês de ocorrência, natureza do óbito, sexo, idade, local de ocorrência e **lugar de residência do falecido**", Pesquisa Estatísticas do Registro Civil, anual 2003-2024, níveis N1,N2,N3,N6 (município),N7,N8,N9,N13,N14. Variáveis 343 (nº de óbitos) e 1000343 (%). Classificações: **c244 = Mês de ocorrência** (14 cat.: Total, Janeiro...Dezembro, Ignorado), **c1836 = Natureza do óbito** (0 Total, 26877 Natural, 99818 Não natural, 26881 Outra, 26882 Ignorado), **c257 = Local de ocorrência** (0 Total, 5832 Hospital, 5833 Domicílio, 107166 Via pública, 100296 Outro local, 100297 Ignorado), c2 = Sexo (4, 5, 104539 Ignorado), c260 = Idade (81 cat.). **O município na 2654 é o de residência do falecido** (título da tabela), não o do cartório.
- **2609**: "Nascidos vivos, por ano de nascimento, grupos de idade da mãe... e lugar de residência da mãe" (c232 ano de nascimento, c240 idade da mãe, c2 sexo), município = residência da mãe.
- **6579** períodos disponíveis: 2001-2006, 2008-2009, 2011-2021, 2024-2026. Faltam **2007** (Contagem), **2010** (Censo), **2022** (Censo) e **2023** (sem estimativa publicada).
  - 2022: **4714** "População Residente, Área territorial e Densidade demográfica" (Censo 2022, N6, variável 93), verificado. Ex.: `https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/93?localidades=N6[N3[41]]`.
  - 2010 (e 1970-2000): **202** "População residente, por sexo e situação do domicílio" (anual 1970-2010, N6), verificado; 1378 também cobre 2010.
  - 2007: tabela 793 (Contagem 2007), não verificada hoje.
  - 2023: interpolar entre 2022 (Censo) e 2024 (estimativa) e sinalizar.
- **9514**: Censo 2022 por sexo x idade (82 faixas) x forma de declaração, N6, verificado; útil para padronização etária de taxas.
- Licença IBGE: dados abertos, atribuição.

---

## J. ANS

- Raiz: https://dadosabertos.ans.gov.br/FTP/PDA/ (HTTP 200, listagem Apache).
- **Taxa de cobertura**: `https://dadosabertos.ans.gov.br/FTP/PDA/taxa_de_cobertura_de_planos_de_saude-047/pda-047-taxa_cobertura.csv` (20 MB, atualizado 06/09/2026; dicionário `.ods` na mesma pasta). Cabeçalho verificado: `PERIODO;CD_MUNICIPIO;NM_MUNICIPIO;CD_UF;SG_UF;CD_RM;NM_RM;SEXO;FAIXA_ETARIA;BENEF_ASSISTENCIA_MEDICA;BENEF_EXCLUS_ODONTOLOGICO;BENEF_TOTAL;POPULACAO;TX_COBERT_ASSISTENCIA_MEDICA;TX_COBERT_EXCLUSIVAMENTE_ODONTOLOGICO;TX_COBERT_TOTAL` (ISO-8859-1, `;`, decimal com vírgula). Agregado, sem dado pessoal. **Adotar agora.**
- **Beneficiários consolidados por UF**: `https://dadosabertos.ans.gov.br/FTP/PDA/informacoes_consolidadas_de_beneficiarios-024/202607/pda-024-icb-PR-2026_07.zip` (26 MB; pastas mensais 202105-202607; dicionário em `.../dicionario/dicionario-pda-024-informacoes_consolidadas_de_beneficiarios.ods`). Agregado por município/operadora/faixa. Adotar depois (a 047 já dá a taxa).

---

## K. Base dos Dados

- Docs: https://basedosdados.org/docs/access_data_bq, projeto BigQuery `basedosdados`; exige **projeto GCP próprio** (modo Sandbox, sem cartão) e 1 TB/mês grátis; o pacote `basedosdados` pede `billing_project_id` e autenticação OAuth/service account. Em GitHub Actions isso significa um secret (JSON de service account) -> viola a restrição atual.
- Dataset br_ms_sim cobre 1979-2024 (página https://basedosdados.org/dataset/5beeec93-cbf3-43f6-9eea-9bee6a0d1683 carrega via JS; tabelas não listadas no HTML estático).
- Veredito: **Adotar depois**, só se um secret GCP for aceitável; então vira a forma mais limpa de obter SIM/SINASC/SIH/CNES agregados por município em SQL.

---

## Fontes adicionais (3)

### X1. DEMAS `/macrorregiao-e-regiao-de-saude/municipio`: ADOTAR AGORA
- `https://apidadosabertos.saude.gov.br/macrorregiao-e-regiao-de-saude/municipio?sigla_uf=PR&limit=860` -> 200 em 0,3 s. Campos: `codigo_municipio` (6 díg.), `codigo_regiao_saude` (ex. 41018 "18ª RS CORNELIO PROCOPIO"), `codigo_macrorregiao_saude` (4105 NORTE, 4106 NOROESTE, 4107 LESTE, ...), `populacao_estimada_ibge_2022`. `limit` máx. 860 -> uma chamada para o PR. Útil para cruzar Regionais IDR x Regionais de Saúde (SESA).

### X2. SRAG / SIVEP-Gripe (parquet): ADOTAR DEPOIS
- `https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SRAG/2026/INFLUD26-23-03-2026.parquet` -> 200, 2,8 MB (nacional, 2026); 2019-2025 idem; dataset https://dadosabertos.saude.gov.br/dataset/srag-2019-a-2026. Notificação individual (agregar por `CO_MUN_RES`). Nome de arquivo muda a cada publicação (raspar da página).

### X3. TabNet DATASUS como família
- Todos os `.def` do TabNet (`/cgi/tabcgi.exe?...`) aceitam o mesmo POST ISO-8859-1 e devolvem um link `/csv/...csv`: SIM, SINASC (`sinasc/cnv/nvpr.def`), SIH, SIA, CNES (`cnes/cnv/leiintpr.def` etc.), SIOPS. Um único cliente Python serve para todos. Restrições: só HTTP (443 recusado), respostas em ISO-8859-1, servidor com quedas frequentes -> retry + cache dos CSVs no repo.

---

## LGPD: classificação das fontes

| Tipo | Fontes | Tratamento |
|------|--------|------------|
| Agregado oficial (sem dado pessoal) | TabNet (SIM/SIH/SIOPS/PNI), relatorioaps, InfoDengue, ANS 047, IBGE, Leitos, X1 | publicar direto |
| Cadastro de estabelecimentos | CNES CSV/API | descartar e-mail/telefone; não publicar razão social de pessoa física; mapa só de unidades públicas/SUS |
| Microdado pseudonimizado (saúde = dado sensível) | SIM/SINASC/SIH DBC, SINAN dengue, SRAG, PNI doses, CNES PF | processar só no runner, nunca commitar bruto; publicar agregados com supressão de células <5; registrar no inventário (art. 37) a finalidade "estatística/pesquisa" (art. 7º IV / art. 11 II c) |

## Orçamento do job mensal (estimado)
CNES zip 56 MB (45 s) + Leitos 3,6 MB + SIM DBC 3 anos 18 MB + SINASC 3 anos 16 MB + TabNet SIH 12-36 POSTs (~40 s) + TabNet SIM/SIOPS/PNI (~10 s) + relatorioaps 1 GET (~7 s) + InfoDengue 399 GETs (~4 min) + ANS 20 MB + IBGE 4 GETs ≈ **8-10 min**, com folga para retries. Recomenda-se `continue-on-error` por fonte e commit apenas dos arquivos que mudaram.

## Riscos
1. FTP DATASUS e TabNet caem com frequência: implementar retry/backoff e manter o último CSV bom no repo.
2. `relatorioaps-prd` é API interna não documentada: pode mudar sem aviso (monitorar schema).
3. Portal `dadosabertos.saude.gov.br` sem API CKAN: os nomes de arquivo no S3 mudam (ex. SRAG com data no nome); raspar a página do dataset a cada execução.
4. Séries com quebra metodológica: cobertura vacinal (2020+), cobertura APS ("potencial" desde 2021 vs "AB" até 2020), SIM 2025/2026 preliminares.
