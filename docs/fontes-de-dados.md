# Fontes de dados do Saúde Paraná

Inventário das fontes usadas pelo painel, com o que cada uma mede, como é acessada, com que frequência muda e que cuidados de licença e LGPD se aplicam. Todos os endpoints foram verificados em 13/09/2026; os relatórios completos da pesquisa (com status HTTP, tamanhos e trechos de termos de uso) estão em [`docs/pesquisa/`](pesquisa/).

Princípio: o painel só publica dado real, de fonte identificada. Indicadores sem fonte verificável não entram.

## Fontes adotadas

| Domínio | Fonte (órgão) | Acesso | Granularidade | Período e cadência | Script | Saída |
|---|---|---|---|---|---|---|
| Óbitos e taxa bruta | IBGE, Estatísticas do Registro Civil, tabela 2654 (óbitos ocorridos no ano, por município de residência do falecido) | API SIDRA | município x ano; sexo x faixa etária (PR) | 2003-2024, anual | `scripts/download_data.py` + `preprocess_data.py` | `mortalidade.json` |
| Nascidos vivos | IBGE, Registro Civil, tabela 2609 (nascidos vivos registrados no ano, por residência da mãe; inclui registros tardios, cerca de 1% ao ano) | API SIDRA | município x ano | 2003-2024, anual | idem | `mortalidade.json` |
| População | IBGE, Estimativas (t6579); Contagem 2007 (t793); Censos 2010 (t1378) e 2022 (t4714). 2023 interpolado e sinalizado | API SIDRA | município x ano | 2001-2026, anual | idem | `mortalidade.json`, `metadata.json` |
| Rede de saúde | CNES/DATASUS, Portal de Dados Abertos do SUS (`cnes_estabelecimentos_csv.zip`, com lat/long) e Hospitais e Leitos (CGHID/MS) | HTTPS (S3), zip | estabelecimento e município | atualização diária (CNES) e mensal (leitos) | `scripts/etl/cnes.py` | `estabelecimentos.json` |
| Empresas de saúde (CNPJ) | Receita Federal do Brasil, Dados Abertos do CNPJ, arquivo Estabelecimentos (10 partes, 5,3 GB por competência) e tabela oficial de municípios TOM -> IBGE (`municipios.csv`) | WebDAV público (Nextcloud, `public.php/webdav/AAAA-MM/`), zip Latin-1 | município x classe CNAE (agregados) | competência mensal, 2023-05 em diante | `scripts/cnpj/*.py` (workflow próprio `cnpj-pipeline.yml`) | `cnpj_saude.json` |
| Óbitos por causa | SIM/DATASUS via TabNet (`sim/cnv/obt10pr.def`), óbitos por município de residência e capítulo CID-10 | HTTP POST (TabNet) | município x capítulo x ano | 2010 até o último ano; 2025+ preliminar | `scripts/etl/sim_cid.py` | `mortalidade_cid.json` |
| Internações SUS | SIH/SUS via TabNet (`sih/cnv/nrpr.def`), por município de residência | HTTP POST (TabNet) | município x capítulo x ano | 2015 até a última competência mensal | `scripts/etl/sih.py` | `internacoes.json` |
| Financiamento | SIOPS/DATASUS via TabNet (`mIndicadores.def`), despesa com saúde por habitante, % de receitas próprias (EC 29), transferências SUS | HTTP POST (TabNet) | município x ano | 2015 até o último ano | `scripts/etl/siops.py` | `financiamento.json` |
| Atenção primária | Ministério da Saúde/SAPS, Relatórios e-Gestor AB (cobertura potencial da APS, NT 02/2025) | REST (API interna do relatório oficial, não documentada) | município x competência mensal | 2021 até o mês corrente | `scripts/etl/aps.py` | `atencao_primaria.json` |
| Dengue | InfoDengue (Fiocruz/FGV), a partir do SINAN, com estimativa por nowcasting | REST (`alertcity`) | município x semana epidemiológica | 2024 até a semana corrente | `scripts/etl/infodengue.py` | `arboviroses.json` |
| Planos de saúde | ANS, Dados Abertos (PDA 047, taxa de cobertura por município) | HTTPS CSV | município x período | mensal | `scripts/etl/ans.py` | `planos_saude.json` |

