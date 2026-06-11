#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Preprocess do dashboard Saúde Paraná — SOMENTE DADOS REAIS.

Entrada (data/raw, gerada por download_data.py — API SIDRA/IBGE):
  - obitos_municipios_pr.json   óbitos por município/ano (Registro Civil t2654)
  - obitos_piramide_pr.json     óbitos por sexo e faixa etária, PR (t2654)
  - nascidos_municipios_pr.json nascidos vivos por município/ano (t2609)
  - populacao_anos_pr.json      população estimada por município/ano (t6579)

Saída (dashboard/public/data):
  - mortalidade.json
  - metadata.json
  (geo_map.json é um artefato estático já versionado, construído da malha IDR)

A versão anterior fabricava indicadores com np.random (taxas municipais,
vacinação, leitos, repasses, Previne Brasil) rotulados como DATASUS — tudo
isso foi removido do dashboard até existir ingestão real.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PUBLIC_DATA_DIR = BASE_DIR / "dashboard" / "public" / "data"
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Mapeamento das faixas do Registro Civil para as faixas da pirâmide
FAIXA_MAP = {
    "Menos de 1 ano": "0-4",
    "1 a 4 anos": "0-4",
    "5 a 9 anos": "5-9",
    "10 a 14 anos": "10-14",
    "15 a 19 anos": "15-19",
    "20 a 24 anos": "20-24",
    "25 a 29 anos": "25-29",
    "30 a 34 anos": "30-34",
    "35 a 39 anos": "35-39",
    "40 a 44 anos": "40-44",
    "45 a 49 anos": "45-49",
    "50 a 54 anos": "50-54",
    "55 a 59 anos": "55-59",
    "60 a 64 anos": "60-64",
    "65 a 69 anos": "65-69",
    "70 a 74 anos": "70-74",
    "75 a 79 anos": "75-79",
    "80 a 84 anos": "80+",
    "85 a 89 anos": "80+",
    "90 a 94 anos": "80+",
    "95 a 99 anos": "80+",
    "100 anos ou mais": "80+",
}

FAIXAS_ORDEM = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
    "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
    "65-69", "70-74", "75-79", "80+",
]


def load_raw(name: str) -> list:
    path = RAW_DIR / name
    if not path.exists():
        print(f"ERRO: {path} não encontrado — rode scripts/download_data.py antes.")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def parse_valor(v) -> int | None:
    if v in ("-", "...", "X", None, ""):
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def build_populacao(rows: list) -> dict:
    """cod_ibge(7) -> {ano -> populacao} a partir da t6579."""
    pop: dict[str, dict[int, int]] = {}
    for r in rows:
        cod = str(r.get("D1C", ""))
        ano = r.get("D3N") or r.get("D2N")
        val = parse_valor(r.get("V"))
        try:
            ano = int(ano)
        except (TypeError, ValueError):
            continue
        if not cod or val is None:
            continue
        pop.setdefault(cod, {})[ano] = val
    return pop


def populacao_de(pop: dict, cod: str, ano: int) -> int | None:
    """População do município no ano, com fallback para o ano mais próximo
    (a t6579 não cobre anos censitários como 2010 e 2022)."""
    by_year = pop.get(cod)
    if not by_year:
        return None
    if ano in by_year:
        return by_year[ano]
    closest = min(by_year.keys(), key=lambda y: abs(y - ano))
    return by_year[closest]


