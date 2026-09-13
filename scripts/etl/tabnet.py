# -*- coding: utf-8 -*-
"""
Cliente genérico do TabNet/DATASUS (tabcgi.exe), usado por sim_cid, sih e siops.

Fluxo verificado em 2026-09-13 (SIM, SIH e SIOPS):
  1. GET  <host><cgi>/deftohtm.exe?<def>   formulário HTML com os selects Linha,
     Coluna, Incremento (MULTIPLE), Arquivos (MULTIPLE) e filtros S<campo>.
  2. POST <host><cgi>/tabcgi.exe?<def>     corpo urlencoded em ISO-8859-1, ex.:
     Linha=Munic%EDpio&Coluna=Cap%EDtulo_CID-10&Incremento=%D3bitos_p%2FResid%EAnc
     &Arquivos=obtpr24.dbf&formato=table&mostre=Mostra
     A resposta HTML traz o link <A HREF=/csv/<nome>.csv> (de uso único).
  3. GET  <host>/csv/<nome>.csv            CSV ISO-8859-1 separado por ";":
     linhas de título, cabeçalho "Município";"Cap 01";...;"Total", uma linha
     por município ("410690 Curitiba"), linha "Total" e rodapé (Fonte, Notas).
     Valores ausentes aparecem como "-"; decimais usam vírgula.

Restrições: somente HTTP (a porta 443 recusa conexão); respostas em ISO-8859-1
(decodificadas explicitamente); o servidor oscila, por isso a sessão tem retry
(common.sessao) e há uma pausa curta entre chamadas.
"""

from __future__ import annotations

import csv
import html
import logging
import re
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import requests

from etl import common
from etl.common import FonteIndisponivel

log = logging.getLogger("etl.tabnet")

CODIFICACAO = "iso-8859-1"
TIMEOUT = 120
PAUSA = 0.5

# Capítulos da CID-10 na ordem oficial. Os rótulos de coluna do TabNet
# ("Cap I", "Cap 01", "I.   Algumas doenças...") são convertidos a estes códigos.
CAPITULOS_CID10: dict[str, str] = {
    "I": "Algumas doenças infecciosas e parasitárias",
    "II": "Neoplasias (tumores)",
    "III": "Doenças do sangue e dos órgãos hematopoéticos e alguns transtornos imunitários",
    "IV": "Doenças endócrinas, nutricionais e metabólicas",
    "V": "Transtornos mentais e comportamentais",
    "VI": "Doenças do sistema nervoso",
    "VII": "Doenças do olho e anexos",
    "VIII": "Doenças do ouvido e da apófise mastoide",
    "IX": "Doenças do aparelho circulatório",
    "X": "Doenças do aparelho respiratório",
    "XI": "Doenças do aparelho digestivo",
    "XII": "Doenças da pele e do tecido subcutâneo",
    "XIII": "Doenças do sistema osteomuscular e do tecido conjuntivo",
    "XIV": "Doenças do aparelho geniturinário",
    "XV": "Gravidez, parto e puerpério",
    "XVI": "Algumas afecções originadas no período perinatal",
    "XVII": "Malformações congênitas, deformidades e anomalias cromossômicas",
    "XVIII": "Sintomas, sinais e achados anormais de exames clínicos e de laboratório",
    "XIX": "Lesões, envenenamentos e algumas outras consequências de causas externas",
    "XX": "Causas externas de morbidade e mortalidade",
    "XXI": "Fatores que influenciam o estado de saúde e o contato com os serviços de saúde",
    "XXII": "Códigos para propósitos especiais",
}
ROMANOS: tuple[str, ...] = tuple(CAPITULOS_CID10)

