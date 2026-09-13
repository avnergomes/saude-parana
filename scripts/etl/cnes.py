# -*- coding: utf-8 -*-
"""
ETL CNES: estabelecimentos de saúde e leitos hospitalares do Paraná.

Fontes (Portal de Dados Abertos do SUS, CC BY-ND 3.0): cnes_estabelecimentos_csv.zip
(CNES/DATASUS, CSV nacional de 230 MB lido em streaming e filtrado para CO_UF = 41),
Leitos_csv_<ano>.zip (Hospitais e Leitos, CGHID/MS, leitos existentes e SUS por
estabelecimento e competência mensal) e a API DEMAS de regiões de saúde por município.
Saída: dashboard/public/data/estabelecimentos.json (metadata, tipos, porMunicipio, pontos).

LGPD: o cadastro traz e-mail, telefone, CNPJ, endereço e nomes de pessoa física
(consultórios isolados). Nada disso vai para bruto versionado nem para a saída: brutos
textuais só com códigos e contagens, zip nacional fora do git (só o hash no manifesto),
pessoas físicas apenas nos agregados e "pontos" restrito a hospitais e pronto
atendimento institucionais (coordenada a 5 casas). Critério "sus": CO_AMBULATORIAL_SUS
= SIM ou leitos SUS > 0 na competência dos leitos (hospitais que só internam pelo SUS).
"""

from __future__ import annotations

import csv
import json
import logging
import zipfile
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import IO, Iterable, Iterator, Mapping, Sequence

import requests

from etl import common
from etl.cnes_tipos import CODIGOS, PONTOS, contar_tipos, grupo_de

DOMINIO = "cnes"
SAIDA = "estabelecimentos.json"

URL_CNES = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip"
URL_LEITOS = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/Leitos_SUS/Leitos_csv_{ano}.zip"
URL_REGIOES = ("https://apidadosabertos.saude.gov.br/macrorregiao-e-regiao-de-saude/municipio"
               "?sigla_uf=PR&limit=860")

FONTE = ("CNES/DATASUS, Portal de Dados Abertos do SUS (cnes_estabelecimentos_csv.zip); "
         "leitos: Hospitais e Leitos (CGHID/MS)")
NOTA = ("Estabelecimentos ativos (CO_MOTIVO_DESAB vazio) com município no Paraná, todos os "
        "tipos, incluindo consultórios de pessoa física (só em agregados). 'sus' = atendimento "
        "ambulatorial SUS (CO_AMBULATORIAL_SUS) ou leitos SUS na competência dos leitos. Leitos: "
        "CGHID/MS, por estabelecimento, somados por município. 'pontos' traz apenas hospitais e "
        "pronto atendimento com coordenada válida (5 casas). População: estimativa IBGE {ano_pop}.")
DESC_CNES = "CNES, cadastro nacional de estabelecimentos (zip; lido em streaming, só PR)"
DESC_LEITOS = "Leitos existentes e SUS por estabelecimento do PR (CGHID/MS), colunas reduzidas"
DESC_REGIOES = "Regiões e macrorregiões de saúde por município do PR (API DEMAS)"

COLUNAS_CNES = ("CO_CNES", "CO_UF", "CO_IBGE", "NO_RAZAO_SOCIAL", "NO_FANTASIA",
                "DS_ESFERA_ADMINISTRATIVA", "TP_UNIDADE", "NU_LATITUDE", "NU_LONGITUDE",
                "CO_NATUREZA_JUR", "CO_MOTIVO_DESAB", "CO_AMBULATORIAL_SUS")
COLUNAS_LEITOS = ("COMP", "UF", "CO_IBGE", "CNES", "CO_TIPO_UNIDADE", "MOTIVO_DESABILITACAO",
                  "LEITOS_EXISTENTES", "LEITOS_SUS", "UTI_TOTAL_EXIST", "UTI_TOTAL_SUS")
COLUNAS_LEITOS_BRUTO = tuple(c for c in COLUNAS_LEITOS if c != "UF")
CAMPOS_REGIAO = ("codigo_municipio", "municipio", "codigo_regiao_saude", "regiao_saude",
                 "codigo_macrorregiao_saude", "macrorregiao_saude")

log = logging.getLogger("etl.cnes")