def main():
    print("=" * 60)
    print("Saúde Paraná — preprocess (somente dados reais)")
    print("=" * 60)

    obitos_rows = load_raw("obitos_municipios_pr.json")
    piramide_rows = load_raw("obitos_piramide_pr.json")
    nascidos_rows = load_raw("nascidos_municipios_pr.json")
    pop = build_populacao(load_raw("populacao_anos_pr.json"))

    # Regional IDR de cada município (geo_map.json é um artefato estático real)
    regional_por_cod: dict[str, str] = {}
    geo_map_path = PUBLIC_DATA_DIR / "geo_map.json"
    if geo_map_path.exists():
        with open(geo_map_path, encoding="utf-8") as f:
            geo_map = json.load(f)
        for regional, municipios in (geo_map.get("municipiosPorRegional") or {}).items():
            for m in municipios:
                regional_por_cod[str(m.get("cod_ibge"))] = regional

    # ── Óbitos por município/ano ────────────────────────────────────────
    por_municipio_ano: dict[str, dict[int, dict]] = {}
    nomes: dict[str, str] = {}
    anos = set()

    for r in obitos_rows:
        cod = str(r.get("D1C", ""))
        nome = str(r.get("D1N", "")).replace(" - PR", "")
        val = parse_valor(r.get("V"))
        try:
            ano = int(r.get("D3N"))
        except (TypeError, ValueError):
            continue
        if not cod or val is None:
            continue
        nomes[cod] = nome
        anos.add(ano)
        por_municipio_ano.setdefault(cod, {})[ano] = {"obitos": val}

    anos = sorted(anos)
    ano_min, ano_max = anos[0], anos[-1]
    print(f"  Óbitos: {len(por_municipio_ano)} municípios, {ano_min}-{ano_max}")

    # ── Série estadual (porAno) com taxa bruta real ─────────────────────
    por_ano = []
    for ano in anos:
        total = sum(d[ano]["obitos"] for d in por_municipio_ano.values() if ano in d)
        pop_total = sum(
            populacao_de(pop, cod, ano) or 0 for cod in por_municipio_ano
        )
        por_ano.append({
            "ano": ano,
            "total": total,
            "taxa_bruta": round(total / pop_total * 1000, 2) if pop_total else None,
        })

    # ── Recorte municipal do último ano (mapa/ranking) ──────────────────
    por_municipio = []
    for cod, by_year in por_municipio_ano.items():
        ano_ref = ano_max if ano_max in by_year else max(by_year.keys())
        obitos = by_year[ano_ref]["obitos"]
        populacao = populacao_de(pop, cod, ano_ref)
        por_municipio.append({
            "cod_ibge": cod,
            "nome": nomes.get(cod, cod),
            "municipio": nomes.get(cod, cod),
            "regional": regional_por_cod.get(cod, "-"),
            "ano": ano_ref,
            "obitos": obitos,
            "populacao": populacao,
            "taxa": round(obitos / populacao * 1000, 2) if populacao else None,
        })
    por_municipio.sort(key=lambda m: m["obitos"], reverse=True)

    # ── Pirâmide etária de óbitos (estado, último ano da tabela) ────────
    piramide_acc: dict[str, dict[str, int]] = {
        f: {"homens": 0, "mulheres": 0} for f in FAIXAS_ORDEM
    }
    piramide_ano = None
    for r in piramide_rows:
        faixa = FAIXA_MAP.get(str(r.get("D5N", "")).strip())
        sexo = str(r.get("D4N", ""))
        val = parse_valor(r.get("V"))
        try:
            piramide_ano = int(r.get("D3N"))
        except (TypeError, ValueError):
            pass
        if not faixa or val is None:
            continue
        if sexo == "Homens":
            piramide_acc[faixa]["homens"] += val
        elif sexo == "Mulheres":
            piramide_acc[faixa]["mulheres"] += val

    # Convenção do PyramidChart: homens negativos (lado esquerdo)
    piramide = [
        {"faixa": f, "homens": -acc["homens"], "mulheres": acc["mulheres"]}
        for f, acc in piramide_acc.items()
    ]

    # ── Nascidos vivos por ano (estado) ─────────────────────────────────
    nascidos_por_municipio_ano: dict[str, dict[int, int]] = {}
    for r in nascidos_rows:
        cod = str(r.get("D1C", ""))
        val = parse_valor(r.get("V"))
        try:
            ano = int(r.get("D3N"))
        except (TypeError, ValueError):
            continue
        if not cod or val is None:
            continue
        nascidos_por_municipio_ano.setdefault(cod, {})[ano] = val

    nascidos_por_ano = []
    for ano in anos:
        total = sum(d.get(ano, 0) for d in nascidos_por_municipio_ano.values())
        if total > 0:
            nascidos_por_ano.append({"ano": ano, "total": total})

    # ── mortalidade.json ────────────────────────────────────────────────
    mortalidade = {
        "metadata": {
            "fonte": "IBGE — Estatísticas do Registro Civil (Tabela 2654); nascidos vivos: Tabela 2609; população: Tabela 6579",
            "periodo": f"{ano_min}-{ano_max}",
            "piramideAno": piramide_ano,
            "atualizacao": datetime.now().strftime("%Y-%m-%d"),
        },
        "porAno": por_ano,
        "porMunicipio": por_municipio,
        "porMunicipioAno": por_municipio_ano,
        "piramideEtaria": piramide,
        "nascidosPorAno": nascidos_por_ano,
    }
    out = PUBLIC_DATA_DIR / "mortalidade.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(mortalidade, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Salvo: mortalidade.json ({out.stat().st_size // 1024} KB)")

    # ── metadata.json ───────────────────────────────────────────────────
    metadata = {
        "dashboard": {
            "nome": "Saude Parana",
            "versao": "2.0.0",
            "atualizacao": datetime.now().strftime("%Y-%m-%d"),
        },
        "dados": {
            "mortalidade": {
                "fonte": "IBGE — Estatísticas do Registro Civil",
                "periodo": f"{ano_min}-{ano_max}",
            },
            "nascidos": {
                "fonte": "IBGE — Estatísticas do Registro Civil",
                "periodo": f"{ano_min}-{ano_max}",
            },
            "populacao": {
                "fonte": "IBGE — Estimativas de População (t6579)",
                "periodo": f"{ano_min}-{ano_max}",
            },
        },
        "geografia": {"estado": "Parana", "municipios": len(por_municipio_ano), "regionaisIdr": 23},
        "filtros": {
            "anosDisponiveis": anos,
            "anoMin": ano_min,
            "anoMax": ano_max,
        },
    }
    out = PUBLIC_DATA_DIR / "metadata.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  Salvo: metadata.json")

    # ── Remover artefatos sintéticos de execuções antigas ───────────────
    for legado in ("internacoes.json", "vacinacao.json", "estabelecimentos.json",
                   "repasses_sus.json", "indicadores_ab.json"):
        p = PUBLIC_DATA_DIR / legado
        if p.exists():
            p.unlink()
            print(f"  Removido (dado simulado): {legado}")

    print("\nResumo:")
    print(f"  Municípios: {len(por_municipio_ano)}")
    print(f"  Período: {ano_min}-{ano_max}")
    print(f"  Óbitos {ano_max} (PR): {por_ano[-1]['total']:,}")
    if nascidos_por_ano:
        print(f"  Nascidos vivos {nascidos_por_ano[-1]['ano']} (PR): {nascidos_por_ano[-1]['total']:,}")


if __name__ == "__main__":
    main()