_RE_OPTION = re.compile(r'<option\b[^>]*?value="([^"]*)"[^>]*>([^<\r\n]*)', re.I)
_RE_LINK_CSV = re.compile(r'href="?(/csv/[^"\s>]+\.csv)', re.I)
_RE_COD_NOME = re.compile(r"^\s*(\d{6})\s+(\S.*?)\s*$")
_RE_CAPITULO = re.compile(r"^\s*(?:[Cc]ap\.?\s*)?([IVX]+|\d{1,2})(?:\s*\.|\s*$)")
_RE_TAGS = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class Servidor:
    """Onde o TabNet está publicado (o SIOPS usa outro host e o prefixo /CGI)."""

    host: str = "http://tabnet.datasus.gov.br"
    cgi: str = "/cgi"

    def url_formulario(self, def_path: str) -> str:
        return f"{self.host}{self.cgi}/deftohtm.exe?{def_path}"

    def url_tabulacao(self, def_path: str) -> str:
        return f"{self.host}{self.cgi}/tabcgi.exe?{def_path}"


TABNET = Servidor()


# ── HTTP ────────────────────────────────────────────────────────────────

def _requisitar(http: requests.Session, metodo: str, url: str, **kwargs) -> str:
    """Executa a requisição e devolve o corpo decodificado de ISO-8859-1."""
    try:
        resposta = http.request(metodo, url, timeout=TIMEOUT, **kwargs)
        resposta.raise_for_status()
    except requests.RequestException as exc:
        raise FonteIndisponivel(f"falha em {metodo} {url}: {exc}") from exc
    return resposta.content.decode(CODIFICACAO)


def baixar_formulario(def_path: str, servidor: Servidor = TABNET,
                      http: requests.Session | None = None) -> str:
    """HTML do formulário (deftohtm.exe), para ler as opções dos selects."""
    http = http or common.sessao()
    texto = _requisitar(http, "GET", servidor.url_formulario(def_path))
    time.sleep(PAUSA)
    return texto


def ler_opcoes(form_html: str, select_name: str) -> dict[str, str]:
    """Opções de um <select> do formulário: rótulo (sem entidades) -> value."""
    padrao = re.compile(
        r'<select\b[^>]*\bname="' + re.escape(select_name) + r'"[^>]*>(.*?)</select>',
        re.I | re.S,
    )
    achado = padrao.search(form_html)
    if not achado:
        raise FonteIndisponivel(f"select {select_name!r} ausente no formulário TabNet")
    return {
        html.unescape(rotulo).strip(): html.unescape(valor)
        for valor, rotulo in _RE_OPTION.findall(achado.group(1))
    }


def _resumo_html(pagina: str, limite: int = 200) -> str:
    """Texto visível da página (para mensagens de erro), sem tags e espaços extras."""
    return " ".join(_RE_TAGS.sub(" ", pagina).split())[:limite]


def consultar(def_path: str, campos: dict[str, str | list[str]],
              servidor: Servidor = TABNET,
              http: requests.Session | None = None) -> str:
    """POST da tabulação e GET do CSV apontado pela resposta.

    Devolve o CSV como texto (decodificado de ISO-8859-1, quebras de linha
    normalizadas para "\\n"). Levanta FonteIndisponivel em erro HTTP ou quando a
    resposta não traz o link do CSV (mensagem de erro do TabNet, servidor fora).
    """
    http = http or common.sessao()
    url = servidor.url_tabulacao(def_path)
    corpo = urlencode(campos, encoding=CODIFICACAO, doseq=True).encode("ascii")
    pagina = _requisitar(http, "POST", url, data=corpo,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})
    achado = _RE_LINK_CSV.search(pagina)
    if not achado:
        raise FonteIndisponivel(f"TabNet sem link CSV em {url}: {_resumo_html(pagina)}")
    time.sleep(PAUSA)
    texto = _requisitar(http, "GET", servidor.host + achado.group(1))
    time.sleep(PAUSA)
    return "\n".join(texto.splitlines()) + "\n"


# ── CSV ─────────────────────────────────────────────────────────────────

def numero(valor: str) -> int | float | str | None:
    """Converte célula do TabNet: "-" vira None; "1234" int; "158414,29" float."""
    v = valor.strip()
    if v in ("-", "", "..."):
        return None
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v.replace(".", "").replace(",", "."))
    except ValueError:
        return v