@dataclass(frozen=True)
class Config:
    uf: str = "41"
    sigla_uf: str = "PR"
    arquivo_cnes: str = "cnes_estabelecimentos_csv.zip"
    arquivo_leitos_zip: str = "leitos_csv.zip"
    arquivo_leitos: str = "leitos_pr.csv"
    arquivo_regioes: str = "regioes_saude_pr.json"
    limite_texto_bruto: int = 2 << 20  # acima disso só o hash entra no manifesto
    lat: tuple[float, float] = (-27.0, -22.0)
    lon: tuple[float, float] = (-55.0, -48.0)
    casas_coordenada: int = 5


CONFIG = Config()


@dataclass(frozen=True)
class Estabelecimento:
    cnes: str  # 7 dígitos com zeros à esquerda
    cod_ibge: str  # 7 dígitos
    tipo: str  # família de cnes_tipos
    nome: str  # só hospitais e pronto atendimento institucionais; "" nos demais
    sus_ambulatorial: bool
    esfera: str
    pessoa_fisica: bool
    lat: float | None
    lon: float | None


@dataclass(frozen=True)
class Descartes:
    linhas_uf: int
    desativados: int
    municipio_desconhecido: int


@dataclass(frozen=True)
class Leito:
    cod_ibge6: str
    existentes: int
    sus: int


@dataclass(frozen=True)
class Leitos:
    competencia: str  # AAAAMM
    por_cnes: Mapping[str, Leito]  # só a última competência
    texto_bruto: str  # subconjunto da UF, colunas reduzidas, todas as competências
    linhas: int


# ── Leitura ─────────────────────────────────────────────────────────────

def decodificar_linhas(raw: IO[bytes]) -> Iterator[str]:
    """UTF-8 com fallback latin-1 por linha (CNES traz bytes soltos; leitos vem em latin-1)."""
    for linha in raw:
        try:
            yield linha.decode("utf-8-sig")
        except UnicodeDecodeError:
            yield linha.decode("latin-1")


def membro_csv(zf: zipfile.ZipFile) -> zipfile.ZipInfo:
    for info in zf.infolist():
        if info.filename.lower().endswith(".csv"):
            return info
    raise common.FonteIndisponivel(f"zip sem CSV: {zf.filename}")


def indices(cabecalho: list[str], colunas: tuple[str, ...]) -> dict[str, int]:
    faltam = [c for c in colunas if c not in cabecalho]
    if faltam:
        raise common.FonteIndisponivel(f"colunas ausentes no CSV: {faltam}")
    return {c: cabecalho.index(c) for c in colunas}


def coordenada(valor: str, faixa: tuple[float, float], casas: int) -> float | None:
    """Float arredondado ou None se vazio, inválido ou fora da faixa plausível."""
    try:
        numero = float(valor.strip().replace(",", "."))
    except ValueError:
        return None
    if not faixa[0] <= numero <= faixa[1]:
        return None
    return round(numero, casas)


def estabelecimento_de(linha: list[str], idx: Mapping[str, int], cod7: str,
                       cfg: Config) -> Estabelecimento:
    def campo(coluna: str) -> str:
        return linha[idx[coluna]].strip()
    tipo = grupo_de(campo("TP_UNIDADE"))
    pessoa_fisica = campo("CO_NATUREZA_JUR").startswith("4")
    publicavel = tipo in PONTOS and not pessoa_fisica
    return Estabelecimento(
        cnes=campo("CO_CNES").zfill(7), cod_ibge=cod7, tipo=tipo,
        nome=(campo("NO_FANTASIA") or campo("NO_RAZAO_SOCIAL")) if publicavel else "",
        sus_ambulatorial=campo("CO_AMBULATORIAL_SUS").upper() == "SIM",
        esfera=campo("DS_ESFERA_ADMINISTRATIVA"), pessoa_fisica=pessoa_fisica,
        lat=coordenada(campo("NU_LATITUDE"), cfg.lat, cfg.casas_coordenada),
        lon=coordenada(campo("NU_LONGITUDE"), cfg.lon, cfg.casas_coordenada),
    )


