#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Consolida os CSVs reduzidos das 10 partes de Estabelecimentos (scripts/cnpj/filtrar.py)
em dashboard/public/data/cnpj_saude.json: agregados por município e classe CNAE.

Município: o campo MUNICIPIO do CNPJ é o código TOM da jurisdição fiscal, não
IBGE. A tabela oficial TOM -> IBGE (municipios.csv, gov.br/receitafederal) é
baixada, versionada em data/raw/cnpj/ e validada contra os 399 códigos do
geo_map.json. Se www.gov.br recusar o runner (como em 2026-09-14), vale a cópia
versionada, com aviso no log; sem cópia, é falha. No CSV o TOM vem sem zeros à
esquerda ('830'); no ESTABELE vem com 4 dígitos ('0830'): os dois lados são
normalizados antes do cruzamento.

Regras de contagem: estabelecimento de saúde = CNAE principal na divisão 86 ou
farmácia (4771-7/01 a 03); ativo = situação cadastral 02; as contagens por grupo
e as aberturas por ano consideram só ativos; saude_secundaria conta quem tem
saúde apenas em CNAE secundário (fora de ativos e dos grupos).

LGPD: entra e sai apenas agregado; nenhum CNPJ, nome ou contato chega a este
módulo (o CSV reduzido já não os tem).

metadata.descartados: tomNaoMapeado (TOM sem IBGE na tabela da Receita),
linhasInvalidas (linhas malformadas nas partes + linhas sem CNAE de saúde) e
partesRecebidas; servem para auditar perdas silenciosas.

Uso: python scripts/cnpj/consolidar.py --partes ./partes --pasta 2026-08 [--esperadas 10]
     [--fonte oficial|espelho] [--saida-dir DIR]  (ensaio: JSON, manifesto e brutos vão para DIR)
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import requests

if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cnpj import cnae, filtrar, webdav  # noqa: E402
from cnpj.filtrar import LinhaReduzida  # noqa: E402
from etl import common  # noqa: E402

SAIDA = "cnpj_saude.json"
URL_MUNICIPIOS = "https://www.gov.br/receitafederal/dados/municipios.csv"
ARQUIVO_MUNICIPIOS = "cnpj/municipios_tom_ibge.csv"
ARQUIVO_ESTABELECIMENTOS = "cnpj/estabelecimentos_pr_saude.csv"
CABECALHO_MUNICIPIOS = ("CÓDIGO DO MUNICÍPIO - TOM", "CÓDIGO DO MUNICÍPIO - IBGE",
                        "MUNICÍPIO - TOM", "MUNICÍPIO - IBGE", "UF")

FONTE = ("Receita Federal do Brasil, Dados Abertos do CNPJ (arquivo Estabelecimentos), "
         "competência {competencia}")
FONTE_ESPELHO = (", arquivos oficiais obtidos pelo espelho público da Casa dos Dados "
                 "(cópia sem alteração, conferida pela data de extração)")
CRITERIO = ("CNAE fiscal principal na divisão 86 (atenção à saúde humana) ou farmácias "
            "(4771-7/01 a 03); município pela jurisdição fiscal (código TOM) convertido para IBGE")
NOTA = ("Somente agregados por município e classe CNAE, sem nenhum dado individual (LGPD art. 12). "
        "Estabelecimento ativo = situação cadastral 02. Contagens por grupo, matrizes, filiais e "
        "aberturas por ano consideram só ativos; saude_secundaria conta estabelecimentos com "
        "saúde apenas em CNAE secundário (fora de ativos e dos grupos). População: estimativa "
        "IBGE {ano_pop}.")
DESC_MUNICIPIOS = "Tabela TOM -> IBGE de municípios (Receita Federal), Latin-1 convertida para UTF-8"
DESC_ESTABELECIMENTOS = ("CNPJ Estabelecimentos, PR e saúde, colunas reduzidas sem identificadores "
                         "(concatenação das 10 partes; só o hash entra no manifesto)")

