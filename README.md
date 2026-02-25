# Saúde Paraná

Dashboard interativo de indicadores de saúde pública do Estado do Paraná.

[![Deploy](https://github.com/avnergomes/saude-parana/actions/workflows/deploy.yml/badge.svg)](https://github.com/avnergomes/saude-parana/actions/workflows/deploy.yml)

## Sobre

O **Saúde Paraná** é o 9º dashboard do ecossistema [DataGeo Paraná](https://datageoparana.github.io/) e o primeiro voltado para inteligência territorial em saúde pública.

### Indicadores Disponíveis

- **Mortalidade**: Óbitos por causa (CID-10), pirâmide etária, série histórica 2010-2023
- **Internações SUS**: Diagnósticos, procedimentos, valores, série histórica 2015-2024
- **Vacinação**: Cobertura vacinal infantil, alertas de baixa cobertura
- **Infraestrutura**: Estabelecimentos CNES, leitos SUS por município
- **Financiamento**: Repasses FNS por bloco, indicadores Previne Brasil

### Fontes de Dados

| Fonte | Dados | Período |
|-------|-------|---------|
| SIM/DATASUS | Mortalidade | 2010-2023 |
| SIH/DATASUS | Internações | 2015-2024 |
| SI-PNI/DATASUS | Vacinação | 2015-2024 |
| CNES/DATASUS | Estabelecimentos | 2025 |
| FNS/MS | Repasses SUS | 2018-2024 |
| SISAB | Previne Brasil | 2020-2024 |
| IBGE/SIDRA | População | 2024 |

## Tecnologias

- **Frontend**: React 18, Vite 5, Tailwind CSS 3
- **Visualização**: Recharts, D3.js, Leaflet
- **ETL**: Python (Pandas, Requests)
- **Hospedagem**: GitHub Pages
- **CI/CD**: GitHub Actions

## Desenvolvimento Local

```bash
# Clonar repositório
git clone https://github.com/avnergomes/saude-parana.git
cd saude-parana

# Instalar dependências
cd dashboard
npm install

# Executar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build
```

## Pipeline de Dados

```bash
# Instalar dependências Python
pip install pandas numpy requests openpyxl pyarrow

# Baixar dados das fontes
python scripts/download_data.py

# Processar e gerar JSONs
python scripts/preprocess_data.py
```

## Estrutura do Projeto

```
saude-parana/
├── dashboard/              # Aplicação React
│   ├── public/data/        # JSONs processados
│   ├── src/
│   │   ├── components/     # Componentes React
│   │   ├── hooks/          # Hooks de dados
│   │   └── utils/          # Utilitários
│   └── ...
├── scripts/                # ETL Python
├── data/                   # Dados brutos
└── .github/workflows/      # CI/CD
```

## Links

- **Dashboard**: https://avnergomes.github.io/saude-parana/
- **Portal DataGeo**: https://datageoparana.github.io/
- **Reportar Bug**: https://github.com/avnergomes/saude-parana/issues

## Licença

Este projeto utiliza dados públicos de fontes oficiais brasileiras.

---

Parte do ecossistema **DataGeo Paraná** de inteligência territorial.