def ler_estabelecimentos(caminho_zip: Path, cod6_7: Mapping[str, str],
                         cfg: Config = CONFIG) -> tuple[tuple[Estabelecimento, ...], Descartes]:
    """Filtra em streaming o CSV nacional: só a UF, só ativos, só municípios conhecidos."""
    estabs: list[Estabelecimento] = []
    linhas_uf = desativados = desconhecidos = 0
    with zipfile.ZipFile(caminho_zip) as zf, zf.open(membro_csv(zf)) as raw:
        leitor = csv.reader(decodificar_linhas(raw), delimiter=";")
        cabecalho = next(leitor, [])
        idx = indices(cabecalho, COLUNAS_CNES)
        i_uf, i_desab, i_ibge = idx["CO_UF"], idx["CO_MOTIVO_DESAB"], idx["CO_IBGE"]
        for linha in leitor:
            if len(linha) != len(cabecalho) or linha[i_uf].strip() != cfg.uf:
                continue
            linhas_uf += 1
            if linha[i_desab].strip():
                desativados += 1
                continue
            cod7 = cod6_7.get(linha[i_ibge].strip())
            if cod7 is None:
                desconhecidos += 1
                continue
            estabs.append(estabelecimento_de(linha, idx, cod7, cfg))
    log.info("  CNES: %d linhas da UF %s; %d ativos; %d desativados; %d município desconhecido",
             linhas_uf, cfg.uf, len(estabs), desativados, desconhecidos)
    return tuple(estabs), Descartes(linhas_uf, desativados, desconhecidos)


def leitos_por_cnes(linhas: Iterable[Mapping[str, str]]) -> dict[str, Leito]:
    """Soma leitos por CNES (zero-padded), ignorando estabelecimentos desabilitados."""
    acumulado: dict[str, Leito] = {}
    for r in linhas:
        if r["MOTIVO_DESABILITACAO"]:
            continue
        cnes = r["CNES"].zfill(7)
        anterior = acumulado.get(cnes, Leito(r["CO_IBGE"], 0, 0))
        acumulado[cnes] = Leito(anterior.cod_ibge6,
                                anterior.existentes + int(float(r["LEITOS_EXISTENTES"] or 0)),
                                anterior.sus + int(float(r["LEITOS_SUS"] or 0)))
    return acumulado


def ler_leitos(caminho_zip: Path, cfg: Config = CONFIG) -> Leitos:
    """Subconjunto da UF sem colunas de contato/endereço; leitos por CNES na última competência."""
    with zipfile.ZipFile(caminho_zip) as zf, zf.open(membro_csv(zf)) as raw:
        leitor = csv.DictReader(decodificar_linhas(raw), delimiter=";")
        indices(list(leitor.fieldnames or []), COLUNAS_LEITOS)
        linhas = [{c: (r.get(c) or "").strip() for c in COLUNAS_LEITOS}
                  for r in leitor if (r.get("UF") or "").strip() == cfg.sigla_uf]
    if not linhas:
        raise common.FonteIndisponivel(f"leitos: nenhuma linha da UF {cfg.sigla_uf}")
    ordenadas = sorted(linhas, key=lambda r: (r["COMP"], r["CO_IBGE"], r["CNES"]))
    competencia = ordenadas[-1]["COMP"]
    por_cnes = leitos_por_cnes(r for r in ordenadas if r["COMP"] == competencia)
    texto = "\n".join([";".join(COLUNAS_LEITOS_BRUTO)]
                      + [";".join(r[c] for c in COLUNAS_LEITOS_BRUTO) for r in ordenadas]) + "\n"
    log.info("  Leitos: %d linhas da UF; competência %s, %d estab.", len(ordenadas), competencia,
             len(por_cnes))
    return Leitos(competencia, por_cnes, texto, len(ordenadas))


def baixar_leitos(http: requests.Session, ano: int,
                  cfg: Config = CONFIG) -> tuple[common.Download, str]:
    """Tenta o arquivo do ano corrente e, se não existir, o do ano anterior."""
    destino = common.RAW_DIR / cfg.arquivo_leitos_zip
    for candidato in (ano, ano - 1):
        url = URL_LEITOS.format(ano=candidato)
        try:
            return common.baixar_arquivo(url, destino, http=http), url
        except common.FonteIndisponivel as exc:
            log.warning("  leitos %d indisponível: %s", candidato, exc)
    raise common.FonteIndisponivel(f"leitos: nenhum arquivo para {ano} nem {ano - 1}")


