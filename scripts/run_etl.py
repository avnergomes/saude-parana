#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Orquestra os ETLs de domínio (scripts/etl/*): baixa, processa e grava os
JSONs do dashboard em dashboard/public/data.

Uso: python scripts/run_etl.py [--dominio cnes,sim_cid,...] [--listar]

Cada domínio é independente. Se a fonte falhar e já existir a saída
anterior, ela é mantida (aviso); se não existir saída, o job falha. O
manifesto (data/raw/_manifest.json) é salvo após cada domínio, para não
perder progresso quando um deles quebra.
"""

from __future__ import annotations

import argparse
import importlib
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from etl import common  # noqa: E402

DOMINIOS: tuple[str, ...] = ("cnes", "sim_cid", "sih", "siops", "aps", "infodengue", "ans")

log = logging.getLogger("run_etl")


def executar_dominio(nome: str, manifesto: dict) -> tuple[dict, bool]:
    """Roda um domínio; devolve (manifesto, sucesso). Nunca levanta exceção."""
    try:
        modulo = importlib.import_module(f"etl.{nome}")
    except ModuleNotFoundError as exc:
        log.warning("Domínio %s não implementado (%s); pulando.", nome, exc)
        return manifesto, True

    log.info("=" * 60)
    log.info("Domínio: %s -> %s", nome, modulo.SAIDA)
    try:
        return modulo.executar(manifesto), True
    except Exception:  # noqa: BLE001  (isola falhas por fonte, de propósito)
        saida = common.PUBLIC_DATA_DIR / modulo.SAIDA
        if saida.exists():
            log.exception("Fonte %s falhou; mantendo a saída anterior (%s).", nome, modulo.SAIDA)
            return manifesto, True
        log.exception("Fonte %s falhou e não há saída anterior.", nome)
        return manifesto, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dominio", help="lista separada por vírgula (padrão: todos)")
    parser.add_argument("--listar", action="store_true", help="lista os domínios e sai")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if args.listar:
        for d in DOMINIOS:
            log.info(d)
        return 0

    selecionados = [d.strip() for d in args.dominio.split(",")] if args.dominio else list(DOMINIOS)
    invalidos = [d for d in selecionados if d not in DOMINIOS]
    if invalidos:
        log.error("Domínios desconhecidos: %s (válidos: %s)", invalidos, ", ".join(DOMINIOS))
        return 2

    manifesto = common.carregar_manifesto()
    falhas: list[str] = []
    for nome in selecionados:
        manifesto, ok = executar_dominio(nome, manifesto)
        common.salvar_manifesto(manifesto)
        if not ok:
            falhas.append(nome)

    if falhas:
        log.error("ERRO: domínios sem saída: %s", ", ".join(falhas))
        return 1
    log.info("Concluído.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
