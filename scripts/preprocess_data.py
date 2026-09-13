#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Preprocess do dashboard Saúde Paraná, SOMENTE DADOS REAIS.

Entrada (data/raw, gerada por download_data.py, API SIDRA/IBGE):
  - obitos_municipios_pr.json     óbitos por município/ano (t2654, residência)
  - obitos_piramide_pr.json       óbitos por sexo e faixa etária, PR (t2654)
  - nascidos_municipios_pr.json   nascidos vivos registrados por município/ano (t2609)
  - populacao_anos_pr.json        população estimada por município/ano (t6579)
  - populacao_censo_*_pr.json     Contagem 2007 (t793), Censos 2010 (t1378)
                                  e 2022 (t4714)
  - _manifest.json                sha256 e data da última mudança de cada raw

Saída (dashboard/public/data):
  - mortalidade.json
  - metadata.json
  (geo_map.json é um artefato estático versionado, construído da malha IDR
   por dashboard/scripts/generate_geo_map.cjs)

Anos sem população oficial na t6579 (2007, 2010, 2022, 2023) são cobertos
pela Contagem/Censos quando existem e, no restante, por interpolação linear
entre os anos oficiais vizinhos. Os anos interpolados ficam registrados em
metadata.json (dados.populacao.interpolados).
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
MANIFEST_PATH = RAW_DIR / "_manifest.json"
PUBLIC_DATA_DIR = BASE_DIR / "dashboard" / "public" / "data"

ARQUIVOS_POPULACAO = (
    "populacao_anos_pr.json",
    "populacao_censo_2007_pr.json",
    "populacao_censo_2010_pr.json",
    "populacao_censo_2022_pr.json",
)
ANOS_CENSO = {"populacao_censo_2007_pr.json": 2007,
              "populacao_censo_2010_pr.json": 2010,
              "populacao_censo_2022_pr.json": 2022}

VERSAO_DASHBOARD = "2.1.0"

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

log = logging.getLogger("preprocess")


# ── Leitura ─────────────────────────────────────────────────────────────

def load_raw(name: str, obrigatorio: bool = True) -> list:
    path = RAW_DIR / name
    if not path.exists():
        if obrigatorio:
            log.error("ERRO: %s não encontrado. Rode scripts/download_data.py antes.", path)
            sys.exit(1)
        log.warning("  arquivo opcional ausente: %s", name)
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def parse_valor(v) -> int | None:
    if v in ("-", "...", "X", None, ""):
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def ano_de(r: dict) -> int | None:
    try:
        return int(r.get("D3N"))
    except (TypeError, ValueError):
        return None


def data_atualizacao() -> str:
    """Data da última mudança real dos dados brutos (manifesto); senão, hoje."""
    if MANIFEST_PATH.exists():
        manifesto = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        datas = [e.get("alterado_em") for e in manifesto.values() if e.get("alterado_em")]
        if datas:
            return max(datas)
    return date.today().isoformat()


def carregar_regionais() -> dict[str, str]:
    """cod_ibge(7) -> regional IDR, a partir do geo_map.json versionado."""
    geo_map_path = PUBLIC_DATA_DIR / "geo_map.json"
    if not geo_map_path.exists():
        return {}
    geo_map = json.loads(geo_map_path.read_text(encoding="utf-8"))
    return {
        str(m.get("cod_ibge")): regional
        for regional, municipios in (geo_map.get("municipiosPorRegional") or {}).items()
        for m in municipios
    }


# ── População ───────────────────────────────────────────────────────────

def build_populacao(fontes: list[list]) -> dict[str, dict[int, int]]:
    """cod_ibge(7) -> {ano -> população}, mesclando estimativas e censos."""
    pop: dict[str, dict[int, int]] = {}
    for rows in fontes:
        for r in rows:
            cod, ano, val = str(r.get("D1C", "")), ano_de(r), parse_valor(r.get("V"))
            if cod and ano is not None and val is not None:
                pop.setdefault(cod, {})[ano] = val
    return pop


def populacao_de(pop: dict, cod: str, ano: int) -> tuple[int | None, bool]:
    """(população, interpolado). Interpola linearmente entre os anos oficiais
    vizinhos; fora do intervalo coberto usa o ano oficial mais próximo."""
    by_year = pop.get(cod)
    if not by_year:
        return None, False
    if ano in by_year:
        return by_year[ano], False
    lower = max((y for y in by_year if y < ano), default=None)
    upper = min((y for y in by_year if y > ano), default=None)
    if lower is not None and upper is not None:
        frac = (ano - lower) / (upper - lower)
        return round(by_year[lower] + (by_year[upper] - by_year[lower]) * frac), True
    return by_year[lower if upper is None else upper], True