def baixar_regioes(http: requests.Session, url: str = URL_REGIOES) -> tuple[dict[str, str], str]:
    """(cod_ibge(6) -> nome da região de saúde SESA, JSON canônico reduzido para o bruto)."""
    try:
        resp = http.get(url, timeout=60)
        resp.raise_for_status()
        dados = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise common.FonteIndisponivel(f"regiões de saúde: {exc}") from exc
    itens = dados.get("macrorregiao_regiao_saude_municipios") if isinstance(dados, dict) else dados
    if not itens:
        raise common.FonteIndisponivel("regiões de saúde: resposta vazia")
    reduzidos = sorted(({c: str(i.get(c, "")).strip() for c in CAMPOS_REGIAO} for i in itens),
                       key=lambda i: i["codigo_municipio"])
    mapa = {i["codigo_municipio"]: i["regiao_saude"] for i in reduzidos}
    log.info("  Regiões de saúde: %d municípios, %d regiões", len(mapa), len(set(mapa.values())))
    return mapa, json.dumps(reduzidos, ensure_ascii=False, indent=1) + "\n"


def data_competencia(download: common.Download) -> str:
    """Data do CSV dentro do zip (extração do CNES). O Last-Modified do S3 não
    serve: um reenvio dos mesmos bytes mudaria a saída sem mudança de dado."""
    with zipfile.ZipFile(download.caminho) as zf:
        return date(*membro_csv(zf).date_time[:3]).isoformat()


# ── Agregação ───────────────────────────────────────────────────────────

def atende_sus(e: Estabelecimento, leitos: Mapping[str, Leito]) -> bool:
    leito = leitos.get(e.cnes)
    return e.sus_ambulatorial or (leito is not None and leito.sus > 0)


def leitos_por_municipio(leitos: Mapping[str, Leito]) -> dict[str, tuple[int, int]]:
    """cod_ibge(6) -> (existentes, sus)."""
    soma: dict[str, tuple[int, int]] = {}
    for leito in leitos.values():
        total, sus = soma.get(leito.cod_ibge6, (0, 0))
        soma[leito.cod_ibge6] = (total + leito.existentes, sus + leito.sus)
    return soma


def linha_municipio(cod: str, info: Mapping[str, str], regioes: Mapping[str, str],
                    contagem: Mapping[str, int], leitos: tuple[int, int],
                    pop: Mapping, ano_pop: int) -> dict:
    populacao = common.populacao_de(pop, cod, ano_pop)
    return {
        "cod_ibge": cod, "municipio": info["nome"], "regional": info["regional"],
        "regiao_saude": regioes.get(cod[:6]),
        "total": contagem.get("total", 0), "sus": contagem.get("sus", 0),
        **{g: contagem.get(g, 0) for g in CODIGOS},
        "leitos_total": leitos[0], "leitos_sus": leitos[1], "populacao": populacao,
        "estab_por_10mil": common.taxa(contagem.get("total", 0), populacao, por=10_000),
        "leitos_sus_por_mil": common.taxa(leitos[1], populacao, por=1000),
    }


def agregar_municipios(estabs: Iterable[Estabelecimento], leitos: Leitos,
                       geo: Mapping[str, Mapping[str, str]], regioes: Mapping[str, str],
                       pop: Mapping, ano_pop: int) -> list[dict]:
    """Uma linha por município do geo_map (mesmo sem estabelecimento), total desc."""
    por_cod: dict[str, Counter] = {cod: Counter() for cod in geo}
    for e in estabs:
        contagem = por_cod.setdefault(e.cod_ibge, Counter())
        contagem["total"] += 1
        contagem[e.tipo] += 1
        contagem["sus"] += int(atende_sus(e, leitos.por_cnes))
    leitos_mun = leitos_por_municipio(leitos.por_cnes)
    saida = [linha_municipio(cod, geo[cod], regioes, por_cod[cod],
                             leitos_mun.get(cod[:6], (0, 0)), pop, ano_pop)
             for cod in geo]
    return sorted(saida, key=lambda m: (-m["total"], m["cod_ibge"]))


def montar_pontos(estabs: Iterable[Estabelecimento], leitos: Mapping[str, Leito]) -> list[dict]:
    """Só hospitais e pronto atendimento institucionais com coordenada válida."""
    pontos = []
    for e in estabs:
        if e.tipo not in PONTOS or e.pessoa_fisica or e.lat is None or e.lon is None:
            continue
        leito = leitos.get(e.cnes)
        pontos.append({
            "cnes": e.cnes, "nome": e.nome, "tipo": e.tipo, "cod_ibge": e.cod_ibge,
            "lat": e.lat, "lon": e.lon, "sus": atende_sus(e, leitos), "esfera": e.esfera,
            "leitos": leito.existentes if leito else None,
            "leitos_sus": leito.sus if leito else None,
        })
    return sorted(pontos, key=lambda p: (p["cod_ibge"], p["cnes"]))


