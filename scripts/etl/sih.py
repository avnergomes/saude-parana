# -*- coding: utf-8 -*-
"""
ETL SIH/SUS: internações por município de residência (TabNet nrpr.def).

Entrada: arquivos mensais nrprAAMM.dbf (Jan/2008 em diante), somados por ano em
um único POST (todos os meses disponíveis do ano no campo Arquivos). Por ano são
dois POSTs, ambos com Linha=Município:
  1. Coluna=Capítulo CID-10, Incremento=Internações      -> tabnet/sih_<ano>.csv
  2. Coluna=Não ativa, Incremento=Internações, Valor total, Óbitos
                                                          -> tabnet/sih_<ano>_totais.csv
Saída: dashboard/public/data/internacoes.json

O ano com menos de 12 competências é parcial; o ano de referência do recorte
municipal é o último ano completo. Taxa = internações por 1.000 habitantes
(população IBGE via common.populacao_municipal).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import requests

from etl import common, tabnet

DOMINIO = "sih"
SAIDA = "internacoes.json"

log = logging.getLogger("etl.sih")


@dataclass(frozen=True)
class ConfigSih:
    def_path: str = "sih/cnv/nrpr.def"
    ano_inicial: int = 2015
    linha: str = "Município"
    coluna_capitulos: str = "Capítulo_CID-10"
    coluna_inativa: str = "--Não-Ativa--"
    inc_internacoes: str = "Internações"
    inc_valor: str = "Valor_total"
    inc_obitos: str = "Óbitos"
    meses_por_ano: int = 12


CONFIG = ConfigSih()

# No SIH a 22ª categoria de capítulo é "CID 10ª Revisão não disponível ou não preenchido".
NOMES_CAPITULOS: dict[str, str] = {
    **tabnet.CAPITULOS_CID10,
    "XXII": "CID-10 não disponível ou não preenchido",
}

_RE_ARQUIVO = re.compile(r"^nrpr(\d{2})(\d{2})\.dbf$")


@dataclass(frozen=True)
class AnoSih:
    ano: int
    brutos: tuple[str, str]
    parcial: bool
    capitulos: dict[str, dict[str, int]]  # cod7 -> {"total", "I", ...}
    totais: dict[str, dict[str, float]]   # cod7 -> {"internacoes", "valor_total", "obitos"}


# ── Formulário e campos ─────────────────────────────────────────────────

def arquivos_por_ano(form_html: str, cfg: ConfigSih = CONFIG) -> dict[int, list[str]]:
    """ano -> arquivos mensais (ordem cronológica) a partir do select Arquivos."""
    meses: dict[int, dict[int, str]] = {}
    for arquivo in tabnet.ler_opcoes(form_html, "Arquivos").values():
        achado = _RE_ARQUIVO.match(arquivo)
        if not achado:
            continue
        ano, mes = 2000 + int(achado.group(1)), int(achado.group(2))
        if ano >= cfg.ano_inicial:
            meses.setdefault(ano, {})[mes] = arquivo
    if not meses:
        raise common.FonteIndisponivel("formulário do SIH sem arquivos nrprAAMM.dbf")
    return {ano: [m[mes] for mes in sorted(m)] for ano, m in sorted(meses.items())}


def ultima_competencia(arquivos: dict[int, list[str]]) -> str:
    """"AAAA-MM" do arquivo mais recente (ex.: nrpr2607.dbf -> "2026-07")."""
    ano = max(arquivos)
    mes = max(int(_RE_ARQUIVO.match(a).group(2)) for a in arquivos[ano])  # type: ignore[union-attr]
    return f"{ano}-{mes:02d}"


def campos_capitulos(arquivos: list[str], cfg: ConfigSih = CONFIG) -> dict[str, str | list[str]]:
    """POST 1: internações por município x capítulo CID-10, meses somados."""
    return {
        "Linha": cfg.linha,
        "Coluna": cfg.coluna_capitulos,
        "Incremento": cfg.inc_internacoes,
        "Arquivos": list(arquivos),
        "formato": "table",
        "mostre": "Mostra",
    }


def campos_totais(arquivos: list[str], cfg: ConfigSih = CONFIG) -> dict[str, str | list[str]]:
    """POST 2: internações, valor total e óbitos por município (coluna não ativa)."""
    return {
        "Linha": cfg.linha,
        "Coluna": cfg.coluna_inativa,
        "Incremento": [cfg.inc_internacoes, cfg.inc_valor, cfg.inc_obitos],
        "Arquivos": list(arquivos),
        "formato": "table",
        "mostre": "Mostra",
    }


# ── Agregação ───────────────────────────────────────────────────────────

def totais_por_municipio(registros: list[dict], mapa: dict[str, str],
                         cfg: ConfigSih = CONFIG) -> dict[str, dict[str, float]]:
    """cod7 -> {"internacoes", "valor_total", "obitos"}; "-" conta como 0."""
    totais: dict[str, dict[str, float]] = {}
    for r in registros:
        cod7 = mapa.get(r["cod6"] or "")
        if not cod7:
            continue
        totais[cod7] = {
            "internacoes": int(r.get(cfg.inc_internacoes) or 0),
            "valor_total": round(float(r.get(cfg.inc_valor) or 0), 2),
            "obitos": int(r.get(cfg.inc_obitos) or 0),
        }
    return totais


def taxa_estadual(totais: dict[str, dict[str, float]], pop: dict, ano: int) -> float | None:
    """Internações por 1.000 hab. somando só os municípios com população."""
    pares = [(m["internacoes"], common.populacao_de(pop, cod7, ano)) for cod7, m in totais.items()]
    numerador = sum(n for n, p in pares if p)
    denominador = sum(p for _, p in pares if p)
    return common.taxa(numerador, denominador)


def serie_por_ano(anos: list[AnoSih], pop: dict) -> list[dict]:
    """Série estadual: internações, valor total (R$), óbitos, taxa e flag parcial."""
    return [
        {
            "ano": a.ano,
            "internacoes": sum(m["internacoes"] for m in a.totais.values()),
            "valor_total": round(sum(m["valor_total"] for m in a.totais.values()), 2),
            "obitos": sum(m["obitos"] for m in a.totais.values()),
            "taxa": taxa_estadual(a.totais, pop, a.ano),
            "parcial": a.parcial,
        }
        for a in anos
    ]


def recorte_municipal(dados: AnoSih, pop: dict, ordem: list[str]) -> dict[str, dict]:
    """cod7 -> {"internacoes", "valor_total", "obitos", "taxa", "I", ...} do ano."""
    vazio = {"internacoes": 0, "valor_total": 0.0, "obitos": 0}
    recorte: dict[str, dict] = {}
    for cod7 in sorted(set(dados.totais) | set(dados.capitulos)):
        totais = dados.totais.get(cod7, vazio)
        capitulos = dados.capitulos.get(cod7, {})
        recorte[cod7] = {
            **totais,
            "taxa": common.taxa(totais["internacoes"], common.populacao_de(pop, cod7, dados.ano)),
            **{c: capitulos.get(c, 0) for c in ordem},
        }
    return recorte


# ── Download ────────────────────────────────────────────────────────────

def baixar_ano(http: requests.Session | None, ano: int, arquivos: list[str], manifesto: dict,
               mapa: dict[str, str], cfg: ConfigSih = CONFIG) -> tuple[dict, AnoSih]:
    """Dois POSTs do ano; registra os brutos e devolve (novo manifesto, dados)."""
    url = tabnet.TABNET.url_tabulacao(cfg.def_path)
    brutos = (f"tabnet/sih_{ano}.csv", f"tabnet/sih_{ano}_totais.csv")

    texto_cap = tabnet.consultar(cfg.def_path, campos_capitulos(arquivos, cfg), http=http)
    registros_cap = tabnet.parse_csv(texto_cap)
    manifesto = common.registrar_texto(
        manifesto, brutos[0], texto_cap,
        f"SIH/TabNet: internações por município de residência e capítulo CID-10, {ano}",
        url, linhas=len(registros_cap),
    )
    texto_tot = tabnet.consultar(cfg.def_path, campos_totais(arquivos, cfg), http=http)
    registros_tot = tabnet.parse_csv(texto_tot)
    manifesto = common.registrar_texto(
        manifesto, brutos[1], texto_tot,
        f"SIH/TabNet: internações, valor total e óbitos por município de residência, {ano}",
        url, linhas=len(registros_tot),
    )
    dados = AnoSih(
        ano=ano, brutos=brutos, parcial=len(arquivos) < cfg.meses_por_ano,
        capitulos=tabnet.tabela_capitulos(registros_cap, mapa),
        totais=totais_por_municipio(registros_tot, mapa, cfg),
    )
    log.info("  SIH %d (%d meses%s): %d municípios, %d internações", ano, len(arquivos),
             ", parcial" if dados.parcial else "", len(dados.totais),
             sum(m["internacoes"] for m in dados.totais.values()))
    return manifesto, dados


# ── Montagem da saída ───────────────────────────────────────────────────

def montar_saida(anos: list[AnoSih], pop: dict, competencia: str, atualizacao: str) -> dict:
    """JSON do dashboard a partir dos anos baixados (ordem determinística)."""
    anos = sorted(anos, key=lambda a: a.ano)
    codigos = {c for a in anos for m in a.capitulos.values() for c in m if c != "total"}
    capitulos = tabnet.capitulos_de(codigos, NOMES_CAPITULOS)
    ordem = [c["codigo"] for c in capitulos]
    completos = [a for a in anos if not a.parcial]
    referencia = completos[-1] if completos else anos[-1]
    parciais = [a.ano for a in anos if a.parcial]
    return {
        "metadata": {
            "fonte": "SIH/SUS via TabNet (nrpr.def), internações por município de residência",
            "periodo": f"{anos[0].ano}-{anos[-1].ano}",
            "ultimaCompetencia": competencia,
            "anoParcial": parciais[-1] if parciais else None,
            "atualizacao": atualizacao,
            "nota": "Competências mensais (arquivos nrprAAMM) somadas por ano; os últimos seis "
                    "meses estão sujeitos a atualização e o ano parcial cobre até a última "
                    "competência. Valor total em R$; taxa por 1.000 habitantes (população IBGE). "
                    "Somatório dos 399 municípios do Paraná.",
        },
        "capitulos": capitulos,
        "porAno": serie_por_ano(anos, pop),
        "porAnoCapitulo": [{"ano": a.ano, **tabnet.somar_capitulos(a.capitulos, ordem)} for a in anos],
        "porMunicipio": recorte_municipal(referencia, pop, ordem),
        "anoReferencia": referencia.ano,
    }


def executar(manifesto: dict) -> dict:
    """Baixa todos os anos, grava internacoes.json e devolve o novo manifesto."""
    http = common.sessao()
    form = tabnet.baixar_formulario(CONFIG.def_path, http=http)
    arquivos = arquivos_por_ano(form)
    competencia = ultima_competencia(arquivos)
    mapa = common.cod6_para_7()
    pop = common.populacao_municipal()
    log.info("  SIH: %d anos (%d-%d), última competência %s",
             len(arquivos), min(arquivos), max(arquivos), competencia)
    anos: list[AnoSih] = []
    for ano, lista in arquivos.items():
        manifesto, dados = baixar_ano(http, ano, lista, manifesto, mapa)
        anos.append(dados)
    brutos = [b for a in anos for b in a.brutos]
    saida = montar_saida(anos, pop, competencia, common.alterado_em(manifesto, brutos))
    common.escrever_json(SAIDA, saida)
    log.info("  Referência %d; ano parcial %s; %d municípios", saida["anoReferencia"],
             saida["metadata"]["anoParcial"], len(saida["porMunicipio"]))
    return manifesto