Malha e regionais: `geo_map.json` (399 municípios, 23 regionais IDR, 7 mesorregiões) vem da malha municipal do IDR-Paraná e é gerado por `dashboard/scripts/generate_geo_map.cjs`.

### Como a camada CNPJ é montada

- Critério: CNAE fiscal principal na divisão 86 (atenção à saúde humana: 8610-1 hospitais, 8621-6 e 8622-4 urgência móvel e remoção, 8630-5 clínicas e consultórios, 8640-2 diagnóstico e terapia, 8650-0 outros profissionais de saúde, 8660-7 apoio à gestão, 8690-9 outras) ou farmácias e drogarias (4771-7/01 a 03; a 4771-7/04, medicamentos veterinários, fica de fora). Estabelecimentos com saúde apenas em CNAE secundário são contados à parte (`saude_secundaria`).
- Ativo = situação cadastral 02. As contagens por grupo, matrizes, filiais e aberturas por ano consideram só ativos; as demais situações entram em `inativos`.
- Município: o campo MUNICIPIO do CNPJ é o código TOM da jurisdição fiscal, não IBGE. A conversão usa a tabela oficial `municipios.csv` da Receita (versionada em `data/raw/cnpj/`), validada contra os 399 códigos do `geo_map.json`. No CSV o TOM vem sem zeros à esquerda e no arquivo de estabelecimentos com 4 dígitos; os dois lados são normalizados antes do cruzamento.
- A pasta mais recente é escolhida por PROPFIND na raiz do compartilhamento (só pastas `AAAA-MM`; o arquivo solto `cnpj.tar.gz` é ignorado) e precisa ter as 10 partes de Estabelecimentos; se a última estiver incompleta, usa-se a anterior. Se a competência escolhida já for a publicada em `cnpj_saude.json`, o download é pulado.
- Cadência: a Receita publica a competência nova no 2º domingo do mês, entre os dias 9 e 14, à noite (UTC); medido por `getlastmodified` em 2026: 12/04, 10/05, 14/06, 12/07 e 09/08. Por isso o workflow roda toda segunda-feira, e não num dia fixo.
- Download: retomada por Range com verificação do `Content-Range` (o 206 tem de começar no byte já gravado; caso contrário o parcial é descartado) e limite de tentativas contado só entre falhas seguidas sem avanço, porque o servidor cai com frequência no meio de um stream de 2,2 GB.
- Acesso: HTTP Basic com o token do link público como usuário e senha vazia. O token é o identificador do compartilhamento publicado na página da Receita, o mesmo que um navegador usa; não é credencial nem segredo.

## Limites metodológicos (o que o painel avisa)

- IBGE (Registro Civil) e SIM (DATASUS) contam óbitos por caminhos diferentes: o Registro Civil parte dos cartórios; o SIM, das declarações de óbito com causa básica. Os totais diferem um pouco e não devem ser somados entre si.
- A taxa bruta usa a população do próprio ano. As estimativas até 2021 têm base no Censo 2010 e as de 2024 em diante no Censo 2022: há quebra de série em 2022.
- "Cobertura potencial da APS" é a capacidade das equipes dividida pela população, limitada a 100%; a série anterior a 2021 usava outro método e não entra.
- InfoDengue publica casos notificados e casos estimados (nowcasting); as últimas semanas mudam a cada atualização.
- SIOPS é autodeclarado pelos municípios; o ano mais recente pode estar incompleto.
- CNES é um retrato do cadastro na data de extração, não uma série histórica.
- CNPJ mede o cadastro fiscal, não a rede assistencial: um CNPJ ativo com CNAE de saúde pode não ter atendimento, e um estabelecimento do CNES pode operar sob CNPJ com CNAE principal de outra divisão. O município é o da jurisdição fiscal, que em geral coincide com o endereço. Os totais não devem ser somados aos do CNES.
- Cobertura vacinal (SI-PNI/RNDS) ficou de fora: não há fonte agregada por município legível por máquina desde a mudança de metodologia de 2020 (só microdado individual, de 2 GB por mês, ou painel Qlik).

