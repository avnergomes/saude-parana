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

Segunda fonte, o espelho: do GitHub Actions o servidor da Receita (Serpro) não
responde. O connect() para arquivos.receitafederal.gov.br não completa a partir
das faixas de IP do Azure (medido em 2026-09-14, runs 34795030619 e
34795662811 do repositório), enquanto de um IP no Brasil a mesma chamada
responde em 0,3 s. Por isso existe a fonte "espelho": a Casa dos Dados copia os
arquivos oficiais uma vez por competência para um autoindex Apache atrás do
Cloudflare, sem autenticação, em pastas nomeadas pela data da cópia
(AAAA-MM-DD; a competência é o AAAA-MM dessa data, regra que valeu para as
25 pastas de 2024-08 a 2026-08). A parte 5 de 2026-08 baixada do espelho tem o
mesmo sha256 da baixada da Receita (conferido em 2026-09-13), e filtrar.py
ainda confere a competência pela data gravada no nome do membro do zip. No modo
"auto" a fonte oficial é sondada com uma única tentativa curta e, se não
responder, o espelho assume; a escolha vai para o cnpj_saude.json.

Uso: python scripts/cnpj/webdav.py --listar [--fonte auto|oficial|espelho] [--pasta AAAA-MM]
     imprime "<competência> <fonte>" (a mais recente completa, ou a informada, conferida)
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, replace
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
# Espelho público (autoindex Apache, Cloudflare) dos mesmos arquivos, sem autenticação.
URL_ESPELHO = "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/"
FONTES = ("auto", "oficial", "espelho")
NUM_PARTES = 10
NOME_PARTE = "Estabelecimentos{n}.zip"
PADRAO_PASTA = re.compile(r"^\d{4}-\d{2}$")
PADRAO_PASTA_ESPELHO = re.compile(r"^(\d{4}-\d{2})-\d{2}$")  # data da cópia; grupo 1 = competência
PADRAO_PARTE = re.compile(r"^Estabelecimentos(\d)\.zip$")
# Autoindex do Apache: uma <tr> por entrada, com href e células alinhadas à direita
# (data e tamanho); o tamanho é humano ('320M', '2.0G', '-' para pastas).
PADRAO_LINHA_INDICE = re.compile(r"<tr>(.*?)</tr>", re.S)
PADRAO_HREF = re.compile(r'href="([^"]+)"')
PADRAO_CELULA_DIREITA = re.compile(r'<td align="right">\s*(.*?)\s*</td>', re.S)
PADRAO_TAMANHO_HUMANO = re.compile(r"^(\d+(?:\.\d+)?)([KMGT]?)$")
MULTIPLICADORES = {"": 1, "K": 1 << 10, "M": 1 << 20, "G": 1 << 30, "T": 1 << 40}
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
    url_espelho: str = URL_ESPELHO
    token: str = TOKEN_COMPARTILHAMENTO
    timeout_conexao: int = 30
    timeout_leitura: int = 60
    timeout_sonda: int = 10  # modo auto: uma tentativa curta na fonte oficial
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


# ── Espelho (autoindex) ─────────────────────────────────────────────────

def tamanho_aproximado(texto: str) -> int | None:
    """'320M' -> 335544320, '22K', '2.0G', '0' -> 0; '-' ou vazio -> None."""
    m = PADRAO_TAMANHO_HUMANO.match(texto.strip())
    if not m:
        return None
    return int(float(m.group(1)) * MULTIPLICADORES[m.group(2)])


def interpretar_indice(html: str) -> tuple[Entrada, ...]:
    """Entradas de um autoindex do Apache: href terminando em '/' é pasta; o tamanho
    é o da coluna Size, aproximado, suficiente para saber se a parte existe e não
    está vazia. 'Parent Directory' (href absoluto) e os links de ordenação ficam de fora."""
    entradas = []
    for linha in PADRAO_LINHA_INDICE.finditer(html):
        href = PADRAO_HREF.search(linha.group(1))
        celulas = PADRAO_CELULA_DIREITA.findall(linha.group(1))
        if not href or href.group(1).startswith(("/", "?")) or not celulas:
            continue
        nome = unquote(href.group(1))
        pasta = nome.endswith("/")
        entradas.append(Entrada(nome.rstrip("/"), pasta,
                                None if pasta else tamanho_aproximado(celulas[-1])))
    return tuple(entradas)


