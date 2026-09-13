# -*- coding: utf-8 -*-
"""
ETL SIM: óbitos por município de residência e capítulo CID-10 (TabNet obt10pr.def).

Entrada: um POST por ano (arquivos obtprAA.dbf, 2010 até o mais recente listado
no formulário), Linha=Município, Coluna=Capítulo CID-10, Incremento=Óbitos p/Residênc.
Brutos: data/raw/tabnet/sim_<ano>.csv
Saída:  dashboard/public/data/mortalidade_cid.json

O ano de referência é o último ano com dados finais, lido da nota do rodapé
("Dados finais disponíveis até AAAA"); os anos seguintes são preliminares.
Somam-se apenas os 399 municípios (o "município ignorado" fica de fora).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import requests

from etl import common, tabnet

DOMINIO = "sim_cid"
SAIDA = "mortalidade_cid.json"

log = logging.getLogger("etl.sim_cid")


@dataclass(frozen=True)
class ConfigSim:
    def_path: str = "sim/cnv/obt10pr.def"
    ano_inicial: int = 2010
    ultimo_ano_final: int = 2024  # usado só se a nota do rodapé não for encontrada
    linha: str = "Município"
    coluna: str = "Capítulo_CID-10"
    incremento: str = "Óbitos_p/Residênc"


CONFIG = ConfigSim()

_RE_ARQUIVO = re.compile(r"^obtpr(\d{2})\.dbf$")
_RE_NOTA_FINAL = re.compile(r"Dados finais dispon[ií]veis at[ée] (\d{4})")


@dataclass(frozen=True)
class AnoSim:
    ano: int
    bruto: str
    tabela: dict[str, dict[str, int]]  # cod7 -> {"total", "I", ...}
    ano_final: int


# ── Formulário e campos ─────────────────────────────────────────────────

def anos_disponiveis(form_html: str, cfg: ConfigSim = CONFIG) -> dict[int, str]:
    """ano -> arquivo (obtprAA.dbf) a partir das opções do select Arquivos."""
    anos: dict[int, str] = {}
    for arquivo in tabnet.ler_opcoes(form_html, "Arquivos").values():
        achado = _RE_ARQUIVO.match(arquivo)
        if not achado:
            continue
        aa = int(achado.group(1))
        ano = 1900 + aa if aa >= 90 else 2000 + aa
        if ano >= cfg.ano_inicial:
            anos[ano] = arquivo
    if not anos:
        raise common.FonteIndisponivel("formulário do SIM sem arquivos obtprAA.dbf")
    return anos


def campos(arquivo: str, cfg: ConfigSim = CONFIG) -> dict[str, str]:
    """Corpo do POST para um ano (valores exatos das opções do formulário)."""
    return {
        "Linha": cfg.linha,
        "Coluna": cfg.coluna,
        "Incremento": cfg.incremento,
        "Arquivos": arquivo,
        "formato": "table",
        "mostre": "Mostra",
    }


def ano_final(texto_csv: str, cfg: ConfigSim = CONFIG) -> int:
    """Último ano com dados finais, pela nota do rodapé; senão o padrão da config."""
    achado = _RE_NOTA_FINAL.search(texto_csv)
    if not achado:
        log.warning("  SIM: nota 'dados finais disponíveis até' ausente no rodapé; "
                    "usando %d como último ano final (conferir o TabNet)", cfg.ultimo_ano_final)
        return cfg.ultimo_ano_final
    return int(achado.group(1))


# ── Download ────────────────────────────────────────────────────────────

def baixar_ano(http: requests.Session | None, ano: int, arquivo: str,
               mapa: dict[str, str], cfg: ConfigSim = CONFIG) -> tuple[tabnet.Bruto, AnoSim]:
    """Consulta um ano e devolve (bruto ainda não registrado, tabela do ano)."""
    texto = tabnet.consultar(cfg.def_path, campos(arquivo, cfg), http=http)
    registros = tabnet.parse_municipios(texto)
    bruto = tabnet.Bruto(
        f"tabnet/sim_{ano}.csv", texto,
        f"SIM/TabNet: óbitos por município de residência e capítulo CID-10, {ano}",
        tabnet.TABNET.url_tabulacao(cfg.def_path), len(registros),
    )
    tabela = tabnet.tabela_capitulos(registros, mapa)
    log.info("  SIM %d: %d municípios, %d óbitos", ano, len(tabela),
             sum(m["total"] for m in tabela.values()))
    return bruto, AnoSim(ano, bruto.arquivo, tabela, ano_final(texto, cfg))


# ── Montagem da saída ───────────────────────────────────────────────────

def montar_saida(anos: list[AnoSim], atualizacao: str) -> dict:
    """JSON do dashboard a partir das tabelas anuais (ordem determinística)."""
    tabelas = {a.ano: a.tabela for a in anos}
    codigos = {c for t in tabelas.values() for m in t.values() for c in m if c != "total"}
    capitulos = tabnet.capitulos_de(codigos)
    ordem = [c["codigo"] for c in capitulos]
    ultimo_final = max(a.ano_final for a in anos)
    finais = [ano for ano in tabelas if ano <= ultimo_final]
    ano_ref = max(finais) if finais else max(tabelas)
    preliminares = sorted(ano for ano in tabelas if ano > ano_ref)
    por_ano = [{"ano": ano, **tabnet.somar_capitulos(tabelas[ano], ordem)} for ano in sorted(tabelas)]
    por_municipio = {
        cod7: tabnet.completar_capitulos(m, ordem) for cod7, m in sorted(tabelas[ano_ref].items())
    }
    return {
        "metadata": {
            "fonte": "SIM/DATASUS via TabNet (obt10pr.def), óbitos por município de "
                     "residência e capítulo CID-10",
            "periodo": f"{min(tabelas)}-{max(tabelas)}",
            "preliminares": preliminares,
            "atualizacao": atualizacao,
            "nota": "Somatório dos 399 municípios do Paraná (exclui óbitos com município de "
                    "residência ignorado). Anos após o ano de referência são preliminares e "
                    "sujeitos a revisão; o recorte municipal usa o último ano com dados finais.",
        },
        "capitulos": capitulos,
        "porAno": por_ano,
        "porMunicipio": por_municipio,
        "anoReferencia": ano_ref,
    }


def executar(manifesto: dict) -> dict:
    """Baixa todos os anos, grava mortalidade_cid.json e devolve o novo manifesto."""
    http = common.sessao()
    form = tabnet.baixar_formulario(CONFIG.def_path, http=http)
    arquivos = anos_disponiveis(form)
    mapa = common.cod6_para_7()
    log.info("  SIM: %d anos (%d-%d), %d municípios no mapa",
             len(arquivos), min(arquivos), max(arquivos), len(mapa))
    anos: list[AnoSim] = []
    brutos: list[tabnet.Bruto] = []
    for ano, arquivo in sorted(arquivos.items()):
        bruto, dados = baixar_ano(http, ano, arquivo, mapa)
        brutos.append(bruto)
        anos.append(dados)
    manifesto = tabnet.registrar_brutos(manifesto, brutos)
    saida = montar_saida(anos, common.alterado_em(manifesto, [a.bruto for a in anos]))
    common.escrever_json(SAIDA, saida)
    log.info("  Referência %d; preliminares %s; %d municípios",
             saida["anoReferencia"], saida["metadata"]["preliminares"], len(saida["porMunicipio"]))
    return manifesto