# ── Óbitos ──────────────────────────────────────────────────────────────

def build_obitos(rows: list) -> tuple[dict, dict, list[int]]:
    """Devolve (por_municipio_ano, nomes, anos ordenados)."""
    por_municipio_ano: dict[str, dict[int, dict]] = {}
    nomes: dict[str, str] = {}
    anos: set[int] = set()
    for r in rows:
        cod, ano, val = str(r.get("D1C", "")), ano_de(r), parse_valor(r.get("V"))
        if not cod or ano is None or val is None:
            continue
        nomes[cod] = str(r.get("D1N", "")).replace(" - PR", "")
        anos.add(ano)
        por_municipio_ano.setdefault(cod, {})[ano] = {"obitos": val}
    return por_municipio_ano, nomes, sorted(anos)


def anexar_populacao(por_municipio_ano: dict, pop: dict) -> tuple[dict, set[int]]:
    """Novo dict com população por município/ano + conjunto de anos interpolados."""
    interpolados: set[int] = set()
    out: dict[str, dict[int, dict]] = {}
    for cod, by_year in por_municipio_ano.items():
        out[cod] = {}
        for ano, dados in by_year.items():
            populacao, interpolado = populacao_de(pop, cod, ano)
            if interpolado:
                interpolados.add(ano)
            out[cod][ano] = {**dados, "populacao": populacao}
    return out, interpolados


def build_por_ano(por_municipio_ano: dict, anos: list[int]) -> list[dict]:
    """Série estadual com taxa bruta calculada com a população do próprio ano."""
    serie = []
    for ano in anos:
        registros = [d[ano] for d in por_municipio_ano.values() if ano in d]
        total = sum(d["obitos"] for d in registros)
        pop_total = sum(d["populacao"] or 0 for d in registros)
        serie.append({
            "ano": ano,
            "total": total,
            "taxa_bruta": round(total / pop_total * 1000, 2) if pop_total else None,
        })
    return serie


def build_por_municipio(por_municipio_ano: dict, nomes: dict,
                        regional_por_cod: dict, ano_max: int) -> list[dict]:
    """Recorte municipal do último ano (mapa/ranking)."""
    municipios = []
    for cod, by_year in por_municipio_ano.items():
        ano_ref = ano_max if ano_max in by_year else max(by_year)
        dados = by_year[ano_ref]
        populacao = dados["populacao"]
        municipios.append({
            "cod_ibge": cod,
            "nome": nomes.get(cod, cod),
            "municipio": nomes.get(cod, cod),
            "regional": regional_por_cod.get(cod, "-"),
            "ano": ano_ref,
            "obitos": dados["obitos"],
            "populacao": populacao,
            "taxa": round(dados["obitos"] / populacao * 1000, 2) if populacao else None,
        })
    return sorted(municipios, key=lambda m: m["obitos"], reverse=True)


def build_piramide(rows: list) -> tuple[list[dict], int | None]:
    """Pirâmide etária de óbitos do estado (último ano da tabela)."""
    acc = {f: {"homens": 0, "mulheres": 0} for f in FAIXAS_ORDEM}
    ano = None
    for r in rows:
        # SIDRA t2654: sexo em D6N, faixa etária em D7N (D4N/D5N são "Total").
        faixa = FAIXA_MAP.get(str(r.get("D7N", "")).strip())
        sexo = str(r.get("D6N", ""))
        val = parse_valor(r.get("V"))
        ano = ano_de(r) or ano
        if not faixa or val is None:
            continue
        if sexo == "Homens":
            acc[faixa]["homens"] += val
        elif sexo == "Mulheres":
            acc[faixa]["mulheres"] += val
    # Convenção do PyramidChart: homens negativos (lado esquerdo)
    piramide = [{"faixa": f, "homens": -v["homens"], "mulheres": v["mulheres"]}
                for f, v in acc.items()]
    return piramide, ano


# ── Nascidos vivos ──────────────────────────────────────────────────────

def build_nascidos(rows: list, anos: list[int]) -> list[dict]:
    """Nascidos vivos registrados no ano (estado), nos mesmos anos dos óbitos."""
    por_ano: dict[int, int] = {}
    for r in rows:
        cod, ano, val = str(r.get("D1C", "")), ano_de(r), parse_valor(r.get("V"))
        if cod and ano is not None and val is not None:
            por_ano[ano] = por_ano.get(ano, 0) + val
    return [{"ano": ano, "total": por_ano[ano]} for ano in anos if por_ano.get(ano, 0) > 0]


