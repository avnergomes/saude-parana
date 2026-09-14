# Saúde Paraná

Painel público de indicadores de saúde dos 399 municípios do Paraná, construído apenas com dados oficiais e de fonte identificada: IBGE (Registro Civil, Estimativas e Censos), DATASUS (CNES, SIM, SIH, SIOPS), Ministério da Saúde (e-Gestor AB), ANS, InfoDengue (Fiocruz/FGV) e Receita Federal (Dados Abertos do CNPJ).

**🔗 [Acessar](https://avnergomes.github.io/saude-parana/)**

Parte do ecossistema **[Datageo Paraná](https://datageoparana.github.io)**.

---

## Painéis

| Aba | O que mostra | Fonte | Período |
|---|---|---|---|
| Visão Geral | Óbitos, taxa bruta, nascidos vivos registrados, população; mapa e ranking municipal | IBGE, Registro Civil e população | 2003-2024 |
| Mortalidade | Série anual, mapa, pirâmide etária de óbitos e óbitos por capítulo CID-10 | IBGE (Registro Civil) e SIM/DATASUS | 2003-2024; CID 2010-2024 |
| Internações SUS | Internações por município de residência, taxa por mil habitantes, valor, óbitos hospitalares e capítulo CID-10 | SIH/SUS (TabNet) | 2015 até a última competência |
| Rede de Saúde | Estabelecimentos por tipo, leitos SUS, hospitais e UPAs no mapa, cobertura de planos de saúde | CNES/DATASUS, CGHID/MS, ANS | retrato atual |
| Empresas de saúde (CNPJ) | Estabelecimentos com CNAE de saúde (hospitais, clínicas, diagnóstico, farmácias etc.) ativos e inativos por município, taxa por 10 mil habitantes e aberturas por ano | Receita Federal, Dados Abertos do CNPJ | competência mensal, 2023-05 em diante |
| Atenção Primária | Cobertura potencial da APS por município e série mensal | e-Gestor AB (MS/SAPS) | 2021 até o mês corrente |
| Dengue e arboviroses | Casos notificados e estimados por semana, incidência e nível de alerta por município | InfoDengue (Fiocruz/FGV), a partir do SINAN | 2024 até a semana corrente |
| Financiamento | Despesa com saúde por habitante, % de receitas próprias aplicadas (EC 29), transferências SUS | SIOPS/DATASUS | 2015 até o último ano |

Os filtros de ano, regional IDR, mesorregião e município valem para todas as abas; clicar em um município no mapa ou no ranking, ou em um ano nas séries, filtra o restante.

Detalhes de cada fonte, limites metodológicos, tratamento LGPD (inclusive o registro de finalidade da camada CNPJ) e fontes avaliadas e não adotadas (Google Maps, OpenStreetMap, PNI) estão em [`docs/fontes-de-dados.md`](docs/fontes-de-dados.md). Os relatórios de pesquisa com os endpoints verificados estão em [`docs/pesquisa/`](docs/pesquisa/).

---

## Tecnologias

| Categoria | Tecnologia |
|---|---|
| Interface | React 19, Vite 6, Tailwind CSS 3 |
| Gráficos | Recharts, D3.js |
| Mapa | Leaflet / React-Leaflet |
| Pipeline de dados | Python 3.12 (requests, biblioteca padrão) |
| Testes | pytest |
| CI/CD | GitHub Actions (pipeline mensal, pipeline CNPJ em matriz de 10 jobs, deploy no GitHub Pages) |

---

## Estrutura do projeto

```
saude-parana/
├── dashboard/                      # Aplicação React (Vite)
│   ├── public/data/
│   │   ├── mortalidade.json        # IBGE: óbitos, nascidos vivos, população, pirâmide
│   │   ├── mortalidade_cid.json    # SIM: óbitos por capítulo CID-10
│   │   ├── internacoes.json        # SIH: internações SUS
│   │   ├── estabelecimentos.json   # CNES: estabelecimentos, leitos, pontos de hospitais/UPAs
│   │   ├── cnpj_saude.json         # Receita Federal: empresas de saúde por município e classe CNAE
│   │   ├── planos_saude.json       # ANS: cobertura de planos de saúde
│   │   ├── atencao_primaria.json   # e-Gestor AB: cobertura potencial da APS
│   │   ├── arboviroses.json        # InfoDengue: dengue por semana epidemiológica
│   │   ├── financiamento.json      # SIOPS: indicadores de financiamento
│   │   ├── metadata.json           # Períodos, fontes, anos interpolados
│   │   └── geo_map.json            # Regionais IDR, mesorregiões e municípios
│   ├── scripts/generate_geo_map.cjs
│   └── src/
│       ├── components/             # Gráficos, mapa, filtros, KPIs
│       ├── components/tabs/        # Uma aba por domínio
│       └── hooks/                  # Carregamento e filtragem por domínio
├── scripts/
│   ├── download_data.py            # IBGE/SIDRA (com manifesto de mudanças)
│   ├── preprocess_data.py          # Gera mortalidade.json e metadata.json
│   ├── run_etl.py                  # Orquestra os ETLs de domínio
│   ├── etl/                        # cnes, sim_cid, sih, siops, aps, infodengue, ans
│   └── cnpj/                       # webdav, filtrar (1 parte), consolidar (10 partes), cnae
├── data/raw/                       # Brutos pequenos versionados + _manifest.json
├── tests/                          # pytest (sem rede)
├── docs/                           # Fontes de dados e relatórios de pesquisa
└── .github/workflows/
    ├── data-pipeline.yml           # Dia 1 de cada mês: baixa, processa, comita, dispara o deploy
    ├── cnpj-pipeline.yml           # Toda segunda: se há competência nova, 10 partes do CNPJ em paralelo, consolida, comita
    └── deploy.yml                  # Build e publicação no GitHub Pages
```

---

## Desenvolvimento local

Pré-requisitos: Node.js 20+, Python 3.12+.

```bash
# Interface
cd dashboard
npm install
npm run dev          # http://localhost:5173
npm run build        # produção
npm run lint

# Dados (na raiz do repositório)
pip install -r scripts/requirements.txt pytest
python -m pytest tests -q
python scripts/download_data.py          # IBGE/SIDRA
python scripts/preprocess_data.py        # mortalidade.json + metadata.json
python scripts/run_etl.py                # todos os domínios
python scripts/run_etl.py --dominio cnes # um domínio só

# CNPJ (Receita Federal): cada parte tem de 340 MB a 2,2 GB
python scripts/cnpj/webdav.py --listar                              # competência mais recente completa
python scripts/cnpj/filtrar.py --pasta 2026-08 --parte 5            # baixa e filtra uma parte -> parte_5.csv
python scripts/cnpj/filtrar.py --parte 5 --zip Estabelecimentos5.zip # sem download, com zip já baixado
python scripts/cnpj/consolidar.py --partes ./partes --pasta 2026-08 # exige as 10 partes (ou --esperadas N)
```

Os JSONs são gerados em `dashboard/public/data/` e servidos estaticamente.

---

## Pipeline de dados

O workflow `data-pipeline.yml` roda no dia 1 de cada mês (ou manualmente):

1. Baixa as tabelas do SIDRA e grava cada arquivo bruto só quando o conteúdo muda. O manifesto `data/raw/_manifest.json` guarda o sha256 e a data da última mudança real; é dela que vem o "Dados atualizados em" do painel, e não do relógio. Uma resposta com menos de 95% das linhas anteriores é tratada como truncada e descartada.
2. Gera `mortalidade.json` e `metadata.json`.
3. Roda os ETLs de domínio. Cada fonte é isolada: se cair e já existir a saída anterior, ela é mantida com aviso.
4. Comita apenas se algum dado mudou e dispara o deploy (o workflow tem `actions: write` para isso).

O workflow `cnpj-pipeline.yml` roda toda segunda-feira às 6h UTC (ou manualmente, com a competência `AAAA-MM` opcional). A Receita publica a competência nova no 2º domingo do mês, entre os dias 9 e 14, à noite; a segunda-feira seguinte é a primeira execução que a encontra, e nas outras semanas o run custa só uma consulta ao servidor. O dump do CNPJ tem 10 partes que somam 5,3 GB e o servidor da Receita entrega a cerca de 2 MB/s, então o trabalho é dividido:

1. `descobrir`: escolhe a fonte e a competência. O servidor da Receita não aceita conexões vindas do GitHub Actions, então, no modo `auto` (padrão), uma sondagem de 10 s decide entre o WebDAV oficial e o espelho público da Casa dos Dados, que guarda os mesmos arquivos. Em seguida escolhe a competência mais recente com as 10 partes de Estabelecimentos e a compara com a de `cnpj_saude.json`; se for a mesma, os jobs seguintes são pulados (uma competência informada à mão é sempre processada, depois de conferida).
2. `filtrar` (matriz de 10 jobs, um por parte, sem `fail-fast`): baixa a parte em streaming com retomada por Range, confere se a data de extração no nome do membro do zip é da competência pedida, lê o zip em Latin-1, mantém só o Paraná e só CNAE de saúde e publica um CSV reduzido com seis colunas de código como artefato de 3 dias. CNPJ, nome, endereço e contatos nunca saem do runner. Zero linhas do PR, competência divergente, contagem de campos errada ou erro HTTP derrubam o job.
3. `consolidar`: baixa os 10 artefatos, exige que todos estejam presentes, converte o código TOM em IBGE com a tabela oficial da Receita, agrega por município e classe CNAE em `cnpj_saude.json`, comita (com `git pull --rebase` antes do push, porque o pipeline mensal pode ter comitado nesse meio-tempo) e dispara o deploy.

Não há segredo envolvido: o token no endereço do WebDAV é o identificador do link público da Receita, o mesmo que o navegador usa, e o espelho não pede autenticação. O disparo manual aceita `fonte` (`auto`, `oficial` ou `espelho`) além da competência.

---

## Licença

Código sob licença MIT (arquivo `LICENSE`). Os dados pertencem às fontes citadas: IBGE (dados abertos, com atribuição), DATASUS (CC BY-ND 3.0), ANS (dados abertos), Receita Federal (Dados Abertos do CNPJ), InfoDengue (citar Codeço CT et al., 2018).
