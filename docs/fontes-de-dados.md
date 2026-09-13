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
| Óbitos por causa | SIM/DATASUS via TabNet (`sim/cnv/obt10pr.def`), óbitos por município de residência e capítulo CID-10 | HTTP POST (TabNet) | município x capítulo x ano | 2010 até o último ano; 2025+ preliminar | `scripts/etl/sim_cid.py` | `mortalidade_cid.json` |
| Internações SUS | SIH/SUS via TabNet (`sih/cnv/nrpr.def`), por município de residência | HTTP POST (TabNet) | município x capítulo x ano | 2015 até a última competência mensal | `scripts/etl/sih.py` | `internacoes.json` |
| Financiamento | SIOPS/DATASUS via TabNet (`mIndicadores.def`), despesa com saúde por habitante, % de receitas próprias (EC 29), transferências SUS | HTTP POST (TabNet) | município x ano | 2015 até o último ano | `scripts/etl/siops.py` | `financiamento.json` |
| Atenção primária | Ministério da Saúde/SAPS, Relatórios e-Gestor AB (cobertura potencial da APS, NT 02/2025) | REST (API interna do relatório oficial, não documentada) | município x competência mensal | 2021 até o mês corrente | `scripts/etl/aps.py` | `atencao_primaria.json` |
| Dengue | InfoDengue (Fiocruz/FGV), a partir do SINAN, com estimativa por nowcasting | REST (`alertcity`) | município x semana epidemiológica | 2024 até a semana corrente | `scripts/etl/infodengue.py` | `arboviroses.json` |
| Planos de saúde | ANS, Dados Abertos (PDA 047, taxa de cobertura por município) | HTTPS CSV | município x período | mensal | `scripts/etl/ans.py` | `planos_saude.json` |

Malha e regionais: `geo_map.json` (399 municípios, 23 regionais IDR, 7 mesorregiões) vem da malha municipal do IDR-Paraná e é gerado por `dashboard/scripts/generate_geo_map.cjs`.

## Limites metodológicos (o que o painel avisa)

- IBGE (Registro Civil) e SIM (DATASUS) contam óbitos por caminhos diferentes: o Registro Civil parte dos cartórios; o SIM, das declarações de óbito com causa básica. Os totais diferem um pouco e não devem ser somados entre si.
- A taxa bruta usa a população do próprio ano. As estimativas até 2021 têm base no Censo 2010 e as de 2024 em diante no Censo 2022: há quebra de série em 2022.
- "Cobertura potencial da APS" é a capacidade das equipes dividida pela população, limitada a 100%; a série anterior a 2021 usava outro método e não entra.
- InfoDengue publica casos notificados e casos estimados (nowcasting); as últimas semanas mudam a cada atualização.
- SIOPS é autodeclarado pelos municípios; o ano mais recente pode estar incompleto.
- CNES é um retrato do cadastro na data de extração, não uma série histórica.
- Cobertura vacinal (SI-PNI/RNDS) ficou de fora: não há fonte agregada por município legível por máquina desde a mudança de metodologia de 2020 (só microdado individual, de 2 GB por mês, ou painel Qlik).

## LGPD

O IDR-Paraná é controlador de dados, mas este painel só publica agregados. Regras aplicadas nos ETLs:

- Nenhum microdado individual (SIM, SINASC, SIH, SINAN, PNI) é baixado; usam-se os agregados oficiais do TabNet.
- CNES: e-mail, telefone, CNPJ e endereço são descartados na leitura; consultórios de pessoa física entram só nas contagens; o mapa de pontos mostra apenas hospitais e unidades de pronto atendimento (nomes institucionais).
- Bases de CNPJ da Receita Federal, quando adotadas, publicarão apenas contagens por município e CNAE, nunca sócios, MEI ou contatos.

## Fontes avaliadas e não adotadas

| Fonte | Decisão | Motivo |
|---|---|---|
| Google Places API / Places Aggregate / raspadores do Google Maps (SerpApi, Outscraper, Apify) | Rejeitada | Os termos do Google Maps Platform proíbem armazenar, reexibir ou republicar nomes, endereços e avaliações e limitam o cache a 30 dias (exceto `place_id`); raspagem viola os termos e coleta dados pessoais de avaliadores. |
| Receita Federal, dados abertos do CNPJ | Adiada (decisão do mantenedor) | Viável e público, mas o dump mensal tem 5,3 GB (10 arquivos) e exige matriz de jobs ou credencial GCP (Base dos Dados/BigQuery). Só agregados por município e CNAE seriam publicados. |
| OpenStreetMap (Overpass/Geofabrik) e Overture Maps | Adiada | Licenças compatíveis (ODbL com atribuição e share-alike; CDLA-Permissive 2.0), mas o CNES já traz coordenadas de 40 mil estabelecimentos; a camada colaborativa acrescenta pouco por ora. |
| SI-PNI doses aplicadas (API/CSV) | Rejeitada | Microdado individual pseudonimizado (dado sensível), 2 GB/mês. |
| SESA-PR boletins de dengue | Rejeitada para automação | Só PDF semanal; o InfoDengue cobre o mesmo dado por município. |
| IPARDES BDEweb, dados.pr.gov.br, FNS, SISAB, CFM/CRM-PR, CRF-PR | Adiadas ou rejeitadas | Sem resposta, sem API, exige chave, ou sem dado aberto por município na data da verificação. |