# ── Escrita ─────────────────────────────────────────────────────────────

def write_json(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    log.info("  Salvo: %s (%d KB)", path.name, path.stat().st_size // 1024)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    log.info("=" * 60)
    log.info("Saúde Paraná, preprocess (somente dados reais)")
    log.info("=" * 60)

    obitos_rows = load_raw("obitos_municipios_pr.json")
    piramide_rows = load_raw("obitos_piramide_pr.json")
    nascidos_rows = load_raw("nascidos_municipios_pr.json")
    fontes_pop = {nome: load_raw(nome, obrigatorio=(nome == ARQUIVOS_POPULACAO[0]))
                  for nome in ARQUIVOS_POPULACAO}
    censos = sorted(ANOS_CENSO[n] for n, rows in fontes_pop.items() if rows and n in ANOS_CENSO)

    pop = build_populacao(list(fontes_pop.values()))
    regional_por_cod = carregar_regionais()

    por_municipio_ano, nomes, anos = build_obitos(obitos_rows)
    por_municipio_ano, interpolados = anexar_populacao(por_municipio_ano, pop)
    ano_min, ano_max = anos[0], anos[-1]
    log.info("  Óbitos: %d municípios, %d-%d", len(por_municipio_ano), ano_min, ano_max)
    log.info("  População: censos %s; anos interpolados %s", censos, sorted(interpolados))

    por_ano = build_por_ano(por_municipio_ano, anos)
    por_municipio = build_por_municipio(por_municipio_ano, nomes, regional_por_cod, ano_max)
    piramide, piramide_ano = build_piramide(piramide_rows)
    nascidos_por_ano = build_nascidos(nascidos_rows, anos)
    atualizacao = data_atualizacao()

    mortalidade = {
        "metadata": {
            "fonte": "IBGE, Estatísticas do Registro Civil (t2654 óbitos; t2609 nascidos vivos "
                     "registrados); população: Estimativas (t6579), Contagem 2007 (t793), "
                     "Censos 2010 (t1378) e 2022 (t4714)",
            "periodo": f"{ano_min}-{ano_max}",
            "piramideAno": piramide_ano,
            "atualizacao": atualizacao,
        },
        "porAno": por_ano,
        "porMunicipio": por_municipio,
        "porMunicipioAno": por_municipio_ano,
        "piramideEtaria": piramide,
        "nascidosPorAno": nascidos_por_ano,
    }
    write_json(PUBLIC_DATA_DIR / "mortalidade.json", mortalidade)

    metadata = {
        "dashboard": {"nome": "Saude Parana", "versao": VERSAO_DASHBOARD, "atualizacao": atualizacao},
        "dados": {
            "mortalidade": {
                "fonte": "IBGE, Estatísticas do Registro Civil (t2654): óbitos ocorridos no ano, "
                         "por município de residência do falecido",
                "periodo": f"{ano_min}-{ano_max}",
            },
            "nascidos": {
                "fonte": "IBGE, Estatísticas do Registro Civil (t2609): nascidos vivos registrados "
                         "no ano, por município de residência da mãe",
                "periodo": f"{ano_min}-{ano_max}",
                "nota": "Inclui registros tardios de nascimentos de anos anteriores (cerca de 1% ao ano).",
            },
            "populacao": {
                "fonte": "IBGE, Estimativas de População (t6579); Contagem 2007 (t793); "
                         "Censos 2010 (t1378) e 2022 (t4714)",
                "periodo": f"{ano_min}-{ano_max}",
                "censos": censos,
                "interpolados": sorted(interpolados),
            },
        },
        "geografia": {"estado": "Parana", "municipios": len(por_municipio_ano), "regionaisIdr": 23},
        "filtros": {"anosDisponiveis": anos, "anoMin": ano_min, "anoMax": ano_max},
    }
    write_json(PUBLIC_DATA_DIR / "metadata.json", metadata)

    log.info("Resumo:")
    log.info("  Municípios: %d | Período: %d-%d | Atualização: %s",
             len(por_municipio_ano), ano_min, ano_max, atualizacao)
    log.info("  Óbitos %d (PR): %s | taxa bruta %s", ano_max,
             f"{por_ano[-1]['total']:,}", por_ano[-1]["taxa_bruta"])
    if nascidos_por_ano:
        log.info("  Nascidos vivos registrados %d (PR): %s",
                 nascidos_por_ano[-1]["ano"], f"{nascidos_por_ano[-1]['total']:,}")


if __name__ == "__main__":
    main()