def listar_espelho(caminho: str, http: requests.Session | None = None,
                   cfg: Config = CONFIG) -> tuple[Entrada, ...]:
    """Lista `caminho` do espelho ('' = raiz, 'AAAA-MM-DD/' = uma cópia) pelo autoindex.
    Uma página sem entradas (desafio do Cloudflare, formato novo) é falha, não lista vazia."""
    http = http or common.sessao()
    url = cfg.url_espelho + caminho

    def pedir() -> tuple[Entrada, ...]:
        resp = http.get(url, timeout=timeout(cfg))
        if 400 <= resp.status_code < 500:
            raise common.FonteIndisponivel(f"GET {url}: HTTP {resp.status_code}")
        resp.raise_for_status()
        entradas = interpretar_indice(resp.text)
        if not entradas:
            raise common.FonteIndisponivel(f"GET {url}: índice vazio ou em formato inesperado")
        return entradas

    return _com_tentativas(f"GET {caminho or '/'} (espelho)", pedir, cfg)


def pastas_espelho(entradas: tuple[Entrada, ...]) -> dict[str, str]:
    """Competência AAAA-MM -> pasta do espelho (AAAA-MM-DD, data da cópia). Com duas
    cópias no mesmo mês vale a mais recente."""
    mapa: dict[str, str] = {}
    for e in entradas:
        m = PADRAO_PASTA_ESPELHO.match(e.nome) if e.pasta else None
        if m and e.nome > mapa.get(m.group(1), ""):
            mapa[m.group(1)] = e.nome
    return mapa


def pasta_espelho(competencia: str, http: requests.Session | None = None,
                  cfg: Config = CONFIG) -> str:
    """Pasta do espelho que guarda a competência (ex.: '2026-08' -> '2026-08-09')."""
    mapa = pastas_espelho(listar_espelho("", http, cfg))
    if competencia not in mapa:
        ultimas = ", ".join(sorted(mapa)[-PASTAS_A_VERIFICAR:]) or "nenhuma"
        raise common.FonteIndisponivel(
            f"competência {competencia} não está no espelho (últimas: {ultimas})")
    return mapa[competencia]


# ── Escolha da fonte e da competência ───────────────────────────────────

def escolher_fonte(preferida: str = "auto", cfg: Config = CONFIG) -> str:
    """'oficial' ou 'espelho'. No modo auto, uma sondagem curta (uma tentativa, sem
    retry da sessão) decide: se o compartilhamento da Receita não responde, como
    acontece no GitHub Actions, o espelho assume."""
    if preferida not in FONTES:
        raise ValueError(f"fonte inválida: {preferida!r} (esperado {', '.join(FONTES)})")
    if preferida != "auto":
        return preferida
    sonda = replace(cfg, tentativas=1, timeout_conexao=cfg.timeout_sonda,
                    timeout_leitura=cfg.timeout_sonda)
    try:
        propfind("", common.sessao(tentativas=0), sonda)
    except common.FonteIndisponivel as exc:
        log.warning("  fonte oficial sem resposta (%s); usando o espelho", exc)
        return "espelho"
    log.info("  fonte oficial respondeu; usando o WebDAV da Receita")
    return "oficial"


def pasta_completa(pasta: str, http: requests.Session | None = None,
                   cfg: Config = CONFIG, listar: Callable | None = None) -> bool:
    """As 10 partes existem em `pasta` (AAAA-MM no WebDAV, AAAA-MM-DD no espelho)?"""
    listar = listar or propfind
    presentes = partes_presentes(listar(pasta + "/", http, cfg))
    faltam = sorted(set(range(NUM_PARTES)) - presentes)
    if faltam:
        log.warning("  pasta %s incompleta: faltam as partes %s", pasta, faltam)
    return not faltam


def competencias_na_fonte(fonte: str, http: requests.Session | None = None,
                          cfg: Config = CONFIG) -> dict[str, str]:
    """Competência -> pasta na fonte (a própria AAAA-MM no WebDAV; a data da cópia no espelho)."""
    if fonte == "espelho":
        return pastas_espelho(listar_espelho("", http, cfg))
    return {p: p for p in pastas_disponiveis(propfind("", http, cfg))}


def competencia_completa(competencia: str, fonte: str, http: requests.Session | None = None,
                         cfg: Config = CONFIG) -> bool:
    """Uma competência informada à mão tem as 10 partes na fonte?"""
    http = http or common.sessao()
    if fonte == "espelho":
        return pasta_completa(pasta_espelho(competencia, http, cfg), http, cfg, listar_espelho)
    return pasta_completa(competencia, http, cfg)


def pasta_mais_recente(http: requests.Session | None = None, cfg: Config = CONFIG,
                       fonte: str = "oficial") -> str:
    """Competência mais recente cujas 10 partes de Estabelecimentos já existem na fonte."""
    http = http or common.sessao()
    mapa = competencias_na_fonte(fonte, http, cfg)
    if not mapa:
        raise common.FonteIndisponivel(f"nenhuma pasta de competência na fonte {fonte}")
    listar = listar_espelho if fonte == "espelho" else propfind
    for competencia in sorted(mapa, reverse=True)[:PASTAS_A_VERIFICAR]:
        if pasta_completa(mapa[competencia], http, cfg, listar):
            log.info("  competência mais recente completa (fonte %s): %s", fonte, competencia)
            return competencia
    raise common.FonteIndisponivel(
        f"nenhuma das {PASTAS_A_VERIFICAR} últimas competências da fonte {fonte} "
        f"tem as {NUM_PARTES} partes")


