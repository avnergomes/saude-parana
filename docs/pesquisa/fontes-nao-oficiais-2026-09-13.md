# Fontes não oficiais / complementares para o dashboard Saúde Paraná

Pesquisa executada em 2026-09-13 (somente leitura: WebFetch, WebSearch e `curl` via PowerShell). Tudo o que está marcado como **verificado** foi obtido por requisição real nesta sessão, com status HTTP anotado. O que não pôde ser verificado está marcado como **não verificado**.

Contexto do projeto: site React estático no GitHub Pages; dados gerados por scripts Python em GitHub Actions (ubuntu, timeout 30 min); granularidade = 399 municípios do PR (código IBGE de 7 dígitos); projeto aberto e não comercial.

Resumo executivo (veredictos):

| Fonte | Veredicto | Motivo em uma linha |
|---|---|---|
| Receita Federal CNPJ (dump mensal) | **Adotar com restrições** | Dado público, filtrável por CNAE 86/4771-7 e UF; publicar só agregados por município; nunca nomes de MEI/sócios/e-mails/telefones. |
| Base dos Dados `br_me_cnpj` (BigQuery) | Adotar com restrições (alternativa ao dump) | Já traz `id_municipio` IBGE; precisa de service account GCP como secret; 1 TiB/mês grátis. |
| minhareceita.org / BrasilAPI (por CNPJ) | Adotar com restrições (só enriquecimento pontual) | Sem busca por CNAE/UF; sem SLA; "não faça crawling". |
| casadosdados (espelho) / cnpj.biz | Espelho: usar só como CDN; cnpj.biz: **Rejeitar** | ToS bloqueados a bots (402/403); raspar agregador comercial só adiciona risco sem ganho. |
| Google Places API (New) | **Rejeitar** para armazenar/republicar | ToS 3.2.3 proíbe cache, "copy and save business names, addresses, or user reviews", point-in-polygon com lat/lng e uso em mapa não Google. |
| Google Places Aggregate API | **Rejeitar** | Contagens (POI Count) só podem ser cacheadas 30 dias e não podem ser publicadas como tal. |
| SerpApi / Outscraper / Apify (raspagem do Google Maps) | **Rejeitar** | Viola ToS do Google, coleta dados pessoais (autores de avaliações), "legal shield" é só EUA e não cobre a republicação. |
| OpenStreetMap (Overpass / Geofabrik) | **Adotar** | ODbL: atribuição + share-alike; agregados e geometrias podem ser publicados sob ODbL. Cobertura parcial (farmácias sub-mapeadas). |
| Wikidata SPARQL | Adotar (enriquecimento menor) | CC0; só 14 hospitais com P31=hospital no PR; útil para links/fotos de grandes hospitais. |
| Overture Maps Places | **Adotar com restrições** | CDLA-Permissive 2.0 (+Apache 2.0 FSQ, CC0); download por bbox com DuckDB/CLI; publicar agregados e entidades organizacionais, não nomes de profissionais. |
| Foursquare OS Places | Adotar com restrições (opcional, redundante com Overture) | Apache 2.0; parquet mensal; filtro `country='BR' AND region='PR'`. |
| CFM / CRM-PR médicos por município | **Rejeitar** | Plataforma "Demografia Médica" respondendo 404 em 2026-09-13; sem tabela aberta; só busca individual. |
| CRF-PR farmácias | **Rejeitar** | Nenhum dado aberto por município; usar CNES/ANVISA (oficiais). |
| Google Trends (pytrends) | Adotar com restrições | pytrends arquivado (2025-04-17), ainda funciona parcialmente; API oficial em alfa fechado; granularidade estadual, não municipal. |
| Notícias SESA-PR / AEN | Adotar com restrições | Sem RSS; AEN sem notícias por restrição eleitoral (Lei 9.504/1997) até após as eleições de 2026; armazenar só título + link. |

---

## 1. Receita Federal, dados abertos do CNPJ

### 1.1 Onde os arquivos estão hoje (o caminho antigo morreu)

