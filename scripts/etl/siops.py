# -*- coding: utf-8 -*-
"""
ETL SIOPS: indicadores municipais de financiamento da saúde (série histórica).

Entrada: TabNet do SIOPS (siops-asp.datasus.gov.br, mIndicadores.def), um POST
por ano (arquivos indmunAA.dbf, 2015 em diante) com Linha=Munic-BR, filtro
SUF=21 (Paraná) e Incremento=População + três indicadores:
  2.1_D.Total_Saúde/Hab            -> despesa_saude_hab   (R$ por habitante)
  3.2_%R.Próprios_em_Saúde-EC_29   -> pct_receita_propria (% aplicado, EC 29)
  R.Transf.SUS/Hab                 -> transf_sus_hab      (R$ por habitante)
Brutos: data/raw/tabnet/siops_<ano>.csv
Saída:  dashboard/public/data/financiamento.json

As médias estaduais são ponderadas pela população informada no próprio SIOPS
(a mesma usada nos indicadores per capita), o que reproduz o total estadual.
Município sem dado no ano de referência usa o seu ano mais recente (campo ano).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import requests

from etl import common, tabnet

DOMINIO = "siops"
SAIDA = "financiamento.json"

log = logging.getLogger("etl.siops")

SERVIDOR = tabnet.Servidor(host="http://siops-asp.datasus.gov.br", cgi="/CGI")


@dataclass(frozen=True)
class Indicador:
    codigo: str
    nome: str
    coluna: str  # valor exato da opção Incremento (e cabeçalho do CSV)


INDICADORES: tuple[Indicador, ...] = (
    Indicador("despesa_saude_hab", "Despesa total com saúde por habitante (R$)",
              "2.1_D.Total_Saúde/Hab"),
    Indicador("pct_receita_propria", "Receitas próprias aplicadas em saúde, EC 29 (%)",
              "3.2_%R.Próprios_em_Saúde-EC_29"),
    Indicador("transf_sus_hab", "Transferências SUS por habitante (R$)",
              "R.Transf.SUS/Hab"),
)


@dataclass(frozen=True)
class ConfigSiops:
    def_path: str = "SIOPS/serhist/municipio/mIndicadores.def"
    ano_inicial: int = 2015
    linha: str = "Munic-BR"
    coluna: str = "--Não-Ativa--"
    populacao: str = "População"
    filtro_uf: str = "SUF"
    uf_parana: str = "21"


CONFIG = ConfigSiops()

_RE_ARQUIVO = re.compile(r"^indmun(\d{2})\.dbf$")


@dataclass(frozen=True)
class AnoSiops:
    ano: int
    bruto: str
    tabela: dict[str, dict[str, float | None]]  # cod7 -> {"populacao", <codigo>: valor}


# ── Formulário e campos ─────────────────────────────────────────────────

def anos_disponiveis(form_html: str, cfg: ConfigSiops = CONFIG) -> dict[int, str]:
    """ano -> arquivo (indmunAA.dbf) a partir das opções do select Arquivos."""
    anos: dict[int, str] = {}
    for arquivo in tabnet.ler_opcoes(form_html, "Arquivos").values():
        achado = _RE_ARQUIVO.match(arquivo)
        if achado and 2000 + int(achado.group(1)) >= cfg.ano_inicial:
            anos[2000 + int(achado.group(1))] = arquivo
    if not anos:
        raise common.FonteIndisponivel("formulário do SIOPS sem arquivos indmunAA.dbf")
    return anos


def campos(arquivo: str, cfg: ConfigSiops = CONFIG) -> dict[str, str | list[str]]:
    """Corpo do POST de um ano (valores exatos das opções do formulário)."""
    return {
        "Linha": cfg.linha,
        "Coluna": cfg.coluna,
        "Incremento": [cfg.populacao, *(i.coluna for i in INDICADORES)],
        "Arquivos": arquivo,
        cfg.filtro_uf: cfg.uf_parana,
        "formato": "table",
        "mostre": "Mostra",
    }


# ── Agregação ───────────────────────────────────────────────────────────

def _valor(v: object) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


def valores_por_municipio(registros: list[dict], mapa: dict[str, str],
                          cfg: ConfigSiops = CONFIG) -> dict[str, dict[str, float | None]]:
    """cod7 -> {"populacao", "despesa_saude_hab", ...}; linhas fora do mapa saem."""
    tabela: dict[str, dict[str, float | None]] = {}
    for r in registros:
        cod7 = mapa.get(r["cod6"] or "")
        if not cod7:
            continue
        tabela[cod7] = {
            "populacao": _valor(r.get(cfg.populacao)),
            **{i.codigo: _valor(r.get(i.coluna)) for i in INDICADORES},
        }
    return tabela


def media_ponderada(tabela: dict[str, dict[str, float | None]], codigo: str) -> float | None:
    """Média do indicador ponderada pela população SIOPS (ignora ausentes)."""
    pares = [(m[codigo], m["populacao"]) for m in tabela.values()
             if m.get(codigo) is not None and m.get("populacao")]
    peso = sum(p for _, p in pares)
    if not peso:
        return None
    return round(sum(v * p for v, p in pares) / peso, 2)


def serie_por_ano(anos: list[AnoSiops]) -> list[dict]:
    """Série estadual: médias ponderadas de cada indicador por ano."""
    return [
        {"ano": a.ano, **{i.codigo: media_ponderada(a.tabela, i.codigo) for i in INDICADORES}}
        for a in sorted(anos, key=lambda a: a.ano)
    ]


def _tem_dado(municipio: dict[str, float | None]) -> bool:
    return any(municipio.get(i.codigo) is not None for i in INDICADORES)


def recorte_municipal(anos: list[AnoSiops], ano_ref: int) -> dict[str, dict]:
    """cod7 -> {"ano", indicadores} do ano de referência ou, sem dado nele, do
    ano mais recente em que o município aparece com algum indicador."""
    por_ano = {a.ano: a.tabela for a in anos}
    recorte: dict[str, dict] = {}
    for cod7 in sorted({c for t in por_ano.values() for c in t}):
        candidatos = [ano_ref, *sorted((a for a in por_ano if a != ano_ref), reverse=True)]
        ano = next((a for a in candidatos if _tem_dado(por_ano[a].get(cod7, {}))), None)
        if ano is None:
            log.warning("  SIOPS: município %s sem indicadores em nenhum ano; omitido", cod7)
            continue
        dados = por_ano[ano][cod7]
        recorte[cod7] = {"ano": ano, **{i.codigo: dados.get(i.codigo) for i in INDICADORES}}
    return recorte


# ── Download ────────────────────────────────────────────────────────────

def baixar_ano(http: requests.Session | None, ano: int, arquivo: str,
               mapa: dict[str, str], cfg: ConfigSiops = CONFIG) -> tuple[tabnet.Bruto, AnoSiops]:
    """Consulta um ano e devolve (bruto ainda não registrado, tabela do ano)."""
    texto = tabnet.consultar(cfg.def_path, campos(arquivo, cfg), servidor=SERVIDOR, http=http)
    registros = tabnet.parse_municipios(texto)
    bruto = tabnet.Bruto(
        f"tabnet/siops_{ano}.csv", texto,
        f"SIOPS/TabNet: indicadores municipais de financiamento da saúde, Paraná, {ano}",
        SERVIDOR.url_tabulacao(cfg.def_path), len(registros),
    )
    tabela = valores_por_municipio(registros, mapa, cfg)
    log.info("  SIOPS %d: %d municípios, despesa/hab média %s", ano, len(tabela),
             media_ponderada(tabela, INDICADORES[0].codigo))
    return bruto, AnoSiops(ano, bruto.arquivo, tabela)


# ── Montagem da saída ───────────────────────────────────────────────────

def montar_saida(anos: list[AnoSiops], atualizacao: str) -> dict:
    """JSON do dashboard a partir das tabelas anuais (ordem determinística)."""
    anos = sorted(anos, key=lambda a: a.ano)
    ano_ref = anos[-1].ano
    return {
        "metadata": {
            "fonte": "SIOPS/DATASUS via TabNet (mIndicadores.def), série histórica municipal",
            "periodo": f"{anos[0].ano}-{ano_ref}",
            "atualizacao": atualizacao,
            "nota": "Indicadores declarados pelos municípios ao SIOPS. Médias estaduais "
                    "ponderadas pela população informada no SIOPS. Município sem dado no ano "
                    "de referência usa o ano mais recente disponível (campo ano).",
        },
        "indicadores": [{"codigo": i.codigo, "nome": i.nome} for i in INDICADORES],
        "porAno": serie_por_ano(anos),
        "porMunicipio": recorte_municipal(anos, ano_ref),
        "anoReferencia": ano_ref,
    }


@contextmanager
def _sem_aviso_de_cabecalhos() -> Iterator[None]:
    """O servidor do SIOPS emite o DOCTYPE antes do fim dos cabeçalhos HTTP; o
    urllib3 registra um aviso com traceback, inofensivo, que fica oculto aqui."""
    loggers = [logging.getLogger(n) for n in ("urllib3.connection", "urllib3.connectionpool")]
    niveis = [lg.level for lg in loggers]
    for lg in loggers:
        lg.setLevel(logging.ERROR)
    try:
        yield
    finally:
        for lg, nivel in zip(loggers, niveis):
            lg.setLevel(nivel)


def executar(manifesto: dict) -> dict:
    """Baixa todos os anos, grava financiamento.json e devolve o novo manifesto."""
    http = common.sessao()
    with _sem_aviso_de_cabecalhos():
        form = tabnet.baixar_formulario(CONFIG.def_path, servidor=SERVIDOR, http=http)
    arquivos = anos_disponiveis(form)
    mapa = common.cod6_para_7()
    log.info("  SIOPS: %d anos (%d-%d)", len(arquivos), min(arquivos), max(arquivos))
    anos: list[AnoSiops] = []
    brutos: list[tabnet.Bruto] = []
    for ano, arquivo in sorted(arquivos.items()):
        with _sem_aviso_de_cabecalhos():
            bruto, dados = baixar_ano(http, ano, arquivo, mapa)
        brutos.append(bruto)
        anos.append(dados)
    manifesto = tabnet.registrar_brutos(manifesto, brutos)
    saida = montar_saida(anos, common.alterado_em(manifesto, [a.bruto for a in anos]))
    common.escrever_json(SAIDA, saida)
    log.info("  Referência %d; %d municípios", saida["anoReferencia"], len(saida["porMunicipio"]))
    return manifesto