# ── Endereços das partes ────────────────────────────────────────────────

def url_parte(pasta: str, n: int, cfg: Config = CONFIG) -> str:
    """URL de uma parte no WebDAV oficial (pasta = competência AAAA-MM)."""
    if not PADRAO_PASTA.match(pasta):
        raise ValueError(f"pasta inválida: {pasta!r} (esperado AAAA-MM)")
    if not 0 <= n < NUM_PARTES:
        raise ValueError(f"parte inválida: {n} (esperado 0 a {NUM_PARTES - 1})")
    return f"{cfg.url_base}{pasta}/{NOME_PARTE.format(n=n)}"


def url_parte_espelho(pasta_copia: str, n: int, cfg: Config = CONFIG) -> str:
    """URL de uma parte no espelho (pasta = data da cópia AAAA-MM-DD)."""
    if not PADRAO_PASTA_ESPELHO.match(pasta_copia):
        raise ValueError(f"pasta do espelho inválida: {pasta_copia!r} (esperado AAAA-MM-DD)")
    if not 0 <= n < NUM_PARTES:
        raise ValueError(f"parte inválida: {n} (esperado 0 a {NUM_PARTES - 1})")
    return f"{cfg.url_espelho}{pasta_copia}/{NOME_PARTE.format(n=n)}"


def url_pasta(fonte: str, competencia: str, http: requests.Session | None = None,
              cfg: Config = CONFIG) -> str:
    """URL da pasta da competência na fonte (para o manifesto e os metadados)."""
    if fonte == "espelho":
        return f"{cfg.url_espelho}{pasta_espelho(competencia, http, cfg)}/"
    if not PADRAO_PASTA.match(competencia):
        raise ValueError(f"pasta inválida: {competencia!r} (esperado AAAA-MM)")
    return f"{cfg.url_base}{competencia}/"


def localizar_parte(fonte: str, competencia: str, n: int, http: requests.Session | None = None,
                    cfg: Config = CONFIG) -> tuple[str, bool]:
    """(URL da parte na fonte, se o GET deve levar o Basic auth do compartilhamento)."""
    if fonte == "espelho":
        return url_parte_espelho(pasta_espelho(competencia, http, cfg), n, cfg), False
    return url_parte(competencia, n, cfg), True


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


def _abrir_trecho(url: str, posicao: int, http: requests.Session, cfg: Config,
                  autenticar: bool = True) -> requests.Response:
    """GET em streaming a partir de `posicao` (Range só quando há algo em disco).
    O Basic auth só vai para o WebDAV oficial; o espelho é aberto."""
    cabecalhos = {"Range": f"bytes={posicao}-"} if posicao else {}
    return http.get(url, stream=True, headers=cabecalhos,
                    auth=autenticacao(cfg) if autenticar else None, timeout=timeout(cfg))


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
           cfg: Config = CONFIG, autenticar: bool = True) -> int:
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
            with _abrir_trecho(url, antes, http, cfg, autenticar) as resp:
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
                        help="imprime '<competência> <fonte>': a mais recente com as 10 partes")
    parser.add_argument("--fonte", choices=FONTES, default="auto",
                        help="oficial (WebDAV da Receita), espelho ou auto (padrão: sonda a oficial)")
    parser.add_argument("--pasta", help="competência AAAA-MM informada à mão: só confere se "
                                        "está completa na fonte, em vez de procurar a mais recente")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if not args.listar:
        parser.print_help()
        return 2
    if args.pasta and not PADRAO_PASTA.match(args.pasta):
        parser.error(f"--pasta deve ser AAAA-MM, recebido {args.pasta!r}")
    try:
        fonte = escolher_fonte(args.fonte)
        if args.pasta:
            if not competencia_completa(args.pasta, fonte):
                raise common.FonteIndisponivel(
                    f"competência {args.pasta} sem as {NUM_PARTES} partes na fonte {fonte}")
            pasta = args.pasta
        else:
            pasta = pasta_mais_recente(fonte=fonte)
    except common.FonteIndisponivel as exc:
        log.error("ERRO: %s", exc)
        return 1
    # Competência e fonte vão para stdout de propósito: o workflow captura os dois
    # valores ($GITHUB_OUTPUT); os logs ficam em stderr.
    sys.stdout.write(f"{pasta} {fonte}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
