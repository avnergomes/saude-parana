#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download de dados REAIS para o dashboard Saúde Paraná.

Fontes (todas oficiais, via API SIDRA/IBGE — Estatísticas do Registro Civil
e Estimativas de População):
  - Óbitos por município/ano ..... Tabela 2654 (v/343), 2003-2024
  - Óbitos por sexo e faixa etária (PR, último ano) ... Tabela 2654
  - Nascidos vivos por município/ano ... Tabela 2609 (v/217)
  - População estimada por município/ano ... Tabela 6579 (v/9324)

A versão anterior deste script apenas sondava APIs e o preprocess gerava
valores SIMULADOS (np.random) para vários indicadores. Tudo que não tem
fonte real foi removido do dashboard.
"""

import json
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; saude-parana/2.0; +https://github.com/avnergomes/saude-parana)"}

SIDRA = "https://apisidra.ibge.gov.br/values"

# Faixas quinquenais da classificação c260 da Tabela 2654 (nível 2),
# + "Menos de 1 ano" (nível 1). Os grupos 80+ são agregados no preprocess.
FAIXAS_OBITOS = "5922,5948,5953,5959,5966,5967,5968,5969,5970,5971,5972,5973,5974,5975,5976,5977,5978,5979,106181,106182,106183,5996"

DOWNLOADS = [
    (
        "obitos_municipios_pr.json",
        f"{SIDRA}/t/2654/n6/in%20n3%2041/v/343/p/all/c244/0/c1836/0/c2/0/c260/0/c257/0",
        "Óbitos por município/ano (Registro Civil, t2654)",
    ),
    (
        "obitos_piramide_pr.json",
        f"{SIDRA}/t/2654/n3/41/v/343/p/last%201/c244/0/c1836/0/c2/4,5/c260/{FAIXAS_OBITOS}/c257/0",
        "Óbitos por sexo e faixa etária — PR, último ano (t2654)",
    ),
    (
        "nascidos_municipios_pr.json",
        f"{SIDRA}/t/2609/n6/in%20n3%2041/v/217/p/all/c232/0/c240/0/c2/0",
        "Nascidos vivos por município/ano (Registro Civil, t2609)",
    ),
    (
        "populacao_anos_pr.json",
        f"{SIDRA}/t/6579/n6/in%20n3%2041/v/9324/p/all",
        "População estimada por município/ano (t6579)",
    ),
]


def fetch_sidra(url: str, description: str) -> list:
    """Busca uma consulta SIDRA e devolve as linhas (sem o cabeçalho)."""
    print(f"Baixando: {description}")
    for tentativa in range(1, 4):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=300)
            resp.raise_for_status()
            data = resp.json()
            if not data or len(data) <= 1:
                raise ValueError("resposta vazia ou só cabeçalho")
            print(f"  OK: {len(data) - 1} registros")
            return data[1:]
        except Exception as exc:
            print(f"  tentativa {tentativa}/3 falhou: {exc}")
            if tentativa < 3:
                time.sleep(15 * tentativa)
    return []


def main():
    print("=" * 60)
    print("Saúde Paraná — download de dados reais (IBGE)")
    print("=" * 60)

    falhas = []
    for filename, url, description in DOWNLOADS:
        rows = fetch_sidra(url, description)
        if rows:
            dest = RAW_DIR / filename
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False)
            print(f"  Salvo: {dest.name} ({dest.stat().st_size // 1024} KB)")
        else:
            falhas.append(filename)
        time.sleep(2)

    if falhas:
        # Falhar alto: seguir com dados parciais geraria um dashboard furado
        print(f"\nERRO: downloads sem dados: {', '.join(falhas)}")
        sys.exit(1)

    print("\nConcluído.")


if __name__ == "__main__":
    main()
