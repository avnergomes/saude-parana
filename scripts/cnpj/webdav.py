#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Acesso ao compartilhamento público (Nextcloud) dos Dados Abertos do CNPJ.

Desde 2025 os arquivos não estão mais em arquivos.receitafederal.gov.br/dados/
(HTTP 404): ficam em um compartilhamento público Nextcloud, acessível por WebDAV
em https://arquivos.receitafederal.gov.br/public.php/webdav/ com HTTP Basic
(usuário = token do compartilhamento, senha vazia). A raiz lista uma pasta por
competência (AAAA-MM) e cada pasta traz Estabelecimentos0.zip a
Estabelecimentos9.zip (5,3 GB no total).

Sobre o token: é o identificador do link público publicado na página de dados
abertos da Receita, o mesmo que qualquer navegador usa ao abrir o
compartilhamento. Não é credencial nem segredo; por isso fica em código.

O servidor tem falhas intermitentes de "time to first byte" (fica mudo por
minutos e depois responde em 0,3 s), então tudo aqui usa timeout curto por
leitura, várias tentativas com backoff e retomada por Range. Na retomada, o
206 só é aceito se o Content-Range começar exatamente no byte já gravado;
qualquer outra resposta parcial descarta o arquivo e recomeça. No download,
só tentativas seguidas sem avanço em disco consomem o limite: uma queda no
meio de um stream que progrediu não conta (há um teto absoluto por segurança).

Uso: python scripts/cnpj/webdav.py --listar   (imprime a pasta mais recente completa)
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, TypeVar
from urllib.parse import unquote

import requests

if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl import common  # noqa: E402

URL_BASE = "https://arquivos.receitafederal.gov.br/public.php/webdav/"
# Token do link público de https://www.gov.br/receitafederal/dados/cnpj (não é segredo).
TOKEN_COMPARTILHAMENTO = "YggdBLfdninEJX9"
NUM_PARTES = 10
NOME_PARTE = "Estabelecimentos{n}.zip"
PADRAO_PASTA = re.compile(r"^\d{4}-\d{2}$")
PADRAO_PARTE = re.compile(r"^Estabelecimentos(\d)\.zip$")
NS = "{DAV:}"
HTTP_MULTI_STATUS = 207
HTTP_CONTEUDO_PARCIAL = 206
HTTP_RANGE_INVALIDO = 416
# 'bytes <ini>-<fim>/<total>'; o total pode vir como '*' (desconhecido).
PADRAO_CONTENT_RANGE = re.compile(r"^bytes\s+(\d+)-(\d+)/(\d+|\*)$")
PASTAS_A_VERIFICAR = 3  # quantas competências, da mais recente para trás, testar

log = logging.getLogger("cnpj.webdav")

T = TypeVar("T")


@dataclass(frozen=True)
class Config:
    url_base: str = URL_BASE
    token: str = TOKEN_COMPARTILHAMENTO
    timeout_conexao: int = 30
    timeout_leitura: int = 60
    tentativas: int = 6  # PROPFIND: total; download: seguidas sem avanço em disco
    teto_tentativas: int = 30  # download: teto absoluto, com ou sem avanço
    backoff: float = 5.0  # segundos; multiplicado pelo número da tentativa
    pedaco: int = 1 << 20


CONFIG = Config()


@dataclass(frozen=True)
class Entrada:
    nome: str
    pasta: bool
    tamanho: int | None


def autenticacao(cfg: Config = CONFIG) -> tuple[str, str]:
    return (cfg.token, "")


def timeout(cfg: Config = CONFIG) -> tuple[int, int]:
    return (cfg.timeout_conexao, cfg.timeout_leitura)


def _com_tentativas(descricao: str, acao: Callable[[], T], cfg: Config) -> T:
    """Executa `acao` até cfg.tentativas vezes; erros de rede viram nova tentativa."""
    for tentativa in range(1, cfg.tentativas + 1):
        try:
            return acao()
        except (requests.RequestException, OSError) as exc:
            log.warning("  %s: tentativa %d/%d falhou: %s", descricao, tentativa, cfg.tentativas, exc)
            if tentativa < cfg.tentativas:
                time.sleep(cfg.backoff * tentativa)
    raise common.FonteIndisponivel(f"{descricao}: sem sucesso após {cfg.tentativas} tentativas")


# ── PROPFIND ────────────────────────────────────────────────────────────

def interpretar_propfind(xml_texto: str) -> tuple[Entrada, ...]:
    """Entradas de uma resposta 207 (inclui a própria pasta consultada)."""
    try:
        raiz = ET.fromstring(xml_texto)
    except ET.ParseError as exc:
        raise common.FonteIndisponivel(f"PROPFIND: XML inválido ({exc})") from exc
    entradas = []
    for resposta in raiz.iter(NS + "response"):
        href = unquote(resposta.findtext(NS + "href") or "").rstrip("/")
        colecao = resposta.find(f".//{NS}resourcetype/{NS}collection") is not None
        tamanho = resposta.findtext(f".//{NS}getcontentlength")
        entradas.append(Entrada(href.rsplit("/", 1)[-1], colecao,
                                int(tamanho) if tamanho and tamanho.isdigit() else None))
    return tuple(entradas)