## LGPD

Este painel é um projeto pessoal do mantenedor, sem vínculo institucional; ainda assim segue a LGPD e só publica agregados. Regras aplicadas nos ETLs:

- Nenhum microdado individual (SIM, SINASC, SIH, SINAN, PNI) é baixado; usam-se os agregados oficiais do TabNet.
- CNES: e-mail, telefone, CNPJ e endereço são descartados na leitura; consultórios de pessoa física entram só nas contagens; o mapa de pontos mostra apenas hospitais e unidades de pronto atendimento (nomes institucionais).
- CNPJ (Receita Federal): o arquivo Estabelecimentos traz CNPJ, nome fantasia, endereço, CEP, telefone e e-mail, e o cadastro inclui MEI e outras pessoas físicas equiparadas. O filtro de cada parte lê o zip em streaming e grava apenas seis colunas de código (matriz/filial, situação, data de início, CNAE principal, CNAEs secundários de saúde, código TOM); nenhum identificador ou contato é gravado, versionado ou publicado como artefato. Os arquivos de Empresas, Sócios e Simples não são baixados. A saída publica só contagens por município e classe CNAE (LGPD art. 12, dado anonimizado por agregação); o CSV reduzido não fica no repositório, só o seu hash no manifesto.

Registro da operação de tratamento (art. 37) para a camada CNPJ:

| Item | Registro |
|---|---|
| Finalidade | Dimensionar a oferta de estabelecimentos de saúde e farmácias por município do Paraná para apoio ao planejamento em saúde |
| Base legal | Art. 7º, III (execução de políticas públicas) e art. 7º, IV (estudos, com anonimização); os dados de origem são públicos por força do art. 7º, § 4º e da LAI |
| Dados tratados na origem | Cadastro público de estabelecimentos (CNPJ, situação, CNAE, endereço, contatos), lidos apenas em memória no runner do GitHub Actions |
| Dados retidos | Seis colunas de código por estabelecimento em artefato temporário (3 dias) e agregados por município e classe CNAE em `cnpj_saude.json` |
| Compartilhamento | Só os agregados, publicados no painel |
| Retenção | Artefatos das partes expiram em 3 dias; o zip é apagado ao fim de cada job; o agregado é mantido enquanto o painel existir |
| Responsável | O mantenedor do projeto (projeto pessoal, sem vínculo institucional) |

## Fontes avaliadas e não adotadas

| Fonte | Decisão | Motivo |
|---|---|---|
| Google Places API / Places Aggregate / raspadores do Google Maps (SerpApi, Outscraper, Apify) | Rejeitada | Os termos do Google Maps Platform proíbem armazenar, reexibir ou republicar nomes, endereços e avaliações e limitam o cache a 30 dias (exceto `place_id`); raspagem viola os termos e coleta dados pessoais de avaliadores. |
| OpenStreetMap (Overpass/Geofabrik) e Overture Maps | Adiada | Licenças compatíveis (ODbL com atribuição e share-alike; CDLA-Permissive 2.0), mas o CNES já traz coordenadas de 40 mil estabelecimentos; a camada colaborativa acrescenta pouco por ora. |
| SI-PNI doses aplicadas (API/CSV) | Rejeitada | Microdado individual pseudonimizado (dado sensível), 2 GB/mês. |
| SESA-PR boletins de dengue | Rejeitada para automação | Só PDF semanal; o InfoDengue cobre o mesmo dado por município. |
| IPARDES BDEweb, dados.pr.gov.br, FNS, SISAB, CFM/CRM-PR, CRF-PR | Adiadas ou rejeitadas | Sem resposta, sem API, exige chave, ou sem dado aberto por município na data da verificação. |