- **Verificado**: `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/` responde **HTTP 404** (página "SERPRO+ Página não encontrada"), inclusive `.../2026-08/Estabelecimentos0.zip` e `.../2026-07/...` (HEAD 404). O host virou uma instância Nextcloud ("SERPRO+ Repositório de Arquivos da Receita Federal").
- **Verificado**: a pasta pública é o share Nextcloud `https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9` (link citado pela Casa dos Dados em https://dados-abertos-rf-cnpj.casadosdados.com.br/). Listagem por WebDAV público funciona:
  - `PROPFIND https://arquivos.receitafederal.gov.br/public.php/webdav/` com Basic Auth `YggdBLfdninEJX9:` (token como usuário, senha vazia), header `Depth: 1` → HTTP 207. Pastas: `2023-05` … `2026-08` (40 meses; a raiz soma 334.651.985.810 bytes ≈ 335 GB).
  - Download direto (HEAD **200**, `Content-Length: 2200116910`, `Content-Type: application/zip`):
    `curl -u "YggdBLfdninEJX9:" -O https://arquivos.receitafederal.gov.br/public.php/webdav/2026-08/Estabelecimentos0.zip`
  - O link "share download" sem auth (`/index.php/s/YggdBLfdninEJX9/download?path=%2F2026-08&files=...`) responde 303 → `/public.php/dav/files/YggdBLfdninEJX9/?accept=zip&files=...`; prefira o WebDAV acima, que retorna o zip diretamente.
- **Verificado**: conteúdo da pasta `2026-08` (modificado em 2026-08-09 18:26–18:35 UTC):

| Arquivo | Bytes |
|---|---|
| Estabelecimentos0.zip | 2.200.116.910 |
| Estabelecimentos1..9.zip | 335–369 MB cada (341.753.658; 336.127.884; 367.641.274; 340.246.482; 335.998.993; 368.845.297; 339.985.622; 335.311.452; 369.237.808) |
| **Soma Estabelecimentos0–9** | **5.335.265.380 bytes ≈ 5,34 GB** |
| Empresas0..9.zip | 552,7 MB + 9 × 78–99 MB ≈ 1,37 GB |
| Socios0..9.zip | 242,9 MB + 9 × ~49 MB ≈ 0,69 GB |
| Simples.zip | 302.289.129 |
| Cnaes.zip / Municipios.zip / Motivos / Naturezas / Paises / Qualificacoes | 22 KB / 43 KB / <3 KB cada |
| **Mês completo** | **≈ 7,7 GB compactado** |

- Cadência: mensal (uma pasta `AAAA-MM` por mês; a de agosto foi publicada em 09/08/2026). Referência histórica de tamanho: "Arquivos de 08/05/2021: 4,68 GB compactados e 17,1 GB descompactados" (README de https://github.com/aphonsoar/Receita_Federal_do_Brasil_-_Dados_Publicos_CNPJ).
- Espelho CDN (Cloudflare) não oficial, mesmos arquivos, atualizado mensalmente: https://dados-abertos-rf-cnpj.casadosdados.com.br/ (link `/arquivos`). Útil se o download do host SERPRO for lento a partir de runners nos EUA. Sem checksums oficiais para conferir integridade.

### 1.2 Layout (metadados oficiais)

Fonte: https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf (**verificado**, PDF de 6 páginas, texto extraído). Pontos relevantes:

- Formato: "usar ponto e vírgula (;) como separador de atributos"; codificação Latin-1/ISO-8859-1 (README aphonsoar; confirmar com `encoding='latin-1'` e testar ã/ç/é). Campos vêm entre aspas duplas.
- **ESTABELECIMENTOS**, campos na ordem: CNPJ BÁSICO; CNPJ ORDEM; CNPJ DV; IDENTIFICADOR MATRIZ/FILIAL (1 matriz, 2 filial); NOME FANTASIA; SITUAÇÃO CADASTRAL (01 nula, 2 ativa, 3 suspensa, 4 inapta, 08 baixada); DATA SITUAÇÃO CADASTRAL; MOTIVO; NOME DA CIDADE NO EXTERIOR; PAÍS; DATA DE INÍCIO ATIVIDADE; **CNAE FISCAL PRINCIPAL**; **CNAE FISCAL SECUNDÁRIA** ("cada ocorrência sendo separada por vírgula"); TIPO DE LOGRADOURO; LOGRADOURO; NÚMERO; COMPLEMENTO; BAIRRO; CEP; **UF**; **MUNICÍPIO** ("CÓDIGO DO MUNICÍPIO DE JURISDIÇÃO"); DDD 1; TELEFONE 1; DDD 2; TELEFONE 2; DDD FAX; FAX; CORREIO ELETRÔNICO; SITUAÇÃO ESPECIAL; DATA SITUAÇÃO ESPECIAL.
- **EMPRESAS**: CNPJ BÁSICO; RAZÃO SOCIAL; NATUREZA JURÍDICA; QUALIFICAÇÃO DO RESPONSÁVEL; CAPITAL SOCIAL; PORTE (00/01/03/05); ENTE FEDERATIVO RESPONSÁVEL.
- **SIMPLES**: CNPJ BÁSICO; OPÇÃO PELO SIMPLES; datas; **OPÇÃO PELO MEI** (S/N); datas.
- **SÓCIOS**: identificador (1 PJ, 2 PF, 3 estrangeiro); NOME DO SÓCIO; CNPJ/CPF DO SÓCIO; qualificação; data de entrada; país; CPF DO REPRESENTANTE LEGAL; NOME DO REPRESENTANTE; **FAIXA ETÁRIA** (baseada na data de nascimento do CPF).
- Mascaramento oficial: "O campo ... CNPJ/CPF DO SÓCIO e ... CNPJ/CPF DO REPRESENTANTE ... devem ser descaracterizados ... ocultação dos três primeiros dígitos e dos dois dígitos verificadores, conforme ... art. 129 § 2o da Lei no 13.473/2017". Nada é dito sobre mascarar CPF embutido na razão social de MEI (ver 1.5).
- Sem lat/long, sem horário, sem avaliações. Há CEP + logradouro (geocodificável) e CNAE principal + secundárias.

### 1.3 Código de município: TOM (RFB), não IBGE. Tabela oficial de correspondência

- Confirmação: "O código de município usado pela RFB nos dados abertos é o código TOM e não o IBGE" (issue https://github.com/datasets-br/city-codes/issues/40; dataset TOM em https://dados.gov.br/dados/conjuntos-dados/tabela-de-rgos-e-municpios, para onde https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/orgaos-e-municipios/tom redireciona).
- **Verificado (HTTP 200)**: tabela oficial de correspondência **https://www.gov.br/receitafederal/dados/municipios.csv**, separador `;`, Latin-1, ~3.567 linhas. Cabeçalho:
  `CÓDIGO DO MUNICÍPIO - TOM;CÓDIGO DO MUNICÍPIO - IBGE;MUNICÍPIO - TOM;MUNICÍPIO - IBGE;UF`
  Exemplos PR: `830;4101655;ARAPUÃ;Arapuã;PR`, `832;4101853;ARIRANHA DO IVAÍ;...;PR`, `834;4102752;Bela Vista da Caroba;...;PR`.
- O `Municipios.zip` do dump traz só `CÓDIGO;DESCRIÇÃO` (TOM → nome), sem IBGE; use o `municipios.csv` acima. Validar que os 399 municípios do PR mapeiam 1:1 (há municípios homônimos em outras UFs; sempre cruzar TOM+UF).

### 1.4 Filtro de CNAE (códigos verificados na API do IBGE)

- Divisão 86 "Atividades de atenção à saúde humana", classes (**verificado** em https://servicodados.ibge.gov.br/api/v2/cnae/divisoes/86/classes): 86101 Atividades de atendimento hospitalar; 86216 Serviços móveis de atendimento a urgências; 86224 Serviços de remoção de pacientes; 86305 Atividades de atenção ambulatorial executadas por médicos e odontólogos; 86402 Complementação diagnóstica e terapêutica; 86500 Profissionais da área de saúde, exceto médicos e odontólogos; 86607 Apoio à gestão de saúde; 86909 Atenção à saúde humana não especificadas. Subclasses de cada classe: `https://servicodados.ibge.gov.br/api/v2/cnae/classes/{id}/subclasses`.
- Farmácias (**verificado** em https://servicodados.ibge.gov.br/api/v2/cnae/classes/47717/subclasses): 4771701 sem manipulação de fórmulas; 4771702 com manipulação; 4771703 homeopáticos; **4771704 medicamentos veterinários (excluir)**.
- No dump os códigos vêm com 7 dígitos sem pontuação (ex.: `8610101`), portanto: `cnae_principal[:2] == '86'` ou `cnae_principal[:5] in ('47717',)` com exclusão de `4771704`; repetir para cada item de CNAE secundária (split por vírgula). Decida e documente se conta por CNAE principal apenas (recomendado para "estabelecimentos de saúde") ou principal+secundária (mais inclusivo, mais ruído).
- Opcional: divisão 87 (assistência social com alojamento: ILPIs, clínicas geriátricas, comunidades terapêuticas) se o dashboard quiser cobrir `social_facility`.
- (CONCLA HTML respondeu 403 a bots; a API `servicodados` é a via programática.)

### 1.5 LGPD: o que há de dado pessoal e o que o dashboard NÃO deve publicar

- A base contém dados pessoais evidentes: nomes de sócios PF, CPF mascarado (`***123456**`, ainda é dado pessoal por ser identificável em combinação com o nome), faixa etária de sócios, nome e CPF de representante legal, **e-mail e telefones do contribuinte** (para MEI/EI são pessoais), endereço completo (para MEI é a residência).
- Razão social de MEI frequentemente é "NOME COMPLETO + CPF": o projeto socios-brasil documenta "Para os casos de empresas individuais que constarem o CPF na razão social (como é comum no caso de MEIs), o CPF será deletado" e, por padrão, apaga complemento/logradouro/número/telefones para empreendedores individuais e "Deletada a coluna correio_eletronico, para evitar SPAM" (https://github.com/turicas/socios-brasil, README). Ou seja, os dados abertos da RFB **não** anonimizam esse CPF; quem republica assume o risco.
- Base legal: LGPD (Lei 13.709/2018, https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm; o site respondeu 429/reset nesta sessão, artigos citados de memória) art. 5º I (dado pessoal = informação relacionada a pessoa natural identificada ou identificável), art. 7º §3º (tratamento de dados de acesso público deve considerar finalidade, boa-fé e interesse público que justificaram a disponibilização), art. 7º §4º (dispensa de consentimento para dados tornados manifestamente públicos, resguardados os direitos do titular) e art. 12 (dados anonimizados não são dados pessoais). Agregados por município × classe CNAE são anonimizados; registros individuais não.
- Regras recomendadas para o dashboard:
  1. Publicar **somente agregados**: contagem por município × classe/subclasse CNAE × situação cadastral (ativa/baixada), série mensal, idade média dos estabelecimentos. Nunca publicar o CSV filtrado bruto.
  2. Se listar estabelecimentos nominalmente (ex.: hospitais 8610-1), **excluir natureza jurídica 213-5 (Empresário Individual, inclui MEI)** e qualquer registro com `OPÇÃO PELO MEI = S`; mostrar apenas razão social/nome fantasia de pessoas jurídicas não individuais, sem telefone, sem e-mail, sem sócios.
  3. Nunca carregar `Socios*.zip` no pipeline (não é necessário e concentra o risco).
  4. Guardar registro da finalidade (interesse público em saúde) no README (art. 37 LGPD, registro de operações).
- Licença: o site da RFB publica conteúdo sob "Creative Commons Atribuição-SemDerivações 3.0 Não Adaptada" (https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos), que é a licença do **site**, não necessariamente dos datasets; a página do dataset em dados.gov.br é SPA (API respondeu 401 sem chave). Dados cadastrais públicos do CNPJ são de acesso público por lei (LAI + art. 129 Lei 13.473/2017); republicar agregados é prática consolidada (Base dos Dados, casadosdados, BrasilAPI). Cite "Fonte: Receita Federal do Brasil, Dados Abertos do CNPJ, competência AAAA-MM".

### 1.6 Viabilidade no GitHub Actions (30 min)

- Só é necessário `Estabelecimentos0–9.zip` (5,34 GB) + `Empresas*.zip` (1,37 GB) se quiser natureza jurídica/porte, + `Simples.zip` (0,30 GB) para a flag MEI. `Socios*` não.
- Estratégia que cabe em 30 min: **matrix job com 10 jobs paralelos** (um por `EstabelecimentosN.zip`), cada um faz `curl -u "YggdBLfdninEJX9:" ... | busybox unzip -p` (ou `unzip -p`) e filtra `LC_ALL=C grep -F ';"PR";'` em streaming (sem descompactar em disco; runner tem ~14 GB livres), produzindo um CSV de PR (~poucas centenas de MB) enviado como artifact; um job final agrega com pandas/DuckDB, cruza `municipios.csv` (TOM→IBGE) e grava JSON. Estimativa: download de 2,2 GB a 20–50 MB/s = 1–2 min; unzip+grep ~1–3 min por arquivo. Tempo total por job < 10 min. Validar UTF-8/Latin-1 (ã, ç, é) no output.
- Alternativa sem download pesado: **Base dos Dados** (1.7). Alternativa de download mais rápido: espelho casadosdados (CDN).
- Cadência: rodar 1× por mês após o dia 10 (dumps saem no início do mês); detectar a pasta mais recente via PROPFIND.

### 1.7 Alternativas que evitam o download de 5+ GB

| Alternativa | O que oferece | Custo/auth | Limitações | Veredicto |
|---|---|---|---|---|
| **Base dos Dados `basedosdados.br_me_cnpj.estabelecimentos`** (BigQuery) | Colunas verificadas no schema (https://raw.githubusercontent.com/basedosdados/queries-basedosdados/main/models/br_me_cnpj/schema.yml): `data, cnpj, cnpj_basico, ..., cnae_fiscal_principal, cnae_fiscal_secundaria, sigla_uf, id_municipio` ("ID Município - IBGE 7 Dígitos"), `id_municipio_rf`, `situacao_cadastral`, `cep`, `bairro`, e-mail/telefones. Já resolve TOM→IBGE. | Projeto GCP (sandbox sem cartão; "1 TiB of processed query data each month", "10 GiB of storage", tabelas expiram em 60 dias: https://docs.cloud.google.com/bigquery/docs/sandbox). No Actions: service account JSON como secret + `google-cloud-bigquery`. | Página do dataset é JS (não consegui verificar atraso de atualização nem tamanho). Query deve filtrar `data = (SELECT MAX(data) ...)` e `sigla_uf='PR'` e selecionar poucas colunas para ficar em poucos GB varridos. | Adotar com restrições (melhor custo/benefício se o secret for aceitável). |
| **minhareceita.org** | `GET https://minhareceita.org/{cnpj}` (JSON completo do CNPJ, incl. QSA). Docs: https://docs.minhareceita.org/. Código MIT (https://codeberg.org/cuducos/minha-receita, movido do GitHub). | Gratuito; "A API web não tem nenhuma garantia de nível de serviço" (docs). Self-host exige "cerca de 180 GB disponíveis de espaço em disco" (https://docs.minhareceita.org/servidor/instalacao/). | Sem busca por CNAE/UF; sem dump pronto. Docs `/api/` bloqueadas a bots (403). | Só para enriquecer CNPJs específicos. |
| **BrasilAPI `/api/cnpj/v1/{cnpj}`** | **Verificado** com 33000167000101: retorna `cnae_fiscal`, `cnaes_secundarios`, `codigo_municipio` (TOM, ex. 6001), `codigo_municipio_ibge` (3304557), `uf`, `qsa` (nomes de sócios + CPF parcial), `situacao_cadastral`. | Gratuito; README: "por favor não utilize formas automatizadas para fazer 'crawling' dos dados da API"; "Estamos em beta e ainda elaborando os Termos de Uso" (https://raw.githubusercontent.com/BrasilAPI/BrasilAPI/main/README.md). | Sem listagem por CNAE/UF; consulta por CNPJ apenas. Não armazenar `qsa`. | Enriquecimento pontual apenas. |
| **casadosdados** | Espelho dos zips (acima). API comercial de busca por CNAE/UF existe no site principal. | ToS/pricing: https://casadosdados.com.br/termos-de-uso respondeu **403** a bots; robots.txt só bloqueia `/cdn-cgi/`. | Não avaliável; comercial. | Usar só o espelho de arquivos. |
| **cnpj.biz** | Páginas HTML por CNPJ/CNAE/cidade. | ToS em https://cnpj.biz/termos-de-uso respondeu **402** (desafio Cloudflare); robots.txt permite `/` mas bloqueia bots específicos. | Raspagem de agregador comercial; dados são os mesmos da RFB. | **Rejeitar**. |

---

## 2. Google Maps Platform, Places API (New)

### 2.1 Preço (tabela oficial, verificada em https://developers.google.com/maps/billing-and-pricing/pricing, HTTP 200)

Colunas: SKU | **Free Usage Cap (chamadas/mês por SKU)** | 0–100k | 100k–500k | 500k–1M | 1M–5M | 5M+ (USD por 1.000 chamadas). O crédito mensal de US$ 200 foi substituído por um teto gratuito por SKU (Essentials 10.000 / Pro 5.000 / Enterprise 1.000).

| SKU | Grátis/mês | 0–100k | 100k–500k |
|---|---|---|---|
| Places API Text Search Essentials (IDs Only) | Ilimitado | $0 | $0 |
| Places API Text Search Pro | 5.000 | **$32,00** | $25,60 |
| Places API Text Search Enterprise | 1.000 | $35,00 | $28,00 |
| Text Search Enterprise + Atmosphere | 1.000 | $40,00 | $32,00 |
| Places API Nearby Search Pro | 5.000 | $32,00 | $25,60 |
| Places API Nearby Search Enterprise | 1.000 | $35,00 | $28,00 |
| Nearby Search Enterprise + Atmosphere | 1.000 | $40,00 | $32,00 |
| Place Details Essentials (IDs Only) | Ilimitado | $0 | $0 |
| Places API Place Details Essentials | 10.000 | $5,00 | $4,00 |
| Places API Place Details Pro | 5.000 | $17,00 | $13,60 |
| Places API Place Details Enterprise | 1.000 | $20,00 | $16,00 |
| Places Aggregate API | 5.000 | $10,00 | $8,00 |

Campos por SKU (Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search): Essentials = `id, name, attributions`; **Pro** = `displayName, formattedAddress, location`; **Enterprise** = `rating, userRatingCount, websiteUri` (+ telefones e horários no Nearby); **Enterprise + Atmosphere** = `reviews`. Text Search: `pageSize` 1–20, "returns a maximum of 60 results across all pages"; `includedType` (um só, ex. `pharmacy`); `locationRestriction` retângulo ou círculo (raio ≤ 50.000 m); `regionCode` (`br`). Nearby Search: `maxResultCount` 1–20, sem paginação, até 50 tipos (https://developers.google.com/maps/documentation/places/web-service/nearby-search).

Estimativa de volume para o PR (se fosse usado): 399 municípios × 4 tipos = 1.596 Text Search Pro (≤ 60 resultados cada) + grade de Nearby Search para Curitiba/Londrina/Maringá (~1–2 mil) → dentro do teto gratuito de 5.000 Pro. Ratings exigem Enterprise (1.000 grátis, depois $35/1k). Custo não é o problema; **a licença é**.

### 2.2 Termos (verificados por download do HTML e grep)

Google Maps Platform Terms of Service, https://cloud.google.com/maps-platform/terms, seção **3.2.3 Restrictions Against Misusing the Services** (texto literal):

- (a) **No Scraping.** "Customer will not export, extract, or otherwise scrape Google Maps Content for use outside the Services. For example, Customer will not: (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services; (ii) bulk download Google Maps tiles, Street View images, geocodes, directions, distance matrix results, roads information, places information, elevation values, and time zone details; (iii) **copy and save business names, addresses, or user reviews**; or (iv) use Google Maps Content with text-to-speech services."
- (b) **No Caching.** "Customer will not cache Google Maps Content except as expressly permitted under the Maps Service Specific Terms."
- (c) **No Creating Content From Google Maps Content.** "... (iv) **use latitude/longitude values from the Places API as an input for point-in-polygon analysis**; ... (vii) use Google Maps Content to improve machine learning and artificial intelligence models ..."
- (d) **No Re-Creating Google Products or Features.** "... (iii) use the Google Maps Core Services in a listings or directory service ..."
- (e) No Use With Non-Google Maps (detalhado nos Service Terms 14.2).

Service Specific Terms, https://cloud.google.com/maps-platform/terms/maps-service-terms:

- "Google ID Caching: Customer may cache the Google ID values from the Services that return such field and allow caching ... For example, Customer may cache (a) place_id from Places API ...". Política Places: "the place ID ... is exempt from the caching restrictions. You can therefore store place ID values indefinitely" (https://developers.google.com/maps/documentation/places/web-service/policies).
- **14. Places API (Legacy and New)**: 14.1 "Customer may use Google Maps Content from the Places API in Customer Applications without a corresponding Google Map." 14.2 "**Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map.**" 14.3 "Customer may temporarily cache latitude and longitude values from the Places API for up to **30 consecutive calendar days**, after which Customer must delete the cached latitude and longitude values."
- **13. Places Aggregate API**: "Customer may use total counts of points of interest returned by the Places Aggregate API ('POI Count') to create Customer Values, if Customer ensures: (a) that the resulting Customer Value cannot be used as a substitute for POI Counts; or (b) that Customer and Customer's End Users do not reverse engineer POI Count(s)". 13.2 "Customer may temporarily cache the POI Count for 30 consecutive calendar days solely for the purpose of calculating the Customer Value, after which Customer must delete the cached POI Count." A API aceita `locationFilter` por círculo, **região por place ID (cidades, CEPs, condados, estados)** ou polígono, e retorna `INSIGHT_COUNT` ou `INSIGHT_PLACES` (IDs só quando count ≤ 100) (https://developers.google.com/maps/documentation/places-aggregate/reference/rest/v1/TopLevel/computeInsights). Atribuição obrigatória mesmo como métrica isolada (https://developers.google.com/maps/documentation/places-aggregate/policies).
- Atribuição/reviews (policies): "You must always credit the author when displaying photos or reviews"; "end-users must always have access to view the individual source photo or review on Google Maps"; logo "Google Maps" obrigatório fora de um mapa Google.

### 2.3 Resposta direta: pode guardar ratings/reviews/endereços em JSON público no GitHub Pages?

**Não.** Isso é exatamente o que 3.2.3(a)(i) e (iii) proíbem ("store, reshare, or rehost"; "copy and save business names, addresses, or user reviews"), (b) proíbe cache fora das exceções, e as únicas exceções são `place_id` (indefinido) e lat/lng (30 dias, para uso no app, não para republicação). Contar farmácias por município a partir de lat/lng da Places API é "point-in-polygon analysis" (3.2.3(c)(iv)), vedado. Publicar contagens da Aggregate API como indicador é vedado (13.1: o valor publicado não pode substituir o POI Count). Exibir resultados em Leaflet/MapLibre viola 14.2. Reviews ainda contêm nome do autor (dado pessoal, LGPD). O único uso conforme é chamada ao vivo no navegador do usuário, com atribuição Google, sem persistência, o que não se encaixa em um site estático com JSON mensal.

**Veredicto: Rejeitar** (agregados e registros brutos, ambos).

### 2.4 SerpApi / Outscraper / Apify (raspagem do Google Maps)

| Serviço | Preço (verificado) | Observações legais |
|---|---|---|
| SerpApi (https://serpapi.com/pricing) | 250 buscas/mês grátis; Developer $75/5.000; Production $150/15.000; Big Data $275/30.000 | "U.S. Legal Shield ... up to $2 million in coverage for the scraping and parsing of search engine data, as long as your use of the data or service is not illegal" (só Production+, só EUA, não cobre a sua republicação). |
| Outscraper (https://outscraper.com/pricing/) | 500 registros grátis; $3/1.000 (501–100k); $1/1.000 acima; reviews idem | "Public data is for everybody"; sem garantia jurídica. |
| Apify Google Maps Scraper (https://apify.com/compass/crawler-google-places) | $1,50/1.000 lugares (pay per event) + add-ons | FAQ: "you should respect boundaries such as personal data ... factor in Google's Terms of Use"; avisos GDPR repetidos. |

Risco: Google Terms of Service proíbem "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt ...)" e "bypassing our systems or protective measures" (https://policies.google.com/terms). Reviews trazem nome/foto do autor (dado pessoal; LGPD art. 7º §3º exige respeitar a finalidade original, que não é alimentar dashboards de terceiros). Para um dashboard associado a uma pessoa vinculada a órgão público, o risco reputacional supera o ganho. **Veredicto: Rejeitar.**

---

## 3. OpenStreetMap via Overpass API

- Relação do estado: **`relation 297640`** ("Paraná, Região Sul, Brasil", boundary=administrative; verificado em https://nominatim.openstreetmap.org/search?q=Paraná,Brazil&format=json). Área Overpass = `3600297640`.
- Query testada (**verificado**, https://overpass-api.de/api/interpreter, POST `data=`, Overpass 0.7.62.11, `timestamp_osm_base` 2026-09-13T16:56:51Z):
  ```
  [out:json][timeout:120];
  area(3600297640)->.a;
  nwr["amenity"="hospital"](area.a);
  out count;
  ```
  Resultado: `{"nodes":"148","ways":"351","relations":"7","total":"506"}`.
- Contagens no PR (nós+vias+relações): **hospital 506**, **clinic 927**, **doctors 145**, **dentist 117** (overpass-api.de, 2026-09-13); **pharmacy 981** e **social_facility 234** (obtidos no espelho https://overpass.kumi.systems, cujo `timestamp_osm_base` estava em 2026-06-01 e 2026-07-15, ou seja, espelho atrasado ~3 meses). Para comparação, o CNES do PR tem milhares de farmácias: OSM está fortemente sub-mapeado para farmácias e consultórios; é complementar (geometria/nome), não censo.
- Operacional: o servidor principal retornou 504/"server is probably too busy" várias vezes nesta sessão; `/api/status` mostra "Rate limit: 2" slots por IP. Uma query com `for (t["amenity"])` (contagem por tag) falhou por timeout. Para produção mensal, prefira **Geofabrik `sul-latest.osm.pbf` (404 MB, atualizado diariamente, ODbL; sem extrato só do PR)** (https://download.geofabrik.de/south-america/brazil/sul.html) + `osmium tags-filter` / `pyosmium` filtrando `amenity=hospital,clinic,doctors,dentist,pharmacy,social_facility` e recortando pelo limite do PR (IBGE malha), depois spatial join com os 399 municípios (GeoPandas, SIRGAS 2000). Cabe folgado em 30 min no Actions.
- Licença **ODbL 1.0** (https://www.openstreetmap.org/copyright): atribuição obrigatória ("© OpenStreetMap contributors") e share-alike: "If you alter or build upon our data, you may distribute the result only under the same license." Guideline OSMF (https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline): "If the published result of your project is intended for the extraction of the original data, then it is a database and not a Produced Work"; derivative databases devem ser publicadas sob ODbL. Consequência: o JSON de contagens por município e o GeoJSON de pontos derivados do OSM são **derivative databases** → publicá-los sob ODbL (o projeto é aberto, então é compatível), em arquivo separado dos demais dados (collective database), com nota de licença e atribuição visível no mapa e no rodapé. Registros brutos (nome, endereço, telefone da tag) também podem ser republicados sob ODbL; para `doctors`/`dentist` cujo `name` seja nome de pessoa, evite listar nominalmente (LGPD), agregue.
- **Veredicto: Adotar** (agregados e geometrias, sob ODbL com atribuição).

---

## 4. Wikidata SPARQL

- Endpoint https://query.wikidata.org/sparql (GET `query=`, `Accept: text/csv`). **Verificado**: `SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE { ?item wdt:P31 wd:Q16917 . ?item wdt:P131+ wd:Q15499 . }` → **14**. Amostra (com P625): Hospital Universitário Regional de Maringá (-51.9555, -23.4001), HU Regional do Norte do Paraná (Londrina), HU Evangélico Mackenzie, Hospital de Clínicas da UFPR, Hospital Erasto Gaertner, Hospital Nossa Senhora das Graças, HU do Oeste do Paraná (Cascavel), Uopeccan, Hospital Angelina Caron (Campina Grande do Sul); vários sem coordenada (Santa Casa de Curitiba, Hospital São Vicente).
- A variante com subclasses (`wdt:P31/wdt:P279* wd:Q16917`) estourou o timeout do WDQS duas vezes (502 / "upstream request timeout"); usar P31 direto + lista de classes explícitas, ou o endpoint com `LIMIT` e paginação.
- Licença **CC0** (https://www.wikidata.org/wiki/Wikidata:Licensing): sem atribuição obrigatória; armazenar e republicar registros e agregados é livre. Sem risco LGPD para hospitais (entidades).
- Valor: baixo para contagem (cobertura ínfima), útil para enriquecer grandes hospitais com QID, Wikipedia, imagem (P18), site oficial (P856), CNES (P?) quando existir.
- **Veredicto: Adotar como enriquecimento menor.**

---

## 5. Outras fontes

### 5.1 Overture Maps, tema `places`

- Release mais recente: **2026-08-19.0** (https://docs.overturemaps.org/getting-data/). Caminhos: `s3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/*` e Azure `https://overturemapswestus2.blob.core.windows.net/release/2026-08-19.0/theme=places/type=place/*` (https://docs.overturemaps.org/guides/places/). Cadência mensal.
- Campos: `id`, `names.primary`, `categories` (legado, em depreciação), `taxonomy` (hierarquia + `primary`/`alternate`, introduzido em dez/2025) e `basic_category` (~280 rótulos), `confidence`, `addresses`, `sources`, `brand`, `websites`, `phones`, `bbox`, `geometry` (https://docs.overturemaps.org/guides/places/taxonomy/; https://docs.overturemaps.org/blog/2025/12/17/release-notes/: "The original `categories` property will remain in the schema for several months").
- Códigos de saúde no CSV legado (**verificado**, https://raw.githubusercontent.com/OvertureMaps/schema/96ec26830d5b1c83216de3ce1a91c301c178705e/docs/schema/concepts/by-theme/places/overture_categories.csv): `hospital`, `emergency_room`, `childrens_hospital`, `medical_center`, `urgent_care_clinic`, `community_health_center`, `dialysis_clinic`, `eye_care_clinic`, `doctor` (+ especialidades), `dentist`, `dental_hygienist`, `psychologist`, `psychotherapist`, `home_health_care` (todos sob `health_and_medical`) e **`pharmacy` sob `retail`**. Como a taxonomia nova ainda não publica lista de códigos nas notas, fixe a versão do release no script e valide os rótulos a cada mês.
- Download só do PR: `pip install overturemaps` e `overturemaps download --bbox=-54.62,-26.72,-48.02,-22.52 -f geoparquet --type=place -o pr_places.parquet`, ou DuckDB `read_parquet('s3://.../theme=places/type=place/*', hive_partitioning=1) WHERE bbox.xmin BETWEEN -54.62 AND -48.02 AND bbox.ymin BETWEEN -26.72 AND -22.52` (exemplo oficial usa `bbox.xmin`/`bbox.ymin`). Leitura por range HTTP; em geral alguns minutos; cabe no Actions. Depois filtrar por categoria e spatial join com os municípios.
- Licença (https://docs.overturemaps.org/attribution/): places = **CDLA-Permissive 2.0** (Meta, Microsoft, etc.) + **Apache 2.0** (Foursquare) + **CC0** (AllThePlaces). Atribuição sugerida: "Overture Maps Foundation, overturemaps.org". Não há share-alike: armazenar e republicar registros e agregados é permitido com atribuição. LGPD: entradas `doctor`/`dentist` frequentemente têm nome de pessoa física; publicar só agregados por município e, nominalmente, apenas hospitais/clínicas/farmácias (organizações) com `confidence` alto.
- Tamanho PR: estimado em dezenas de milhares de POIs (não medido nesta sessão).
- **Veredicto: Adotar com restrições** (melhor fonte não oficial para lat/long + categoria + telefone/site, licença permissiva).

### 5.2 Foursquare OS Places

- Licença **Apache 2.0** (https://docs.foursquare.com/data-products/docs/access-fsq-os-places). Releases mensais em https://huggingface.co/datasets/foursquare/fsq-os-places (pastas `release/dt=2026-08-11`, `2026-07-09`, `2026-06-11`, …, **verificado**) e S3 `s3://fsq-os-places-us-east-1/release/dt=YYYY-MM-DD/places/parquet/`.
- Schema (https://docs.foursquare.com/data-products/docs/places-os-data-schema): `fsq_place_id, name, latitude, longitude, address, locality, region, postcode, admin_region, country` ("2 Letter ISO Country Code"; "Abbreviations are used in the following countries (US, CA, AU, and BR)" → `region='PR'`), `tel, website, email`, `date_created, date_refreshed, date_closed`, `fsq_category_ids, fsq_category_labels` (rótulos hierárquicos; filtrar prefixo "Health and Medicine"), `geom`, `bbox`. A tabela de categorias vem em `categories/parquet` no mesmo release (a página de categorias é iframe, IDs não extraíveis por bot).
- Filtro: `country='BR' AND region='PR' AND (date_closed IS NULL)`; via DuckDB httpfs sobre HF (dataset global grande; leitura por range funciona mas é mais pesada que o Overture). Redundante porque o Overture já incorpora a FSQ. LGPD: mesmo cuidado com nomes de profissionais.
- **Veredicto: Adotar com restrições, opcional** (use se quiser `date_closed`/`date_refreshed` e e-mail/telefone; caso contrário Overture basta).

### 5.3 CFM / CRM-PR, médicos por município

- **Verificado** 2026-09-13: https://portal.cfm.org.br/estatisticas → 404; https://observatorio.cfm.org.br/demografia/ → 302 → https://portal.cfm.org.br/demografia/ → **404**; https://demografia.cfm.org.br/ → 302 → observatório → 404. Só https://portal.cfm.org.br/busca-medicos/ (busca individual, 200).
- Notícias do CFM sobre a plataforma "Demografia Médica" (painéis por UF; "por enquanto não é possível fazer download dos gráficos e tabelas"; filtros por município prometidos) em https://portal.cfm.org.br/noticias/cfm-lanca-plataforma-que-democratiza-acesso-a-informacoes-sobre-os-profissionais-da-medicina-no-pais/. Relatório "Demografia Médica 2025" (CFM + FMUSP) é PDF por UF/região.
- Não há tabela aberta por município; raspar a busca de médicos é coleta de dados pessoais (nome, CRM, especialidade) → LGPD. Use o **CNES (profissionais por município)** que o dashboard já pode consumir oficialmente.
- **Veredicto: Rejeitar.**

### 5.4 CRF-PR farmácias

- Site https://www.crf-pr.org.br/ (fiscalização, seccionais); só consulta individual de farmacêuticos via terceiros (https://consultar.io/crf/pr/). Nenhum dataset por município encontrado. Alternativas oficiais: ANVISA "Consulta de Drogarias e Farmácias" (https://www.gov.br/anvisa/pt-br/sistemas/consulta-de-drogarias-e-farmacias), CNES tipo de estabelecimento "Farmácia", e o próprio CNAE 4771-7 da RFB (seção 1).
- **Veredicto: Rejeitar** (sem dado aberto).

### 5.5 Google Trends ("dengue", "gripe") com pytrends

- pytrends: repositório arquivado em 2025-04-17 (último release 4.9.2, abr/2023); em set/2026 `interest_over_time`, `interest_by_region` e `related_queries` ainda retornam dados, mas os métodos de "trending" dão 404 (https://dev.to/esteban_ortega/pytrends-is-dead-heres-how-to-get-google-trends-data-in-2026-1a18; https://github.com/GeneralMills/pytrends/issues/638). API oficial: "Introducing the Google Trends API (alpha)", jul/2025, acesso por inscrição, ainda alfa fechado (https://developers.google.com/search/blog/2025/07/trends-api; https://apiserpent.com/blog/pytrends-dead-google-trends-data-2026).
- Dados: índice relativo 0–100, `geo='BR-PR'`; granularidade sub-estadual é por "cidade" do Google (poucas cidades grandes), não pelos 399 municípios. Bloqueios 429 são comuns em IPs de datacenter (GitHub Actions). Licença: não há termos específicos para uso via scraping; o caminho seguro é o **embed oficial** do Google Trends no site, ou um CSV pequeno (série estadual semanal) com fonte citada.
- **Veredicto: Adotar com restrições** (série estadual; job tolerante a falha; preferir embed).

### 5.6 Notícias: SESA-PR e Agência Estadual de Notícias

- **Verificado**: https://www.aen.pr.gov.br/ → 302 → https://www.parana.pr.gov.br/aen/; nenhum link RSS; `/aen/rss.xml`, `/aen/feed`, `/rss` → 404. A página exibe "Nenhuma notícia disponível" por restrição da **Lei Federal nº 9.504/1997** (período eleitoral 2026). https://www.saude.pr.gov.br/Noticias → 200, notícias em `/Noticia/<slug>`, sem RSS (`/rss.xml` devolve HTML 200, não é feed). O site da SESA tem seções de boletins (dengue, influenza) e link para TabNet, que são fontes oficiais.
- Opções: (a) raspar a listagem HTML da SESA (título, data, link) 1× por dia/semana; (b) Google News RSS por consulta (`https://news.google.com/rss/search?q=...`), guardando só título+link+fonte. Conteúdo governamental é público; armazenar apenas título, data e URL evita questões de direito autoral.
- **Veredicto: Adotar com restrições** (título + link; sem corpo do texto; tolerar ausência de notícias no período eleitoral).

---

## 6. Combinação recomendada para o dashboard

1. **Camada "oferta privada/registral" por município (mensal)**: Receita Federal CNPJ → contagem de estabelecimentos ativos por município × classe CNAE 86xx e 4771-7/01–03, série histórica (as pastas `2023-05`… permitem backfill). Implementar com matrix job de 10 downloads paralelos via WebDAV (ou Base dos Dados/BigQuery se aceitar um secret GCP). Mapear TOM→IBGE com `municipios.csv`. Publicar só agregados; nunca `Socios`, e-mails, telefones ou nomes de MEI/EI.
2. **Camada geográfica (pontos no mapa)**: Overture Places (CDLA-Permissive, atribuição) para hospitais/clínicas/farmácias com coordenadas, complementado por OSM via Geofabrik `sul` (ODbL, arquivo separado com atribuição "© OpenStreetMap contributors"). Contagens OSM/Overture servem como "cobertura colaborativa", não como oferta oficial; a referência oficial continua o CNES.
3. **Enriquecimento pontual**: Wikidata (CC0) para QID/Wikipedia/foto dos grandes hospitais; BrasilAPI/minhareceita apenas para consultar CNPJs específicos (ex.: validar a situação cadastral de hospitais), sem crawling.
4. **Sinais contextuais**: Google Trends estadual (embed ou série semanal) e manchetes SESA/Google News (título + link).
5. **Fora**: Google Places/Aggregate e raspadores de Google Maps (ToS + LGPD), CFM/CRF-PR (sem dado aberto, dados pessoais), cnpj.biz.

## 7. Falhas de verificação nesta sessão (para transparência)

- Página do dataset em dados.gov.br é SPA; API pública respondeu 401 sem chave → licença específica do dataset CNPJ não confirmada.
- Base dos Dados: página do dataset é JS; atraso de atualização e tamanho não confirmados (schema confirmado via GitHub).
- minhareceita `docs/api/`: 403 para bots.
- planalto.gov.br (LGPD): ECONNRESET/429; artigos citados de memória.
- Overpass: espelho kumi.systems com dados de junho/julho 2026 (atrasado); servidor principal instável (504/timeout) durante a sessão.
- Categorias FSQ: tabela em iframe (Observable), IDs não extraídos; usar `fsq_category_labels` por prefixo.
