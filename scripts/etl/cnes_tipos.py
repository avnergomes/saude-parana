# -*- coding: utf-8 -*-
"""
Agrupamento dos tipos de unidade do CNES (TP_UNIDADE) nas famílias do dashboard.

Tabela conferida em 2026-09-13 contra a API DEMAS `/cnes/tipounidades`
(39 códigos). Códigos fora da tabela (ex.: o legado "16", ainda presente em
alguns cadastros do PR) caem em "outros". Os códigos são comparados sem zeros
à esquerda, porque o CSV do CNES traz "5" e o arquivo de leitos traz "05".
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Grupo:
    codigo: str
    nome: str
    tipos: frozenset[str]  # TP_UNIDADE sem zeros à esquerda


OUTROS = "outros"

GRUPOS: tuple[Grupo, ...] = (
    Grupo("ubs", "Unidades básicas de saúde", frozenset({
        "1",   # POSTO DE SAUDE
        "2",   # CENTRO DE SAUDE/UNIDADE BASICA
        "71",  # CENTRO DE APOIO A SAUDE DA FAMILIA
        "72",  # UNIDADE DE ATENCAO A SAUDE INDIGENA
    })),
    Grupo("hospital", "Hospitais", frozenset({
        "5",   # HOSPITAL GERAL
        "7",   # HOSPITAL ESPECIALIZADO
        "15",  # UNIDADE MISTA
        "62",  # HOSPITAL/DIA - ISOLADO
    })),
    Grupo("pronto_atendimento", "Pronto atendimento e pronto socorro", frozenset({
        "20",  # PRONTO SOCORRO GERAL
        "21",  # PRONTO SOCORRO ESPECIALIZADO
        "73",  # PRONTO ATENDIMENTO (UPA)
    })),
    Grupo("atencao_psicossocial", "Atenção psicossocial (CAPS)", frozenset({
        "70",  # CENTRO DE ATENCAO PSICOSSOCIAL
    })),
    Grupo("clinica_consultorio", "Clínicas, policlínicas e consultórios", frozenset({
        "4",   # POLICLINICA
        "22",  # CONSULTORIO ISOLADO
        "36",  # CLINICA/CENTRO DE ESPECIALIDADE
        "61",  # CENTRO DE PARTO NORMAL - ISOLADO
    })),
    Grupo("diagnostico", "Diagnóstico, laboratórios e hemoterapia", frozenset({
        "39",  # UNIDADE DE APOIO DIAGNOSE E TERAPIA (SADT ISOLADO)
        "67",  # LABORATORIO CENTRAL DE SAUDE PUBLICA LACEN
        "69",  # CENTRO DE ATENCAO HEMOTERAPIA E OU HEMATOLOGICA
        "80",  # LABORATORIO DE SAUDE PUBLICA
    })),
    Grupo("farmacia", "Farmácias", frozenset({
        "43",  # FARMACIA
    })),
    Grupo("vigilancia_gestao", "Vigilância, regulação e gestão", frozenset({
        "50",  # UNIDADE DE VIGILANCIA EM SAUDE
        "64",  # CENTRAL DE REGULACAO DE SERVICOS DE SAUDE
        "68",  # CENTRAL DE GESTAO EM SAUDE (secretarias de saúde)
        "75",  # TELESSAUDE
        "76",  # CENTRAL DE REGULACAO MEDICA DAS URGENCIAS
        "81",  # CENTRAL DE REGULACAO DO ACESSO
        "82",  # CENTRAL DE NOTIFICACAO, CAPTACAO E DISTRIB DE ORGAOS ESTADUAL
        "84",  # CENTRAL DE ABASTECIMENTO
    })),
    # "outros": unidades móveis (32, 40, 42), cooperativas (60), polo academia
    # (74), home care (77), residencial (78), oficina ortopédica (79), polo de
    # prevenção (83), centro de imunização (85) e códigos desconhecidos.
    Grupo(OUTROS, "Outros", frozenset()),
)

CODIGOS: tuple[str, ...] = tuple(g.codigo for g in GRUPOS)
PONTOS: frozenset[str] = frozenset({"hospital", "pronto_atendimento"})

_GRUPO_POR_TIPO: dict[str, str] = {tipo: g.codigo for g in GRUPOS for tipo in g.tipos}


def normalizar_tipo(valor: str) -> str:
    """"05" -> "5"; "" -> ""."""
    limpo = valor.strip()
    return (limpo.lstrip("0") or "0") if limpo else ""


def grupo_de(tp_unidade: str) -> str:
    """Família do dashboard para um TP_UNIDADE (com ou sem zeros à esquerda)."""
    return _GRUPO_POR_TIPO.get(normalizar_tipo(tp_unidade), OUTROS)


def contar_tipos(grupos: Iterable[str]) -> list[dict]:
    """Totais por família (todas, mesmo zeradas), do maior para o menor;
    empates mantêm a ordem de GRUPOS (sort estável)."""
    contagem = Counter(grupos)
    tipos = [{"codigo": g.codigo, "nome": g.nome, "total": contagem.get(g.codigo, 0)}
             for g in GRUPOS]
    return sorted(tipos, key=lambda t: -t["total"])