def propfind(caminho: str, http: requests.Session | None = None,
             cfg: Config = CONFIG) -> tuple[Entrada, ...]:
    """Lista `caminho` (relativo à raiz do compartilhamento; '' = raiz), Depth 1."""
    http = http or common.sessao()
    url = cfg.url_base + caminho

    def pedir() -> tuple[Entrada, ...]:
        resp = http.request("PROPFIND", url, headers={"Depth": "1"}, auth=autenticacao(cfg),
                            timeout=timeout(cfg))
        if 400 <= resp.status_code < 500:
            raise common.FonteIndisponivel(f"PROPFIND {url}: HTTP {resp.status_code}")
        resp.raise_for_status()  # 5xx: nova tentativa
        if resp.status_code != HTTP_MULTI_STATUS:
            raise common.FonteIndisponivel(f"PROPFIND {url}: HTTP {resp.status_code}, esperado 207")
        return interpretar_propfind(resp.text)

    return _com_tentativas(f"PROPFIND {caminho or '/'}", pedir, cfg)


def pastas_disponiveis(entradas: tuple[Entrada, ...]) -> tuple[str, ...]:
    """Competências AAAA-MM em ordem crescente (ignora cnpj.tar.gz e outros arquivos)."""
    return tuple(sorted(e.nome for e in entradas if e.pasta and PADRAO_PASTA.match(e.nome)))


def partes_presentes(entradas: tuple[Entrada, ...]) -> frozenset[int]:
    """Índices das partes Estabelecimentos<n>.zip com tamanho conhecido e maior que zero."""
    presentes = set()
    for e in entradas:
        m = PADRAO_PARTE.match(e.nome)
        if m and e.tamanho:
            presentes.add(int(m.group(1)))
    return frozenset(presentes)


def pasta_completa(pasta: str, http: requests.Session | None = None,
                   cfg: Config = CONFIG) -> bool:
    presentes = partes_presentes(propfind(pasta + "/", http, cfg))
    faltam = sorted(set(range(NUM_PARTES)) - presentes)
    if faltam:
        log.warning("  pasta %s incompleta: faltam as partes %s", pasta, faltam)
    return not faltam


def pasta_mais_recente(http: requests.Session | None = None, cfg: Config = CONFIG) -> str:
    """Competência mais recente cujas 10 partes de Estabelecimentos já existem."""
    http = http or common.sessao()
    pastas = pastas_disponiveis(propfind("", http, cfg))
    if not pastas:
        raise common.FonteIndisponivel("nenhuma pasta AAAA-MM no compartilhamento")
    for pasta in reversed(pastas[-PASTAS_A_VERIFICAR:]):
        if pasta_completa(pasta, http, cfg):
            log.info("  pasta mais recente completa: %s", pasta)
            return pasta
    raise common.FonteIndisponivel(
        f"nenhuma das {PASTAS_A_VERIFICAR} últimas pastas tem as {NUM_PARTES} partes")


def url_parte(pasta: str, n: int, cfg: Config = CONFIG) -> str:
    if not PADRAO_PASTA.match(pasta):
        raise ValueError(f"pasta inválida: {pasta!r} (esperado AAAA-MM)")
    if not 0 <= n < NUM_PARTES:
        raise ValueError(f"parte inválida: {n} (esperado 0 a {NUM_PARTES - 1})")
    return f"{cfg.url_base}{pasta}/{NOME_PARTE.format(n=n)}"


# ── Download com retomada ───────────────────────────────────────────────

def _tamanho_em_disco(destino: Path) -> int:
    return destino.stat().st_size if destino.exists() else 0


def interpretar_content_range(cabecalho: str) -> tuple[int, int | None] | None:
    """(início, total anunciado ou None se '*') de 'bytes <ini>-<fim>/<total>'; None se inválido."""
    m = PADRAO_CONTENT_RANGE.match(cabecalho.strip())
    if not m:
        return None
    total = m.group(3)
    return int(m.group(1)), (int(total) if total != "*" else None)


def _tamanho_total(resp: requests.Response) -> int | None:
    """Tamanho completo anunciado por uma resposta 200 (Content-Length)."""
    tamanho = resp.headers.get("Content-Length")
    return int(tamanho) if tamanho and tamanho.isdigit() else None


def _validar_retomada(resp: requests.Response, posicao: int, destino: Path, url: str) -> int | None:
    """206: o Content-Range tem de começar em `posicao` (o que já está em disco).
    Sem cabeçalho, formato estranho ou início diferente, o parcial é descartado e a
    tentativa falha: é isso que evita aceitar um arquivo truncado ou com bytes
    duplicados, que só o CRC do zip pegaria no fim. Devolve o total anunciado."""
    bruto = resp.headers.get("Content-Range", "")
    faixa = interpretar_content_range(bruto)
    if faixa is None or faixa[0] != posicao:
        destino.unlink(missing_ok=True)
        raise OSError(f"HTTP 206 com Content-Range {bruto!r} em {url}, esperado início em "
                      f"{posicao}; parcial descartado")
    return faixa[1]


