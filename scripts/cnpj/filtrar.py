#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Filtra uma parte do arquivo Estabelecimentos (Receita Federal, Dados Abertos do
CNPJ) e grava um CSV reduzido: só Paraná, só saúde, só campos agregáveis.

Layout de entrada (verificado em 13/09/2026): zip com um único membro
(K3241.K03200Y<n>.D<data>.ESTABELE), Latin-1, sem cabeçalho, 30 campos
separados por ';' e entre aspas. Há ';' e aspas dentro de campos entre aspas e
até quebra de linha embutida: por isso a leitura é sempre com csv.reader sobre
o stream do zip, nunca com split por linha.

Saída (UTF-8, ';'): matriz_filial;situacao;data_inicio;cnae_principal;
cnaes_secundarias_saude;tom. Nunca entram CNPJ, nome, endereço, CEP, telefone
ou e-mail (LGPD): o artefato que sai do runner já é anônimo.

Competência: o nome do membro traz a data de extração (D<ano, 1 dígito><mês><dia>,
ex.: D60808 = 08/08/2026), sempre no mês da competência (conferido em 7 cópias de
2024-08 a 2026-08). Com --pasta, ano e mês do membro têm de bater: é o que impede
que uma pasta do espelho mapeada para a competência errada vire dado publicado.

Uso: python scripts/cnpj/filtrar.py --pasta 2026-08 --parte 5 [--fonte espelho] [--saida parte_5.csv]
     python scripts/cnpj/filtrar.py --parte 5 --zip Estabelecimentos5.zip [--pasta 2026-08]   (sem download)

Falha com saída diferente de zero em erro HTTP, contagem de campos errada,
competência do membro diferente da pedida ou zero linhas do PR: um download
truncado nunca vira artefato parcial em silêncio.
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import re
import sys
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cnpj import cnae, webdav  # noqa: E402
from etl import common  # noqa: E402

CABECALHO: tuple[str, ...] = ("matriz_filial", "situacao", "data_inicio", "cnae_principal",
                              "cnaes_secundarias_saude", "tom")
SEPARADOR = ";"
SEPARADOR_SECUNDARIAS = ","
# '.D60808.' no nome do membro: último dígito do ano, mês e dia da extração.
PADRAO_DATA_MEMBRO = re.compile(r"\.D(\d)(\d{2})(\d{2})\.")

log = logging.getLogger("cnpj.filtrar")


@dataclass(frozen=True)
class Config:
    uf: str = "PR"
    num_campos: int = 30
    codificacao: str = "latin-1"
    # Índices (base 0) no layout de 30 campos do ESTABELE.
    i_matriz_filial: int = 3
    i_situacao: int = 5
    i_data_inicio: int = 10
    i_cnae_principal: int = 11
    i_cnae_secundaria: int = 12
    i_uf: int = 19
    i_municipio: int = 20  # código TOM da jurisdição fiscal, não IBGE


CONFIG = Config()


@dataclass(frozen=True)
class LinhaReduzida:
    matriz_filial: str  # "1" matriz, "2" filial
    situacao: str  # "02" ativa; demais inativas
    data_inicio: str  # AAAAMMDD
    cnae_principal: str  # 7 dígitos
    cnaes_secundarias_saude: tuple[str, ...]  # só os secundários de saúde
    tom: str  # código TOM como veio (4 dígitos com zeros à esquerda)


@dataclass(frozen=True)
class Contagem:
    total: int
    uf: int
    saude: int


# ── Leitura ─────────────────────────────────────────────────────────────

def membro_estabelecimentos(zf: zipfile.ZipFile) -> zipfile.ZipInfo:
    membros = [i for i in zf.infolist() if not i.is_dir()]
    if len(membros) != 1:
        raise common.FonteIndisponivel(
            f"zip com {len(membros)} membros, esperado 1: {[m.filename for m in membros]}")
    return membros[0]


def conferir_competencia(nome_membro: str, competencia: str) -> None:
    """Falha se a data de extração no nome do membro não é do ano e mês da competência."""
    m = PADRAO_DATA_MEMBRO.search(nome_membro)
    if m is None:
        raise common.FonteIndisponivel(f"membro {nome_membro!r} sem data de extração (.DAMMDD.)")
    digito_ano, mes = m.group(1), m.group(2)
    if digito_ano != competencia[3] or mes != competencia[5:7]:
        raise common.FonteIndisponivel(
            f"membro {nome_membro!r} é de outra competência (ano ...{digito_ano}, mês {mes}); "
            f"pedida {competencia}")


def competencia_do_zip(caminho_zip: Path, competencia: str) -> str:
    """Confere o membro do zip contra a competência; devolve o nome do membro."""
    try:
        with zipfile.ZipFile(caminho_zip) as zf:
            nome = membro_estabelecimentos(zf).filename
    except (zipfile.BadZipFile, OSError) as exc:
        raise common.FonteIndisponivel(f"zip inválido ou truncado {caminho_zip.name}: {exc}") from exc
    conferir_competencia(nome, competencia)
    log.info("  membro %s confere com a competência %s", nome, competencia)
    return nome


