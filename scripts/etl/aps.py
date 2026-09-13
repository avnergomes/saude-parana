# -*- coding: utf-8 -*-
"""
ETL da cobertura potencial da Atenção Primária à Saúde (APS) no Paraná.

Fonte: Ministério da Saúde/SAPS, Relatórios e-Gestor AB, backend interno
`relatorioaps-prd.saude.gov.br` (API não documentada; método da nota técnica
NT 02/2025 SAPS). Uma chamada GET por ano (competências 01..12), de 2021 até
o mês atual. A cobertura potencial da API pode passar de 100% (capacidade das
equipes maior que a população); aqui ela é limitada a 100%, como no relatório
oficial.

Saída: dashboard/public/data/atencao_primaria.json
Brutos: data/raw/aps/cobertura_<ano>.json (resposta da API, um por ano)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date

import requests

from etl import common
from etl.common import FonteIndisponivel

DOMINIO = "aps"
SAIDA = "atencao_primaria.json"

FONTE = ("Ministério da Saúde/SAPS, Relatórios e-Gestor AB "
         "(cobertura potencial da APS, NT 02/2025)")
NOTA = ("API interna não documentada; cobertura potencial = capacidade das equipes / "
        "população, limitada a 100%")

log = logging.getLogger("etl.aps")


@dataclass(frozen=True)
class ConfigAps:
    url: str = "https://relatorioaps-prd.saude.gov.br/cobertura/aps"
    co_uf: str = "41"
    ano_inicio: int = 2021
    timeout: int = 180
    teto_cobertura: float = 100.0


CONFIG = ConfigAps()

VAZIO: dict[str, None] = {
    "cobertura": None, "esf": None, "eap": None, "capacidade": None, "populacao": None,
}


# ── Download ────────────────────────────────────────────────────────────

def url_ano(cfg: ConfigAps, ano: int, mes_fim: int) -> str:
    return (f"{cfg.url}?unidadeGeografica=MUNICIPIO&coUf={cfg.co_uf}"
            f"&nuCompInicio={ano}01&nuCompFim={ano}{mes_fim:02d}")


def anos_e_meses(cfg: ConfigAps, hoje: date) -> list[tuple[int, int]]:
    """[(ano, mês final)] de ano_inicio até o mês atual."""
    return [(ano, 12 if ano < hoje.year else hoje.month)
            for ano in range(cfg.ano_inicio, hoje.year + 1)]


def baixar_ano(http: requests.Session, cfg: ConfigAps, ano: int,
               mes_fim: int) -> tuple[str, list[dict]]:
    """Baixa as competências de um ano; devolve (texto bruto UTF-8, registros)."""
    url = url_ano(cfg, ano, mes_fim)
    try:
        resp = http.get(url, timeout=cfg.timeout)
        resp.raise_for_status()
        texto = resp.content.decode("utf-8")
        dados = json.loads(texto)
    except (requests.RequestException, UnicodeDecodeError, ValueError) as exc:
        raise FonteIndisponivel(f"APS {ano}: {exc}") from exc
    if not isinstance(dados, list):
        raise FonteIndisponivel(f"APS {ano}: resposta inesperada ({type(dados).__name__})")
    log.info("  APS %d: %d registros", ano, len(dados))
    return texto, dados


def baixar_tudo(manifesto: dict, cfg: ConfigAps,
                hoje: date) -> tuple[dict, list[dict], list[str]]:
    """Baixa todos os anos e registra cada resposta no manifesto.
    Devolve (novo manifesto, registros de todos os anos, nomes dos brutos)."""
    http = common.sessao()
    registros: list[dict] = []
    arquivos: list[str] = []
    for ano, mes_fim in anos_e_meses(cfg, hoje):
        texto, dados = baixar_ano(http, cfg, ano, mes_fim)
        arquivo = f"aps/cobertura_{ano}.json"
        # Só o hash entra no manifesto: cada ano tem ~2,7 MB e o ano corrente
        # mudaria todo mês, inflando o repositório sem ganho (a saída
        # atencao_primaria.json é o que importa).
        manifesto = common.registrar_texto(
            manifesto, arquivo, texto,
            f"Cobertura potencial da APS por município do PR, {ano} (e-Gestor AB)",
            url_ano(cfg, ano, mes_fim), linhas=len(dados), persistir=False)
        registros = registros + dados
        arquivos = arquivos + [arquivo]
    return manifesto, registros, arquivos


# ── Normalização ────────────────────────────────────────────────────────

def competencia_iso(nu_comp: str) -> str:
    """'07/2026' -> '2026-07'."""
    mes, ano = nu_comp.strip().split("/")
    return f"{ano}-{int(mes):02d}"


def cobertura_limitada(valor: float | None, teto: float) -> float | None:
    """Cobertura em %, limitada ao teto (100%) e com 1 casa decimal."""
    if valor is None:
        return None
    return round(min(float(valor), teto), 1)


def normalizar_registro(r: dict, teto: float) -> dict:
    return {
        "cobertura": cobertura_limitada(r.get("qtCobertura"), teto),
        "esf": int(r.get("qtEsf") or 0),
        "eap": int(r.get("qtEap20") or 0) + int(r.get("qtEap30") or 0),
        "capacidade": int(r.get("qtCapacidadeEquipe") or 0),
        "populacao": int(r.get("qtPopulacao") or 0),
    }


def normalizar(registros: list[dict], cod6_para_7: dict[str, str],
               teto: float) -> tuple[dict[str, dict[str, dict]], dict]:
    """Devolve ({competência ISO: {cod7: registro normalizado}}, descartados)."""
    por_comp: dict[str, dict[str, dict]] = {}
    nao_mapeados: set[str] = set()
    sem_cobertura: set[str] = set()
    for r in registros:
        cod6 = str(r.get("coMunicipioIbge") or "")
        cod7 = cod6_para_7.get(cod6)
        if cod7 is None:
            nao_mapeados.add(cod6)
            continue
        comp = competencia_iso(str(r["nuComp"]))
        if r.get("qtCobertura") is None:
            sem_cobertura.add(f"{comp}:{cod7}")
        por_comp.setdefault(comp, {})[cod7] = normalizar_registro(r, teto)
    descartados = {"codigosNaoMapeados": sorted(nao_mapeados),
                   "semCobertura": sorted(sem_cobertura)}
    return por_comp, descartados


# ── Agregações ──────────────────────────────────────────────────────────

def cobertura_ponderada(municipios: dict[str, dict]) -> float | None:
    """Média ponderada pela população, só dos municípios com cobertura."""
    validos = [m for m in municipios.values()
               if m["cobertura"] is not None and m["populacao"]]
    pop = sum(m["populacao"] for m in validos)
    if not pop:
        return None
    coberta = sum(m["cobertura"] / 100 * m["populacao"] for m in validos)
    return round(coberta / pop * 100, 1)


def build_por_mes(por_comp: dict[str, dict[str, dict]]) -> list[dict]:
    """Série estadual mensal: cobertura ponderada, equipes ESF e população."""
    return [{
        "competencia": comp,
        "cobertura": cobertura_ponderada(muns),
        "esf": sum(m["esf"] for m in muns.values()),
        "populacao": sum(m["populacao"] for m in muns.values()),
    } for comp, muns in sorted(por_comp.items())]


def build_por_municipio(por_comp: dict[str, dict[str, dict]], competencia: str,
                        codigos: list[str]) -> dict[str, dict]:
    """Recorte da competência; município ausente na API sai com valores nulos."""
    muns = por_comp.get(competencia, {})
    return {cod: dict(muns.get(cod, VAZIO)) for cod in sorted(codigos)}


def build_por_municipio_ano(por_comp: dict[str, dict[str, dict]]) -> dict[str, dict[str, float]]:
    """Última cobertura não nula de cada ano (dezembro ou último mês disponível)."""
    out: dict[str, dict[str, float | None]] = {}
    for comp in sorted(por_comp):
        ano = comp[:4]
        for cod, m in por_comp[comp].items():
            anos = out.setdefault(cod, {})
            if m["cobertura"] is not None or ano not in anos:
                anos[ano] = m["cobertura"]
    return {cod: dict(out[cod]) for cod in sorted(out)}


# ── Saída ───────────────────────────────────────────────────────────────

def montar_saida(por_comp: dict[str, dict[str, dict]], descartados: dict,
                 geo: dict[str, dict], atualizacao: str) -> dict:
    comps = sorted(por_comp)
    competencia = comps[-1]
    ausentes = {cod: geo[cod]["nome"] for cod in sorted(geo)
                if cod not in por_comp[competencia]}
    return {
        "metadata": {
            "fonte": FONTE,
            "periodo": f"{comps[0]}..{competencia}",
            "competencia": competencia,
            "atualizacao": atualizacao,
            "descartados": {**descartados, "municipiosAusentesNaCompetencia": ausentes},
            "nota": NOTA,
        },
        "porMes": build_por_mes(por_comp),
        "porMunicipio": build_por_municipio(por_comp, competencia, list(geo)),
        "porMunicipioAno": build_por_municipio_ano(por_comp),
    }


def executar(manifesto: dict, cfg: ConfigAps = CONFIG, hoje: date | None = None) -> dict:
    """Baixa, processa e grava atencao_primaria.json; devolve o novo manifesto."""
    hoje = hoje or date.today()
    manifesto, registros, arquivos = baixar_tudo(manifesto, cfg, hoje)
    if not registros:
        raise FonteIndisponivel("APS: a API não devolveu registros")
    geo = common.geo_municipios()
    por_comp, descartados = normalizar(registros, common.cod6_para_7(), cfg.teto_cobertura)
    if not por_comp:
        raise FonteIndisponivel("APS: nenhum registro com município reconhecido")
    saida = montar_saida(por_comp, descartados, geo, common.alterado_em(manifesto, arquivos))
    common.escrever_json(SAIDA, saida)
    ultimo = saida["porMes"][-1]
    log.info("  APS %s: cobertura %s%% | %d ESF | %d municípios com dado | ausentes %s",
             ultimo["competencia"], ultimo["cobertura"], ultimo["esf"],
             len(por_comp[ultimo["competencia"]]),
             list(saida["metadata"]["descartados"]["municipiosAusentesNaCompetencia"].values()))
    return manifesto
