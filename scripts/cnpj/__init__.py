# -*- coding: utf-8 -*-
"""
Camada CNPJ (Receita Federal, Dados Abertos do CNPJ): estabelecimentos de saúde
do Paraná contados por município e classe CNAE, sem nenhum dado individual.

Módulos:
- cnae: conjuntos de CNAE de saúde e agrupamento por classe.
- webdav: descoberta da pasta mais recente e download das partes (Nextcloud).
- filtrar: uma parte de Estabelecimentos -> CSV reduzido (só PR, só saúde).
- consolidar: 10 CSVs reduzidos -> dashboard/public/data/cnpj_saude.json.

Os módulos são executáveis como scripts (python scripts/cnpj/<modulo>.py) e
inserem scripts/ no sys.path para reaproveitar scripts/etl/common.py.
"""
