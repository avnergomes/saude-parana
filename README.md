# Saúde Paraná

> **⚠️ Versão demonstrativa:** parte dos indicadores exibidos (taxas municipais de mortalidade, cobertura vacinal, leitos SUS e Previne Brasil) é gerada com valores simulados em `scripts/preprocess_data.py` enquanto a integração completa com o DATASUS não é finalizada. Não utilize estes números para decisões ou citações.

Dashboard de indicadores de saúde pública do estado do Paraná (2010–2024), com dados do DATASUS. Consolida informações sobre mortalidade, internações SUS, cobertura vacinal, estabelecimentos de saúde, leitos e repasses financeiros do SUS.

**🔗 [Acessar](https://avnergomes.github.io/saude-parana/)**

Parte do ecossistema **[Datageo Paraná](https://datageoparana.github.io)**.

---

## Sobre

O **Saúde Paraná** reúne os principais indicadores do sistema de saúde pública paranaense em um único painel analítico. Os dados provêm dos subsistemas do DATASUS — SIM (mortalidade), SIH (internações), PNI (vacinação), CNES (estabelecimentos) e FNS (repasses financeiros) — e são atualizados automaticamente via pipeline GitHub Actions.

### KPIs principais

| Indicador | Descrição |
|-----------|-----------|
| **Óbitos** | Total de óbitos registrados no SIM no período selecionado |
| **Internações SUS** | Número de internações hospitalares pelo SUS (SIH) |
| **Cobertura vacinal** | Percentual de cobertura por imunobiológico (PNI) |
| **Estabelecimentos** | Quantidade de estabelecimentos de saúde cadastrados no CNES |
| **Leitos SUS** | Total de leitos hospitalares disponíveis pelo SUS |
| **Repasse SUS** | Volume de recursos financeiros transferidos pelo Fundo Nacional de Saúde |

---

## Fonte de Dados

| Fonte | Subsistema | Conteúdo |
|-------|-----------|----------|
| **DATASUS** | SIM — Sistema de Informações sobre Mortalidade | Causas de óbito por CID-10 |
| **DATASUS** | SIH — Sistema de Informações Hospitalares | Internações e produção hospitalar |
| **DATASUS** | PNI — Programa Nacional de Imunizações | Cobertura vacinal por município |
| **DATASUS** | CNES — Cadastro Nacional de Estabelecimentos de Saúde | Unidades, leitos e profissionais |
| **DATASUS** | FNS — Fundo Nacional de Saúde | Repasses financeiros do SUS |

---

## Tecnologias

| Categoria | Tecnologia | Versão |
|-----------|-----------|--------|
| Framework UI | React | 18 |
| Build tool | Vite | 5 |
| Estilização | Tailwind CSS | 3 |
| Gráficos | Recharts | — |
| Gráficos | D3.js | — |
| Mapa | Leaflet / React-Leaflet | — |
| Pipeline de dados | Python | 3.x |
| CI/CD | GitHub Actions | — |

---

## Estrutura do Projeto

```
saude-parana/
├── dashboard/                      # Aplicação React (Vite)
│   ├── public/
│   │   └── data/
│   │       ├── mortalidade.json        # Óbitos por CID-10, município e ano
│   │       ├── internacoes.json        # Internações SUS por categoria
│   │       ├── vacinacao.json          # Cobertura vacinal por imunobiológico
│   │       ├── estabelecimentos.json   # CNES — unidades e leitos
│   │       ├── repasses_sus.json       # Repasses FNS por município
│   │       ├── indicadores_ab.json     # Indicadores de atenção básica
│   │       ├── metadata.json           # Metadados e dicionário de variáveis
│   │       └── geo_map.json            # GeoJSON para o mapa coroplético
│   └── src/
│       ├── components/
│       │   ├── ActiveFilters.jsx
│       │   ├── BarChart.jsx
│       │   ├── ErrorBoundary.jsx
│       │   ├── Filters.jsx
│       │   ├── Footer.jsx
│       │   ├── Header.jsx
│       │   ├── KpiCards.jsx
│       │   ├── Loading.jsx
│       │   ├── MapChart.jsx
│       │   ├── PyramidChart.jsx
│       │   ├── RankingTable.jsx
│       │   ├── SankeyChart.jsx
│       │   ├── SunburstChart.jsx
│       │   ├── Tabs.jsx
│       │   ├── TimeSeriesChart.jsx
│       │   └── TreemapChart.jsx
│       └── hooks/
│           └── useData.js
├── scripts/
│   ├── download_data.py            # Coleta dados das APIs DATASUS
│   └── preprocess_data.py          # Transformação e exportação dos JSONs
└── .github/
    └── workflows/
        ├── data-pipeline.yml       # Atualização automática dos dados
        └── deploy.yml              # Deploy no GitHub Pages
```

---

## Funcionalidades

- **Mortalidade por CID-10** — análise das principais causas de óbito com agrupamento por capítulo e categoria
- **Internações SUS** — volume e perfil das internações hospitalares pelo SUS no Paraná
- **Cobertura vacinal** — evolução temporal por imunobiológico e município (PNI)
- **Estabelecimentos de saúde** — mapeamento das unidades do CNES com filtro por tipo
- **Leitos SUS** — disponibilidade e distribuição de leitos hospitalares por especialidade
- **Repasses FNS** — fluxo de recursos financeiros do SUS por município e programa
- **Diagrama Sankey** — visualização do fluxo de internações (origem → especialidade → desfecho)
- **Sunburst de causas** — hierarquia das causas de mortalidade por capítulo/categoria CID-10
- **Mapa por município** — visualização coroplética de qualquer indicador nos 399 municípios
- **Pirâmide etária** — perfil etário dos óbitos ou internações por faixa e sexo
- **Séries temporais** — evolução de qualquer indicador entre 2010 e 2024
- **Ranking** — tabela comparativa de municípios por qualquer indicador
- **Filtros encadeados** — por ano, município, região, causa e tipo de estabelecimento

---

## Desenvolvimento Local

### Pré-requisitos

- Node.js 18+
- Python 3.x (para o pipeline de dados)

### Instalação e execução

```bash
# Clonar o repositório
git clone https://github.com/avnergomes/saude-parana.git
cd saude-parana/dashboard

# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:5173`.

```bash
# Build de produção
npm run build

# Pré-visualizar build
npm run preview
```

---

## Pipeline de Dados

O pipeline é executado automaticamente via GitHub Actions (`.github/workflows/data-pipeline.yml`) e pode ser rodado localmente:

```bash
# Instalar dependências Python
pip install -r scripts/requirements.txt

# 1. Baixar dados das APIs DATASUS
python scripts/download_data.py

# 2. Processar e exportar os JSONs
python scripts/preprocess_data.py
```

Os arquivos são gerados em `dashboard/public/data/` e servidos estaticamente pelo Vite.

---

## Licença

MIT License — consulte o arquivo `LICENSE` no repositório para detalhes.