def _celulas(linha: str) -> list[str]:
    return next(csv.reader([linha], delimiter=";", quotechar='"'))


def _indice_cabecalho(linhas: list[str]) -> int:
    """Índice da primeira linha com células entre aspas e separador ";"."""
    for i, linha in enumerate(linhas):
        if linha.startswith('"') and ";" in linha:
            return i
    raise FonteIndisponivel("CSV do TabNet sem linha de cabeçalho")


def _registro(cabecalho: list[str], celulas: list[str]) -> dict:
    """Linha do CSV -> {cod6, nome, <coluna>: número}; cod6 é None sem código IBGE."""
    achado = _RE_COD_NOME.match(celulas[0])
    cod6, nome = (achado.group(1), achado.group(2)) if achado else (None, celulas[0].strip())
    valores = {coluna: numero(valor) for coluna, valor in zip(cabecalho[1:], celulas[1:])}
    return {"cod6": cod6, "nome": nome, **valores}


def parse_csv(texto: str) -> list[dict]:
    """Registros do CSV do TabNet (uma linha por município), sem a linha Total
    nem o rodapé. Chaves: cod6, nome e cada coluna do cabeçalho."""
    linhas = texto.splitlines()
    inicio = _indice_cabecalho(linhas)
    cabecalho = [c.strip() for c in _celulas(linhas[inicio])]
    registros: list[dict] = []
    for linha in linhas[inicio + 1:]:
        if not linha.startswith('"'):
            break  # rodapé: Fonte, Notas
        celulas = _celulas(linha)
        if celulas[0].strip().lower() == "total":
            break
        registros.append(_registro(cabecalho, celulas))
    return registros


# ── Capítulos CID-10 ────────────────────────────────────────────────────

def romano_de_capitulo(rotulo: str) -> str | None:
    """"Cap I", "Cap 01", "I.   Algumas doenças..." -> "I"; outros rótulos -> None."""
    achado = _RE_CAPITULO.match(rotulo)
    if not achado:
        return None
    codigo = achado.group(1)
    if codigo.isdigit():
        n = int(codigo)
        return ROMANOS[n - 1] if 1 <= n <= len(ROMANOS) else None
    return codigo if codigo in CAPITULOS_CID10 else None


def tabela_capitulos(registros: list[dict], cod6_para_7: dict[str, str]) -> dict[str, dict[str, int]]:
    """cod7 -> {"total": n, "I": n, ...} de uma tabulação Município x Capítulo CID-10.
    Linhas fora do mapa (município ignorado) são descartadas; "-" conta como 0."""
    tabela: dict[str, dict[str, int]] = {}
    for r in registros:
        cod7 = cod6_para_7.get(r["cod6"] or "")
        if not cod7:
            continue
        capitulos = {
            romano: int(r[coluna] or 0)
            for coluna in r
            if (romano := romano_de_capitulo(coluna)) is not None
        }
        tabela[cod7] = {"total": int(r.get("Total") or 0), **capitulos}
    return tabela


def capitulos_de(codigos: set[str], nomes: dict[str, str] | None = None) -> list[dict]:
    """[{"codigo": "I", "nome": ...}, ...] na ordem da CID-10, só os presentes."""
    nomes = nomes or CAPITULOS_CID10
    return [{"codigo": c, "nome": nomes[c]} for c in ROMANOS if c in codigos]


def completar_capitulos(municipio: dict[str, int], ordem: list[str]) -> dict[str, int]:
    """Novo dict com "total" e todos os capítulos de `ordem` (ausentes = 0)."""
    return {"total": municipio.get("total", 0), **{c: municipio.get(c, 0) for c in ordem}}


def somar_capitulos(tabela: dict[str, dict[str, int]], ordem: list[str]) -> dict[str, int]:
    """Soma dos municípios: {"total": N, "I": n, ...} na ordem informada."""
    return {
        "total": sum(m.get("total", 0) for m in tabela.values()),
        **{c: sum(m.get(c, 0) for m in tabela.values()) for c in ordem},
    }