def ler_linhas(caminho_zip: Path, cfg: Config = CONFIG) -> Iterator[list[str]]:
    """Linhas (listas de campos) do membro do zip, decodificadas de Latin-1 em streaming."""
    try:
        with zipfile.ZipFile(caminho_zip) as zf, zf.open(membro_estabelecimentos(zf)) as raw:
            texto = io.TextIOWrapper(raw, encoding=cfg.codificacao, newline="")
            yield from csv.reader(texto, delimiter=SEPARADOR, quotechar='"')
    except (zipfile.BadZipFile, EOFError, OSError) as exc:
        raise common.FonteIndisponivel(f"zip inválido ou truncado {caminho_zip.name}: {exc}") from exc


def reduzir(linha: list[str], cfg: Config = CONFIG) -> LinhaReduzida | None:
    """Linha reduzida se o estabelecimento for de saúde (principal ou secundário), senão None."""
    principal = cnae.normalizar(linha[cfg.i_cnae_principal])
    secundarias = cnae.secundarias_saude(linha[cfg.i_cnae_secundaria])
    if not cnae.eh_saude(principal) and not secundarias:
        return None
    return LinhaReduzida(
        matriz_filial=linha[cfg.i_matriz_filial].strip(),
        situacao=linha[cfg.i_situacao].strip(),
        data_inicio=linha[cfg.i_data_inicio].strip(),
        cnae_principal=principal,
        cnaes_secundarias_saude=secundarias,
        tom=linha[cfg.i_municipio].strip(),
    )


def filtrar_linhas(linhas: Iterable[list[str]],
                   cfg: Config = CONFIG) -> tuple[tuple[LinhaReduzida, ...], Contagem]:
    """Mantém só a UF e só saúde; falha em contagem de campos errada ou UF sem linhas."""
    total = na_uf = 0
    saida: list[LinhaReduzida] = []
    for numero, linha in enumerate(linhas, 1):
        total += 1
        if len(linha) != cfg.num_campos:
            raise common.FonteIndisponivel(
                f"linha {numero}: {len(linha)} campos, esperados {cfg.num_campos}")
        if linha[cfg.i_uf].strip() != cfg.uf:
            continue
        na_uf += 1
        reduzida = reduzir(linha, cfg)
        if reduzida is not None:
            saida.append(reduzida)
    if na_uf == 0:
        raise common.FonteIndisponivel(f"nenhuma linha da UF {cfg.uf} em {total} lidas")
    return tuple(saida), Contagem(total, na_uf, len(saida))


# ── Escrita ─────────────────────────────────────────────────────────────

def serializar(linhas: Iterable[LinhaReduzida]) -> str:
    """CSV reduzido como texto (cabeçalho + linhas, '\\n', sem aspas: só códigos)."""
    saida = io.StringIO()
    escritor = csv.writer(saida, delimiter=SEPARADOR, lineterminator="\n")
    escritor.writerow(CABECALHO)
    for l in linhas:
        escritor.writerow((l.matriz_filial, l.situacao, l.data_inicio, l.cnae_principal,
                           SEPARADOR_SECUNDARIAS.join(l.cnaes_secundarias_saude), l.tom))
    return saida.getvalue()


def escrever_reduzido(linhas: Iterable[LinhaReduzida], destino: Path) -> Path:
    common.escrever_atomico(destino, serializar(linhas))
    log.info("  gravado: %s (%d KB)", destino, destino.stat().st_size // 1024)
    return destino


# ── Orquestração ────────────────────────────────────────────────────────

def processar(caminho_zip: Path, destino: Path, cfg: Config = CONFIG,
              competencia: str | None = None) -> Contagem:
    inicio = time.perf_counter()
    if competencia:
        competencia_do_zip(caminho_zip, competencia)
    linhas, contagem = filtrar_linhas(ler_linhas(caminho_zip, cfg), cfg)
    escrever_reduzido(linhas, destino)
    log.info("  %s: %d linhas lidas, %d da UF %s, %d de saúde (%.0f s)", caminho_zip.name,
             contagem.total, contagem.uf, cfg.uf, contagem.saude, time.perf_counter() - inicio)
    return contagem


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pasta", help="competência AAAA-MM (obrigatória sem --zip; com --zip, "
                                        "confere o membro)")
    parser.add_argument("--parte", type=int, required=True, choices=range(webdav.NUM_PARTES),
                        help="índice da parte Estabelecimentos<n>.zip")
    parser.add_argument("--fonte", choices=("oficial", "espelho"), default="oficial",
                        help="de onde baixar: WebDAV da Receita (padrão) ou espelho")
    parser.add_argument("--saida", help="CSV reduzido (padrão: parte_<n>.csv)")
    parser.add_argument("--zip", help="zip já baixado; pula o download e não o apaga")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if args.pasta and not webdav.PADRAO_PASTA.match(args.pasta):
        parser.error(f"--pasta deve ser AAAA-MM, recebido {args.pasta!r}")

    destino = Path(args.saida or f"parte_{args.parte}.csv")
    try:
        if args.zip:
            processar(Path(args.zip), destino, competencia=args.pasta)
            return 0
        if not args.pasta:
            parser.error("--pasta é obrigatório quando não há --zip")
        url, autenticar = webdav.localizar_parte(args.fonte, args.pasta, args.parte)
        caminho_zip = Path.cwd() / webdav.NOME_PARTE.format(n=args.parte)
        log.info("CNPJ: baixando %s (fonte %s)", url, args.fonte)
        webdav.baixar(url, caminho_zip, autenticar=autenticar)
        processar(caminho_zip, destino, competencia=args.pasta)
        caminho_zip.unlink()
    except common.FonteIndisponivel as exc:
        log.error("ERRO: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