PADRAO_COMPETENCIA = re.compile(r"^\d{4}-\d{2}$")
SITUACAO_ATIVA = "02"
MATRIZ, FILIAL = "1", "2"
TAMANHO_IBGE = 7
TAMANHO_DATA = 8

log = logging.getLogger("cnpj.consolidar")


@dataclass(frozen=True)
class Config:
    uf: str = "PR"
    esperadas: int = 10
    padrao_partes: str = "parte_*.csv"
    limite_tom_nao_mapeado: float = 0.01  # fração das linhas; acima disso é falha
    ano_inicial_aberturas: int = 2000


CONFIG = Config()


@dataclass(frozen=True)
class Partes:
    linhas: tuple[LinhaReduzida, ...]
    recebidas: int
    invalidas: int


@dataclass(frozen=True)
class Agregado:
    por_municipio: Mapping[str, Counter]  # cod_ibge(7) -> contagens
    aberturas: Mapping[int, Counter]  # ano de início -> {"total", grupo...}, só ativos
    totais: Counter  # ativos, inativos, matrizes, filiais
    tom_nao_mapeado: int
    linhas_invalidas: int


# ── Tabela TOM -> IBGE ──────────────────────────────────────────────────

def baixar_municipios(http: requests.Session, url: str = URL_MUNICIPIOS) -> str:
    """CSV oficial (Latin-1) como texto UTF-8 com quebras '\\n' normalizadas."""
    try:
        resp = http.get(url, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise common.FonteIndisponivel(f"municipios.csv: {exc}") from exc
    texto = resp.content.decode("latin-1").replace("\r\n", "\n").replace("\r", "\n")
    if not texto.startswith(CABECALHO_MUNICIPIOS[0]):
        raise common.FonteIndisponivel("municipios.csv: cabeçalho inesperado")
    return texto if texto.endswith("\n") else texto + "\n"


def obter_municipios(http: requests.Session) -> str:
    """Tabela TOM -> IBGE baixada agora ou, se o gov.br falhar, a cópia versionada
    em data/raw/cnpj/ (já em UTF-8). O mapa continua validado contra o geo_map."""
    try:
        return baixar_municipios(http)
    except common.FonteIndisponivel as exc:
        copia = common.RAW_DIR / ARQUIVO_MUNICIPIOS
        if not copia.exists():
            raise
        log.warning("  %s; usando a cópia versionada %s", exc, ARQUIVO_MUNICIPIOS)
        return copia.read_text(encoding="utf-8")


def normalizar_tom(tom: str) -> str:
    """'0830' e '830' são o mesmo código."""
    return tom.strip().lstrip("0") or "0"


def mapa_tom_ibge(texto: str, uf: str = "PR") -> dict[str, str]:
    """TOM normalizado -> IBGE de 7 dígitos, só da UF (descarta 'EXTERIOR', IBGE 0)."""
    leitor = csv.reader(io.StringIO(texto), delimiter=";")
    cabecalho = tuple(c.strip() for c in next(leitor, []))
    if cabecalho != CABECALHO_MUNICIPIOS:
        raise common.FonteIndisponivel(f"municipios.csv: cabeçalho {cabecalho}")
    mapa: dict[str, str] = {}
    for linha in leitor:
        if len(linha) != len(CABECALHO_MUNICIPIOS) or linha[4].strip() != uf:
            continue
        ibge = linha[1].strip()
        if len(ibge) == TAMANHO_IBGE and ibge.isdigit():
            mapa[normalizar_tom(linha[0])] = ibge
    return mapa


def validar_mapa(mapa: Mapping[str, str], geo: Mapping[str, Mapping[str, str]]) -> None:
    """Os IBGE da UF na tabela da Receita devem ser exatamente os do geo_map."""
    faltam = sorted(set(geo) - set(mapa.values()))
    sobram = sorted(set(mapa.values()) - set(geo))
    if faltam or sobram:
        raise common.FonteIndisponivel(
            f"TOM -> IBGE não cobre o geo_map: faltam {faltam[:5]}, sobram {sobram[:5]}")


# ── Leitura das partes ──────────────────────────────────────────────────

def linha_reduzida(campos: Sequence[str]) -> LinhaReduzida | None:
    if len(campos) != len(filtrar.CABECALHO):
        return None
    secundarias = tuple(c for c in campos[4].split(filtrar.SEPARADOR_SECUNDARIAS) if c)
    return LinhaReduzida(campos[0], campos[1], campos[2], campos[3], secundarias, campos[5])


def ler_parte(caminho: Path) -> tuple[tuple[LinhaReduzida, ...], int]:
    """(linhas válidas, linhas inválidas); cabeçalho diferente do contrato é falha."""
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.reader(f, delimiter=filtrar.SEPARADOR)
        cabecalho = tuple(next(leitor, []))
        if cabecalho != filtrar.CABECALHO:
            raise common.FonteIndisponivel(f"{caminho.name}: cabeçalho {cabecalho}")
        convertidas = [linha_reduzida(campos) for campos in leitor]
    validas = tuple(l for l in convertidas if l is not None)
    return validas, len(convertidas) - len(validas)


def ler_partes(pasta: Path, cfg: Config = CONFIG) -> Partes:
    arquivos = sorted(pasta.glob(cfg.padrao_partes))
    if len(arquivos) < cfg.esperadas:
        raise common.FonteIndisponivel(
            f"{len(arquivos)} partes em {pasta}, esperadas {cfg.esperadas}: "
            f"{[a.name for a in arquivos]}")
    linhas: list[LinhaReduzida] = []
    invalidas = 0
    for arquivo in arquivos:
        validas, ruins = ler_parte(arquivo)
        linhas.extend(validas)
        invalidas += ruins
        log.info("  %s: %d linhas, %d inválidas", arquivo.name, len(validas), ruins)
    return Partes(tuple(linhas), len(arquivos), invalidas)


# ── Agregação ───────────────────────────────────────────────────────────

def ano_de(data_inicio: str) -> int | None:
    return int(data_inicio[:4]) if len(data_inicio) == TAMANHO_DATA and data_inicio.isdigit() else None


def contabilizar_ativo(linha: LinhaReduzida, grupo: str, contagem: Counter,
                       aberturas: dict[int, Counter], totais: Counter) -> None:
    contagem["ativos"] += 1
    contagem[grupo] += 1
    totais["ativos"] += 1
    if linha.matriz_filial == MATRIZ:
        totais["matrizes"] += 1
    elif linha.matriz_filial == FILIAL:
        totais["filiais"] += 1
    ano = ano_de(linha.data_inicio)
    if ano is not None:
        aberturas.setdefault(ano, Counter()).update(("total", grupo))


def agregar(linhas: Iterable[LinhaReduzida], tom_ibge: Mapping[str, str],
            geo: Mapping[str, Mapping[str, str]]) -> Agregado:
    """Uma passada: contagens por município (todos do geo_map), aberturas e totais."""
    por_municipio: dict[str, Counter] = {cod: Counter() for cod in geo}
    aberturas: dict[int, Counter] = {}
    totais: Counter = Counter()
    nao_mapeado = invalidas = 0
    for linha in linhas:
        cod = tom_ibge.get(normalizar_tom(linha.tom))
        if cod is None or cod not in por_municipio:
            nao_mapeado += 1
            continue
        grupo = cnae.grupo_de(linha.cnae_principal)
        if grupo is None:
            if linha.cnaes_secundarias_saude:
                por_municipio[cod]["saude_secundaria"] += 1
            else:
                invalidas += 1
        elif linha.situacao == SITUACAO_ATIVA:
            contabilizar_ativo(linha, grupo, por_municipio[cod], aberturas, totais)
        else:
            por_municipio[cod]["inativos"] += 1
            totais["inativos"] += 1
    return Agregado(por_municipio, aberturas, totais, nao_mapeado, invalidas)


def linha_municipio(contagem: Mapping[str, int], populacao: int | None) -> dict:
    ativos = contagem.get("ativos", 0)
    return {
        "ativos": ativos, "inativos": contagem.get("inativos", 0),
        **{g: contagem.get(g, 0) for g in cnae.CODIGOS},
        "saude_secundaria": contagem.get("saude_secundaria", 0),
        "populacao": populacao,
        "ativos_por_10mil": common.taxa(ativos, populacao, por=10_000),
    }


def montar_por_municipio(agregado: Agregado, geo: Mapping[str, Mapping[str, str]],
                         pop: Mapping, ano_pop: int) -> dict[str, dict]:
    """Todos os municípios do geo_map (mesmo com zeros), chaves IBGE em ordem crescente."""
    return {cod: linha_municipio(agregado.por_municipio.get(cod, Counter()),
                                 common.populacao_de(pop, cod, ano_pop))
            for cod in sorted(geo)}


def montar_aberturas(aberturas: Mapping[int, Counter], ano_inicial: int,
                     ano_final: int) -> list[dict]:
    """Ativos hoje por ano de início de atividade, todos os anos do intervalo."""
    return [{"ano": ano, "total": aberturas.get(ano, Counter()).get("total", 0),
             **{g: aberturas.get(ano, Counter()).get(g, 0) for g in cnae.CODIGOS}}
            for ano in range(ano_inicial, ano_final + 1)]


def montar_grupos(por_municipio: Mapping[str, Mapping[str, int]]) -> list[dict]:
    soma: Counter = Counter()
    for contagem in por_municipio.values():
        soma.update({g: contagem.get(g, 0) for g in cnae.CODIGOS})
    return cnae.contar_grupos(soma)


def montar_saida(agregado: Agregado, partes_recebidas: int, competencia: str,
                 atualizacao: str, geo: Mapping[str, Mapping[str, str]], pop: Mapping,
                 cfg: Config = CONFIG, fonte: str = "oficial") -> dict:
    ano_pop = max((ano for anos in pop.values() for ano in anos), default=int(competencia[:4]))
    por_municipio = montar_por_municipio(agregado, geo, pop, ano_pop)
    return {
        "metadata": {
            "fonte": FONTE.format(competencia=competencia)
                     + (FONTE_ESPELHO if fonte == "espelho" else ""),
            "competencia": competencia,
            "atualizacao": atualizacao,
            "criterio": CRITERIO,
            "nota": NOTA.format(ano_pop=ano_pop),
            "descartados": {"tomNaoMapeado": agregado.tom_nao_mapeado,
                            "linhasInvalidas": agregado.linhas_invalidas,
                            "partesRecebidas": partes_recebidas},
        },
        "grupos": montar_grupos(por_municipio),
        "porMunicipio": por_municipio,
        "aberturasPorAno": montar_aberturas(agregado.aberturas, cfg.ano_inicial_aberturas,
                                            int(competencia[:4])),
        "totais": {"ativos": agregado.totais.get("ativos", 0),
                   "inativos": agregado.totais.get("inativos", 0),
                   "matrizes": agregado.totais.get("matrizes", 0),
                   "filiais": agregado.totais.get("filiais", 0),
                   "municipios": len(geo)},
    }


# ── Orquestração ────────────────────────────────────────────────────────

def registrar_brutos(manifesto: dict, texto_municipios: str, linhas: Sequence[LinhaReduzida],
                     url_origem: str) -> dict:
    """Novo manifesto: tabela TOM -> IBGE gravada; CSV reduzido concatenado só com hash."""
    novo = common.registrar_texto(manifesto, ARQUIVO_MUNICIPIOS, texto_municipios,
                                  DESC_MUNICIPIOS, URL_MUNICIPIOS,
                                  linhas=texto_municipios.count("\n") - 1)
    return common.registrar_texto(novo, ARQUIVO_ESTABELECIMENTOS, filtrar.serializar(linhas),
                                  DESC_ESTABELECIMENTOS, url_origem, linhas=len(linhas),
                                  persistir=False)


def verificar_descartes(agregado: Agregado, total: int, cfg: Config = CONFIG) -> None:
    if total and agregado.tom_nao_mapeado / total > cfg.limite_tom_nao_mapeado:
        raise common.FonteIndisponivel(
            f"{agregado.tom_nao_mapeado} de {total} linhas com TOM não mapeado "
            f"(limite {cfg.limite_tom_nao_mapeado:.0%})")


def url_origem(fonte: str, competencia: str, http: requests.Session) -> str:
    """Pasta da competência na fonte usada; se o espelho não listar agora, fica a raiz dele
    (o manifesto só registra a origem, a conferência da competência já foi feita no filtro)."""
    try:
        return webdav.url_pasta(fonte, competencia, http)
    except common.FonteIndisponivel as exc:
        log.warning("  origem exata indisponível (%s); registrando a raiz da fonte", exc)
        return webdav.URL_ESPELHO if fonte == "espelho" else webdav.URL_BASE


def executar(pasta_partes: Path, competencia: str, cfg: Config = CONFIG,
             http: requests.Session | None = None, fonte: str = "oficial") -> dict:
    """Lê as partes, cruza TOM -> IBGE, agrega e grava cnpj_saude.json; devolve a saída."""
    inicio = time.perf_counter()
    http = http or common.sessao()
    partes = ler_partes(pasta_partes, cfg)
    geo = common.geo_municipios()
    texto_municipios = obter_municipios(http)
    tom_ibge = mapa_tom_ibge(texto_municipios, cfg.uf)
    validar_mapa(tom_ibge, geo)
    agregado = agregar(partes.linhas, tom_ibge, geo)
    verificar_descartes(agregado, len(partes.linhas), cfg)
    manifesto = registrar_brutos(common.carregar_manifesto(), texto_municipios, partes.linhas,
                                 url_origem(fonte, competencia, http))
    atualizacao = common.alterado_em(manifesto, [ARQUIVO_MUNICIPIOS, ARQUIVO_ESTABELECIMENTOS])
    # Linhas malformadas das partes (contagem de campos errada) também são perda e
    # entram em descartados.linhasInvalidas, junto com as linhas sem CNAE de saúde.
    com_malformadas = replace(agregado,
                              linhas_invalidas=agregado.linhas_invalidas + partes.invalidas)
    saida = montar_saida(com_malformadas, partes.recebidas, competencia, atualizacao, geo,
                         common.populacao_municipal(), cfg, fonte)
    common.salvar_manifesto(manifesto)
    common.escrever_json(SAIDA, saida)
    log.info("  Totais: %s; descartados: %s (%.1f s)", saida["totais"],
             saida["metadata"]["descartados"], time.perf_counter() - inicio)
    log.info("  Grupos: %s", ", ".join(f"{g['codigo']}={g['ativos']}" for g in saida["grupos"]))
    return saida


def redirecionar_saidas(pasta: Path) -> None:
    """Modo de ensaio: JSON, manifesto e brutos vão para `pasta`, não para o repositório."""
    common.PUBLIC_DATA_DIR = pasta
    common.RAW_DIR = pasta / "raw"
    common.MANIFEST_PATH = common.RAW_DIR / "_manifest.json"
    log.info("  modo de ensaio: saídas em %s", pasta)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--partes", required=True, help="pasta com os parte_<n>.csv")
    parser.add_argument("--pasta", required=True, help="competência AAAA-MM das partes")
    parser.add_argument("--esperadas", type=int, default=CONFIG.esperadas,
                        help="número mínimo de partes (padrão: 10)")
    parser.add_argument("--fonte", choices=("oficial", "espelho"), default="oficial",
                        help="fonte de onde as partes foram baixadas (metadados e manifesto)")
    parser.add_argument("--saida-dir", help="modo de ensaio: grava tudo nesta pasta")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not PADRAO_COMPETENCIA.match(args.pasta):
        parser.error(f"--pasta deve ser AAAA-MM, recebido {args.pasta!r}")
    if args.saida_dir:
        redirecionar_saidas(Path(args.saida_dir))
    cfg = Config(esperadas=args.esperadas)
    try:
        executar(Path(args.partes), args.pasta, cfg, fonte=args.fonte)
    except common.FonteIndisponivel as exc:
        log.error("ERRO: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