def _abrir_trecho(url: str, posicao: int, http: requests.Session,
                  cfg: Config) -> requests.Response:
    """GET em streaming a partir de `posicao` (Range só quando há algo em disco)."""
    cabecalhos = {"Range": f"bytes={posicao}-"} if posicao else {}
    return http.get(url, stream=True, headers=cabecalhos, auth=autenticacao(cfg),
                    timeout=timeout(cfg))


def _total_anunciado(resp: requests.Response, posicao: int, destino: Path, url: str) -> int | None:
    """Valida o status antes de ler o corpo e devolve o total anunciado (200 ou 206)."""
    if resp.status_code == HTTP_RANGE_INVALIDO:
        destino.unlink(missing_ok=True)  # parcial maior que o arquivo: recomeça do zero
        raise requests.HTTPError(f"HTTP 416 em {url}; parcial descartado")
    resp.raise_for_status()
    if resp.status_code == HTTP_CONTEUDO_PARCIAL:
        return _validar_retomada(resp, posicao, destino, url)
    return _tamanho_total(resp)


def _gravar_trecho(resp: requests.Response, destino: Path, cfg: Config) -> int:
    """Anexa (206) ou sobrescreve (200) o corpo em `destino`; devolve os bytes em disco."""
    retomado = resp.status_code == HTTP_CONTEUDO_PARCIAL
    with open(destino, "ab" if retomado else "wb") as f:
        for pedaco in resp.iter_content(chunk_size=cfg.pedaco):
            f.write(pedaco)
    return _tamanho_em_disco(destino)


def _conciliar_total(anterior: int | None, anunciado: int | None, destino: Path) -> int | None:
    """Mantém o total anunciado na primeira resposta quando as seguintes não o trazem
    ('bytes a-b/*'); se o servidor anunciar outro total, o arquivo mudou: recomeça."""
    if anunciado is None:
        return anterior
    if anterior is not None and anunciado != anterior:
        destino.unlink(missing_ok=True)
        raise OSError(f"total anunciado mudou de {anterior} para {anunciado} bytes; "
                      "parcial descartado")
    return anunciado


def baixar(url: str, destino: Path, http: requests.Session | None = None,
           cfg: Config = CONFIG) -> int:
    """Baixa `url` em streaming para `destino`, retomando por Range se cair no meio.
    Só tentativas seguidas sem avanço em disco contam para cfg.tentativas (uma queda
    no meio de um stream que progrediu zera o contador); cfg.teto_tentativas limita o
    total. Devolve o tamanho final; levanta FonteIndisponivel ao esgotar."""
    http = http or common.sessao()
    destino.parent.mkdir(parents=True, exist_ok=True)
    inicio = time.perf_counter()
    total_esperado: int | None = None
    sem_avanco = 0
    for tentativa in range(1, cfg.teto_tentativas + 1):
        antes = _tamanho_em_disco(destino)
        if antes == 0:
            total_esperado = None  # nada em disco: o total conhecido era do parcial descartado
        try:
            with _abrir_trecho(url, antes, http, cfg) as resp:
                # O total é fixado antes de ler o corpo: uma queda no meio do
                # stream não o perde, e as retomadas seguintes são conferidas com ele.
                anunciado = _total_anunciado(resp, antes, destino, url)
                total_esperado = _conciliar_total(total_esperado, anunciado, destino)
                tamanho = _gravar_trecho(resp, destino, cfg)
            if total_esperado is None or tamanho == total_esperado:
                log.info("  baixado: %s (%d MB em %.0f s, %d tentativa(s))", destino.name,
                         tamanho >> 20, time.perf_counter() - inicio, tentativa)
                return tamanho
            erro: Exception = OSError(f"incompleto: {tamanho} de {total_esperado} bytes (retomando)")
        except (requests.RequestException, OSError) as exc:
            erro = exc
        sem_avanco = 0 if _tamanho_em_disco(destino) > antes else sem_avanco + 1
        log.warning("  GET %s: tentativa %d/%d falhou (%d/%d seguidas sem avanço): %s",
                    destino.name, tentativa, cfg.teto_tentativas, sem_avanco, cfg.tentativas, erro)
        if sem_avanco >= cfg.tentativas:
            break
        time.sleep(cfg.backoff * max(sem_avanco, 1))
    raise common.FonteIndisponivel(
        f"GET {destino.name}: sem sucesso após {tentativa} tentativas "
        f"({sem_avanco} seguidas sem avanço)")


# ── CLI ─────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--listar", action="store_true",
                        help="imprime a competência mais recente com as 10 partes")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not args.listar:
        parser.print_help()
        return 2
    try:
        pasta = pasta_mais_recente()
    except common.FonteIndisponivel as exc:
        log.error("ERRO: %s", exc)
        return 1
    # A pasta vai para stdout de propósito: o workflow captura este valor
    # ($GITHUB_OUTPUT); os logs ficam em stderr.
    sys.stdout.write(pasta + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