def montar_saida(estabs: Sequence[Estabelecimento], descartes: Descartes, leitos: Leitos,
                 regioes: Mapping[str, str], competencia_cnes: str, atualizacao: str,
                 geo: Mapping[str, Mapping[str, str]], pop: Mapping) -> dict:
    ano_pop = max((ano for anos in pop.values() for ano in anos), default=date.today().year)
    return {
        "metadata": {
            "fonte": FONTE, "licenca": "CC BY-ND 3.0", "competenciaCnes": competencia_cnes,
            "competenciaLeitos": f"{leitos.competencia[:4]}-{leitos.competencia[4:6]}",
            "atualizacao": atualizacao,
            "descartados": {"desativados": descartes.desativados,
                            "municipioDesconhecido": descartes.municipio_desconhecido},
            "nota": NOTA.format(ano_pop=ano_pop),
        },
        "tipos": contar_tipos(e.tipo for e in estabs),
        "porMunicipio": agregar_municipios(estabs, leitos, geo, regioes, pop, ano_pop),
        "pontos": montar_pontos(estabs, leitos.por_cnes),
    }


# ── Orquestração ────────────────────────────────────────────────────────

def registrar_brutos(manifesto: dict, cnes: common.Download, descartes: Descartes,
                     leitos: Leitos, url_leitos: str, texto_regioes: str,
                     cfg: Config = CONFIG) -> dict:
    """Novo manifesto com o zip (só hash), o CSV reduzido de leitos e as regiões."""
    novo = common.registrar_hash(manifesto, cfg.arquivo_cnes, common.sha256_arquivo(cnes.caminho),
                                 DESC_CNES, URL_CNES, linhas=descartes.linhas_uf)
    if len(leitos.texto_bruto.encode("utf-8")) <= cfg.limite_texto_bruto:
        novo = common.registrar_texto(novo, cfg.arquivo_leitos, leitos.texto_bruto, DESC_LEITOS,
                                      url_leitos, linhas=leitos.linhas)
    else:
        novo = common.registrar_hash(novo, cfg.arquivo_leitos,
                                     common.sha256_texto(leitos.texto_bruto), DESC_LEITOS,
                                     url_leitos, linhas=leitos.linhas)
    return common.registrar_texto(novo, cfg.arquivo_regioes, texto_regioes, DESC_REGIOES,
                                  URL_REGIOES, linhas=len(json.loads(texto_regioes)))


def executar(manifesto: dict) -> dict:
    """Baixa CNES, leitos e regiões, processa e grava estabelecimentos.json."""
    cfg = CONFIG
    http = common.sessao()
    log.info("CNES: baixando %s", URL_CNES)
    cnes = common.baixar_arquivo(URL_CNES, common.RAW_DIR / cfg.arquivo_cnes, http=http)
    estabs, descartes = ler_estabelecimentos(cnes.caminho, common.cod6_para_7(), cfg)
    leitos_dl, url_leitos = baixar_leitos(http, date.today().year, cfg)
    leitos = ler_leitos(leitos_dl.caminho, cfg)
    regioes, texto_regioes = baixar_regioes(http)
    novo = registrar_brutos(manifesto, cnes, descartes, leitos, url_leitos, texto_regioes, cfg)
    atualizacao = common.alterado_em(
        novo, [cfg.arquivo_cnes, cfg.arquivo_leitos, cfg.arquivo_regioes])
    saida = montar_saida(estabs, descartes, leitos, regioes, data_competencia(cnes), atualizacao,
                         common.geo_municipios(), common.populacao_municipal())
    common.escrever_json(SAIDA, saida)
    log.info("  Tipos (PR): %s", ", ".join(f"{t['codigo']}={t['total']}" for t in saida["tipos"]))
    log.info("  Leitos (PR, %s): %d existentes, %d SUS; pontos: %d", leitos.competencia,
             sum(v.existentes for v in leitos.por_cnes.values()),
             sum(v.sus for v in leitos.por_cnes.values()), len(saida["pontos"]))
    return novo
