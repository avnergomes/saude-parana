#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Download de dados REAIS para o dashboard Saúde Paraná.

Fontes (todas oficiais, via API SIDRA/IBGE):
  - Óbitos por município/ano ............ Tabela 2654 (v/343), 2003-
    (óbitos ocorridos no ano, por lugar de residência do falecido)
  - Óbitos por sexo e faixa etária (PR) . Tabela 2654, último ano
  - Nascidos vivos por município/ano .... Tabela 2609 (v/217)
    (nascidos vivos REGISTRADOS no ano, por residência da mãe; inclui
    registros tardios de anos anteriores, cerca de 1% ao ano)
  - População estimada por município .... Tabela 6579 (v/9324), 2001-
  - População da Contagem/Censos ........ Tabelas 793 (2007), 1378 (2010)
    e 4714 (2022), para os anos que a t6579 não cobre

Cada arquivo só é reescrito quando o conteúdo muda. O manifesto
data/raw/_manifest.json guarda o sha256 e a data da última mudança real de
cada arquivo; o preprocess usa essa data como "atualizacao". Assim o
pipeline mensal não gera commits vazios só por causa do timestamp.

Uso: python scripts/download_data.py [--only TEXTO]
     (--only baixa apenas as consultas cujo nome de arquivo contém TEXTO)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
MANIFEST_PATH = RAW_DIR / "_manifest.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; saude-parana/2.1; "
    "+https://github.com/avnergomes/saude-parana)"
}
SIDRA = "https://apisidra.ibge.gov.br/values"
TIMEOUT_S = 240
TENTATIVAS = 3
PAUSA_ENTRE_CONSULTAS_S = 2

# Faixas quinquenais da classificação c260 da Tabela 2654 (nível 2),
# + "Menos de 1 ano" (nível 1). Os grupos 80+ são agregados no preprocess.
FAIXAS_OBITOS = (
    "5922,5948,5953,5959,5966,5967,5968,5969,5970,5971,5972,5973,5974,"
    "5975,5976,5977,5978,5979,106181,106182,106183,5996"
)

# Filtro "todos os municípios do Paraná" (n6 dentro de n3/41).
MUN_PR = "n6/in%20n3%2041"


@dataclass(frozen=True)
class Consulta:
    arquivo: str
    url: str
    descricao: str


CONSULTAS: tuple[Consulta, ...] = (
    Consulta(
        "obitos_municipios_pr.json",
        f"{SIDRA}/t/2654/{MUN_PR}/v/343/p/all/c244/0/c1836/0/c2/0/c260/0/c257/0",
        "Óbitos por município/ano (Registro Civil, t2654, residência do falecido)",
    ),
    Consulta(
        "obitos_piramide_pr.json",
        f"{SIDRA}/t/2654/n3/41/v/343/p/last%201/c244/0/c1836/0/c2/4,5/c260/{FAIXAS_OBITOS}/c257/0",
        "Óbitos por sexo e faixa etária, PR, último ano (t2654)",
    ),
    Consulta(
        "nascidos_municipios_pr.json",
        f"{SIDRA}/t/2609/{MUN_PR}/v/217/p/all/c232/0/c240/0/c2/0",
        "Nascidos vivos registrados por município/ano (Registro Civil, t2609)",
    ),
    Consulta(
        "populacao_anos_pr.json",
        f"{SIDRA}/t/6579/{MUN_PR}/v/9324/p/all",
        "População estimada por município/ano (t6579)",
    ),
    Consulta(
        "populacao_censo_2007_pr.json",
        f"{SIDRA}/t/793/{MUN_PR}/v/93/p/all",
        "População por município, Contagem 2007 (t793)",
    ),
    Consulta(
        "populacao_censo_2010_pr.json",
        f"{SIDRA}/t/1378/{MUN_PR}/v/93/p/all/c1/0/c2/0/c287/0/c455/0",
        "População por município, Censo 2010 (t1378)",
    ),
    Consulta(
        "populacao_censo_2022_pr.json",
        f"{SIDRA}/t/4714/{MUN_PR}/v/93/p/all",
        "População por município, Censo 2022 (t4714)",
    ),
)

log = logging.getLogger("download")


def serializar(rows: list) -> str:
    """Serialização canônica: a mesma string é usada no hash e no arquivo."""
    return json.dumps(rows, ensure_ascii=False)


def sha256_texto(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def fetch_sidra(url: str, descricao: str) -> list:
    """Busca uma consulta SIDRA e devolve as linhas de dados (sem o cabeçalho)."""
    log.info("Baixando: %s", descricao)
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT_S)
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, list) or len(data) <= 1:
                raise ValueError("resposta vazia ou só cabeçalho")
            log.info("  OK: %d registros", len(data) - 1)
            return data[1:]
        except (requests.RequestException, ValueError) as exc:
            log.warning("  tentativa %d/%d falhou: %s", tentativa, TENTATIVAS, exc)
            if tentativa < TENTATIVAS:
                time.sleep(15 * tentativa)
    return []


def carregar_manifesto() -> dict:
    if not MANIFEST_PATH.exists():
        return {}
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def salvar_manifesto(manifesto: dict) -> None:
    MANIFEST_PATH.write_text(
        json.dumps(manifesto, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def registrar(manifesto: dict, consulta: Consulta, rows: list) -> dict:
    """Grava o arquivo só se o conteúdo mudou; devolve um novo manifesto."""
    texto = serializar(rows)
    digest = sha256_texto(texto)
    destino = RAW_DIR / consulta.arquivo
    anterior = manifesto.get(consulta.arquivo, {})
    inalterado = anterior.get("sha256") == digest and destino.exists()

    if inalterado:
        log.info("  sem mudança: %s", consulta.arquivo)
    else:
        destino.write_text(texto, encoding="utf-8")
        log.info("  gravado: %s (%d KB)", consulta.arquivo, len(texto.encode("utf-8")) // 1024)

    entrada = {
        "descricao": consulta.descricao,
        "url": consulta.url,
        "linhas": len(rows),
        "sha256": digest,
        "alterado_em": (anterior.get("alterado_em") or date.today().isoformat())
        if inalterado
        else date.today().isoformat(),
    }
    return {**manifesto, consulta.arquivo: entrada}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--only", help="baixa só as consultas cujo arquivo contém este texto")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    log.info("=" * 60)
    log.info("Saúde Paraná, download de dados reais (IBGE/SIDRA)")
    log.info("=" * 60)

    consultas = [c for c in CONSULTAS if not args.only or args.only in c.arquivo]
    manifesto = carregar_manifesto()
    falhas: list[str] = []

    for consulta in consultas:
        rows = fetch_sidra(consulta.url, consulta.descricao)
        if rows:
            manifesto = registrar(manifesto, consulta, rows)
        else:
            falhas.append(consulta.arquivo)
        time.sleep(PAUSA_ENTRE_CONSULTAS_S)

    salvar_manifesto(manifesto)

    if falhas:
        # Falhar alto: seguir com dados parciais geraria um dashboard furado
        log.error("ERRO: downloads sem dados: %s", ", ".join(falhas))
        return 1

    log.info("Concluído.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
